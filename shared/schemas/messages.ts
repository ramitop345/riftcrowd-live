import { z } from 'zod';

import { GameCommandSchema } from './commands.js';
import { NormalizedLiveEventSchema } from './events.js';

/**
 * Version of the WebSocket envelope protocol between the gateway and the Godot client. Bump this
 * whenever a message kind, field name, or field type changes. Payload models carry their own schema
 * versions; this constant covers only the envelope.
 */
export const PROTOCOL_VERSION = 1;

/** Typed, non-fatal reasons the gateway or game rejects a frame. */
export const ProtocolErrorCodeSchema = z.enum([
  'INVALID_MESSAGE',
  'UNSUPPORTED_VERSION',
  'UNAUTHORIZED',
  'QUEUE_FULL',
  'INTERNAL',
]);

/** Envelope carrying one normalized live event (gateway -> observers such as the dashboard). */
export const EventMessageSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kind: z.literal('event'),
    event: NormalizedLiveEventSchema,
  })
  .strict();

/** Envelope carrying one game command (gateway -> game). */
export const CommandMessageSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kind: z.literal('command'),
    command: GameCommandSchema,
  })
  .strict();

/** The game acknowledges a command id so the gateway can drop it from the retry buffer. */
export const AckMessageSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kind: z.literal('ack'),
    commandId: z.string().min(1).max(128),
    receivedAt: z.string().datetime(),
  })
  .strict();

/** Typed, non-fatal rejection of a frame, including validation failures. Never carries secrets. */
export const ErrorMessageSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kind: z.literal('error'),
    code: ProtocolErrorCodeSchema,
    message: z.string().min(1).max(500),
    relatedId: z.string().min(1).max(128).optional(),
  })
  .strict();

/**
 * Full game-state resync after a reconnect. The `state` payload is intentionally loose here; its
 * structure is firmed up in Phase 10 alongside the WebSocket integration.
 */
export const SnapshotMessageSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kind: z.literal('snapshot'),
    sentAt: z.string().datetime(),
    state: z.record(z.string(), z.unknown()),
  })
  .strict();

/** Periodic liveness signal. A missed heartbeat triggers reconnect-with-backoff on either side. */
export const HeartbeatMessageSchema = z
  .object({
    protocolVersion: z.literal(PROTOCOL_VERSION),
    kind: z.literal('heartbeat'),
    sentAt: z.string().datetime(),
    sequence: z.number().int().min(0),
  })
  .strict();

/** Every frame that may cross the gateway/game WebSocket, discriminated by `kind`. */
export const ProtocolMessageSchema = z.discriminatedUnion('kind', [
  EventMessageSchema,
  CommandMessageSchema,
  AckMessageSchema,
  ErrorMessageSchema,
  SnapshotMessageSchema,
  HeartbeatMessageSchema,
]);

export type ProtocolErrorCode = z.infer<typeof ProtocolErrorCodeSchema>;
export type EventMessage = z.infer<typeof EventMessageSchema>;
export type CommandMessage = z.infer<typeof CommandMessageSchema>;
export type AckMessage = z.infer<typeof AckMessageSchema>;
export type ErrorMessage = z.infer<typeof ErrorMessageSchema>;
export type SnapshotMessage = z.infer<typeof SnapshotMessageSchema>;
export type HeartbeatMessage = z.infer<typeof HeartbeatMessageSchema>;
export type ProtocolMessage = z.infer<typeof ProtocolMessageSchema>;
