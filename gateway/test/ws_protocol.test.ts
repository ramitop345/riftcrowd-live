/**
 * Phase 10 — WS protocol schema validation tests.
 *
 * Validates each WS message type, rejects malformed messages, and detects
 * version mismatches.
 */

import { describe, it, expect } from 'vitest';
import {
  WS_PROTOCOL_VERSION,
  WsHandshakeSchema,
  WsHandshakeAckSchema,
  WsHeartbeatPingSchema,
  WsHeartbeatPongSchema,
  WsCommandSchema,
  WsCommandAckSchema,
  WsSnapshotSchema,
  WsErrorSchema,
  WsReconnectSchema,
  WsDisconnectSchema,
  WsMessageSchema,
  COMMAND_SCHEMA_VERSION,
} from '@riftcrowd/shared';

const PV = WS_PROTOCOL_VERSION;

function makeCommand() {
  return {
    schemaVersion: COMMAND_SCHEMA_VERSION as const,
    id: 'cmd_test_001',
    type: 'SPAWN_CHAMPION' as const,
    createdAt: new Date().toISOString(),
    sourceEventIds: ['evt_001'],
  };
}

describe('WS Protocol Schema', () => {
  // --- handshake ---
  it('validates a well-formed handshake', () => {
    const msg = {
      type: 'handshake',
      protocolVersion: PV,
      serverId: 'gw_abc',
      heartbeatIntervalMs: 5000,
      retryBufferCapacity: 1000,
      currentSequenceNumber: 42,
    };
    expect(WsHandshakeSchema.parse(msg)).toEqual(msg);
  });

  it('rejects handshake with wrong protocol version', () => {
    expect(() =>
      WsHandshakeSchema.parse({
        type: 'handshake',
        protocolVersion: 999,
        serverId: 'gw_abc',
        heartbeatIntervalMs: 5000,
        retryBufferCapacity: 1000,
        currentSequenceNumber: 0,
      }),
    ).toThrow();
  });

  // --- handshake_ack ---
  it('validates a well-formed handshake_ack', () => {
    const msg = {
      type: 'handshake_ack',
      protocolVersion: PV,
      clientId: 'godot_123',
      lastReceivedSequenceNumber: 10,
    };
    expect(WsHandshakeAckSchema.parse(msg)).toEqual(msg);
  });

  it('rejects handshake_ack with empty clientId', () => {
    expect(() =>
      WsHandshakeAckSchema.parse({
        type: 'handshake_ack',
        protocolVersion: PV,
        clientId: '',
        lastReceivedSequenceNumber: 0,
      }),
    ).toThrow();
  });

  // --- heartbeat ---
  it('validates heartbeat_ping', () => {
    const msg = { type: 'heartbeat_ping', protocolVersion: PV, timestamp: Date.now() };
    expect(WsHeartbeatPingSchema.parse(msg)).toEqual(msg);
  });

  it('validates heartbeat_pong', () => {
    const msg = { type: 'heartbeat_pong', protocolVersion: PV, timestamp: Date.now() };
    expect(WsHeartbeatPongSchema.parse(msg)).toEqual(msg);
  });

  // --- command ---
  it('validates a command message', () => {
    const msg = {
      type: 'command',
      protocolVersion: PV,
      messageId: 'cmd_test_001',
      command: makeCommand(),
      sequenceNumber: 5,
      requiresAck: true,
    };
    expect(WsCommandSchema.parse(msg)).toEqual(msg);
  });

  it('rejects command with negative sequenceNumber', () => {
    expect(() =>
      WsCommandSchema.parse({
        type: 'command',
        protocolVersion: PV,
        messageId: 'cmd_001',
        command: makeCommand(),
        sequenceNumber: -1,
        requiresAck: true,
      }),
    ).toThrow();
  });

  // --- command_ack ---
  it('validates a command_ack', () => {
    const msg = {
      type: 'command_ack',
      protocolVersion: PV,
      messageId: 'cmd_001',
      sequenceNumber: 5,
      status: 'accepted',
    };
    expect(WsCommandAckSchema.parse(msg)).toEqual(msg);
  });

  it('rejects command_ack with invalid status', () => {
    expect(() =>
      WsCommandAckSchema.parse({
        type: 'command_ack',
        protocolVersion: PV,
        messageId: 'cmd_001',
        sequenceNumber: 5,
        status: 'invalid_status',
      }),
    ).toThrow();
  });

  // --- snapshot ---
  it('validates a snapshot message', () => {
    const msg = {
      type: 'snapshot',
      protocolVersion: PV,
      sequenceNumber: 10,
      commands: [makeCommand()],
    };
    expect(WsSnapshotSchema.parse(msg)).toEqual(msg);
  });

  it('validates snapshot with empty commands array', () => {
    const msg = { type: 'snapshot', protocolVersion: PV, sequenceNumber: 0, commands: [] };
    expect(WsSnapshotSchema.parse(msg)).toEqual(msg);
  });

  // --- error ---
  it('validates an error message', () => {
    const msg = {
      type: 'error',
      protocolVersion: PV,
      code: 'UNAUTHORIZED',
      message: 'Token invalid',
    };
    expect(WsErrorSchema.parse(msg)).toEqual(msg);
  });

  it('rejects error with empty code', () => {
    expect(() =>
      WsErrorSchema.parse({
        type: 'error',
        protocolVersion: PV,
        code: '',
        message: 'err',
      }),
    ).toThrow();
  });

  // --- reconnect / disconnect ---
  it('validates a reconnect message', () => {
    const msg = {
      type: 'reconnect',
      protocolVersion: PV,
      clientId: 'godot_123',
      lastReceivedSequenceNumber: 42,
    };
    expect(WsReconnectSchema.parse(msg)).toEqual(msg);
  });

  it('validates a disconnect message', () => {
    const msg = {
      type: 'disconnect',
      protocolVersion: PV,
      reason: 'Server shutting down',
    };
    expect(WsDisconnectSchema.parse(msg)).toEqual(msg);
  });

  // --- discriminated union ---
  it('discriminated union parses all message types', () => {
    const messages = [
      { type: 'handshake', protocolVersion: PV, serverId: 's1', heartbeatIntervalMs: 5000, retryBufferCapacity: 100, currentSequenceNumber: 0 },
      { type: 'handshake_ack', protocolVersion: PV, clientId: 'c1', lastReceivedSequenceNumber: 0 },
      { type: 'heartbeat_ping', protocolVersion: PV, timestamp: 0 },
      { type: 'heartbeat_pong', protocolVersion: PV, timestamp: 0 },
      { type: 'command', protocolVersion: PV, messageId: 'm1', command: makeCommand(), sequenceNumber: 0, requiresAck: true },
      { type: 'command_ack', protocolVersion: PV, messageId: 'm1', sequenceNumber: 0, status: 'accepted' },
      { type: 'snapshot', protocolVersion: PV, sequenceNumber: 0, commands: [] },
      { type: 'error', protocolVersion: PV, code: 'X', message: 'Y' },
      { type: 'reconnect', protocolVersion: PV, clientId: 'c1', lastReceivedSequenceNumber: 0 },
      { type: 'disconnect', protocolVersion: PV, reason: 'bye' },
    ];
    for (const msg of messages) {
      expect(() => WsMessageSchema.parse(msg)).not.toThrow();
    }
  });

  it('rejects unknown type in discriminated union', () => {
    expect(() =>
      WsMessageSchema.parse({ type: 'unknown_type', protocolVersion: PV }),
    ).toThrow();
  });
});
