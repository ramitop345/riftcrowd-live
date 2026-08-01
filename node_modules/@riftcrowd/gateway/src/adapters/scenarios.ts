/**
 * Scripted scenarios for MockLiveAdapter playback.
 *
 * Each scenario exports a name, duration, and array of ScheduledEvent objects
 * (timeMs + NormalizedLiveEvent). Scenarios are deterministic: same input → same output.
 *
 * Seven scenarios: normal_traffic, gift_streak, viral_burst, malformed_payloads,
 * disconnect, reconnect, four_mode_round.
 */

import type { NormalizedLiveEvent } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Scenario type
// ---------------------------------------------------------------------------

export interface ScheduledEvent {
  timeMs: number;
  event: NormalizedLiveEvent;
}

export interface Scenario {
  name: string;
  events: ScheduledEvent[];
  durationMs: number;
}

// ---------------------------------------------------------------------------
// Builder helpers — create valid NormalizedLiveEvent objects
// ---------------------------------------------------------------------------

let eventCounter = 0;

/** Resets the event counter (call before building a scenario for deterministic IDs). */
export function resetEventCounter(): void {
  eventCounter = 0;
}

function nextId(): string {
  eventCounter++;
  return `evt_mock_${String(eventCounter).padStart(6, '0')}`;
}

function isoTime(ms: number): string {
  return new Date(ms).toISOString();
}

function makeHash(id: string, extra: string = ''): string {
  return `sha256:mock_${id}_${extra}`.slice(0, 128);
}

export interface ChatEventOpts {
  timeMs: number;
  viewerId: string;
  handle?: string;
  displayName?: string;
  comment: string;
}

export function makeChatEvent(opts: ChatEventOpts): ScheduledEvent {
  const id = nextId();
  return {
    timeMs: opts.timeMs,
    event: {
      schemaVersion: 1,
      id,
      provider: 'mock',
      type: 'chat',
      receivedAt: isoTime(opts.timeMs),
      user: {
        id: opts.viewerId,
        handle: opts.handle ?? `@${opts.viewerId}`,
        displayName: opts.displayName ?? opts.viewerId,
      },
      comment: opts.comment,
      rawHash: makeHash(id, opts.comment),
    },
  };
}

export interface GiftEventOpts {
  timeMs: number;
  viewerId: string;
  giftId?: string;
  giftName?: string;
  repeatCount?: number;
  streakId?: string;
  streakEnded?: boolean;
  providerValue?: number;
}

export function makeGiftEvent(opts: GiftEventOpts): ScheduledEvent {
  const id = nextId();
  return {
    timeMs: opts.timeMs,
    event: {
      schemaVersion: 1,
      id,
      provider: 'mock',
      type: 'gift',
      receivedAt: isoTime(opts.timeMs),
      user: {
        id: opts.viewerId,
        handle: `@${opts.viewerId}`,
        displayName: opts.viewerId,
      },
      gift: {
        id: opts.giftId ?? 'gift_rose',
        name: opts.giftName ?? 'Rose',
        repeatCount: opts.repeatCount ?? 1,
        streakId: opts.streakId,
        streakEnded: opts.streakEnded,
        providerValue: opts.providerValue,
      },
      rawHash: makeHash(id, 'gift'),
    },
  };
}

export function makeLikeEvent(timeMs: number, viewerId: string, count: number = 1): ScheduledEvent {
  const id = nextId();
  return {
    timeMs,
    event: {
      schemaVersion: 1,
      id,
      provider: 'mock',
      type: 'like',
      receivedAt: isoTime(timeMs),
      user: { id: viewerId, handle: `@${viewerId}`, displayName: viewerId },
      likeCount: count,
      rawHash: makeHash(id, 'like'),
    },
  };
}

export function makeJoinEvent(timeMs: number, viewerId: string): ScheduledEvent {
  const id = nextId();
  return {
    timeMs,
    event: {
      schemaVersion: 1,
      id,
      provider: 'mock',
      type: 'join',
      receivedAt: isoTime(timeMs),
      user: { id: viewerId, handle: `@${viewerId}`, displayName: viewerId },
      rawHash: makeHash(id, 'join'),
    },
  };
}

/**
 * Creates a malformed event that will fail normalization.
 * Uses a provider_status type with invalid fields to guarantee rejection.
 */
export function makeMalformedEvent(timeMs: number, kind: string): ScheduledEvent {
  const id = nextId();
  // Different kinds of malformation
  switch (kind) {
    case 'missing_user':
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          id,
          provider: 'mock',
          type: 'chat',
          receivedAt: isoTime(timeMs),
          comment: 'hello',
          rawHash: makeHash(id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    case 'wrong_type':
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          id,
          provider: 'mock',
          type: 'invalid_type',
          receivedAt: isoTime(timeMs),
          user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
          rawHash: makeHash(id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    case 'missing_id':
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          provider: 'mock',
          type: 'chat',
          receivedAt: isoTime(timeMs),
          user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
          rawHash: makeHash(id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    case 'invalid_schema_version':
      return {
        timeMs,
        event: {
          schemaVersion: 99,
          id,
          provider: 'mock',
          type: 'chat',
          receivedAt: isoTime(timeMs),
          user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
          rawHash: makeHash(id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    case 'empty_user_id':
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          id,
          provider: 'mock',
          type: 'chat',
          receivedAt: isoTime(timeMs),
          user: { id: '', handle: '@v1', displayName: 'Viewer' },
          rawHash: makeHash(id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    case 'null_input':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { timeMs, event: null as any };
    case 'array_input':
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return { timeMs, event: [] as any };
    case 'control_chars':
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          id,
          provider: 'mock',
          type: 'chat',
          receivedAt: isoTime(timeMs),
          user: { id: 'v1', handle: '@v1', displayName: '\x00\x01Bad\x7F' },
          comment: 'test\x00\x01\x02',
          rawHash: makeHash(id),
        },
      };
    case 'overlength_comment':
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          id,
          provider: 'mock',
          type: 'chat',
          receivedAt: isoTime(timeMs),
          user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
          comment: 'x'.repeat(600),
          rawHash: makeHash(id),
        },
      };
    case 'invalid_viewer_id_type':
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          id,
          provider: 'mock',
          type: 'chat',
          receivedAt: isoTime(timeMs),
          user: { id: 12345, handle: '@v1', displayName: 'Viewer' },
          rawHash: makeHash(id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
    default:
      return {
        timeMs,
        event: {
          schemaVersion: 1,
          id,
          provider: 'mock',
          type: 'chat',
          receivedAt: 'not-a-date',
          user: { id: 'v1', handle: '@v1', displayName: 'Viewer' },
          rawHash: makeHash(id),
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any,
      };
  }
}

// ---------------------------------------------------------------------------
// Viewer pools
// ---------------------------------------------------------------------------

function viewerPool(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `viewer_${String(i + 1).padStart(3, '0')}`);
}

// ---------------------------------------------------------------------------
// Scenario 1: normal_traffic
// 50 chat events from 10 unique viewers over 2 minutes (120,000 ms)
// Includes mode votes, faction joins, and general chat
// ---------------------------------------------------------------------------

export function normalTraffic(): Scenario {
  resetEventCounter();
  const viewers = viewerPool(10);
  const events: ScheduledEvent[] = [];
  const durationMs = 120_000; // 2 minutes

  // Mode votes at t=1s–10s (all vote for mode 1 = countries)
  for (let i = 0; i < 10; i++) {
    events.push(makeChatEvent({
      timeMs: 1000 + i * 1000,
      viewerId: viewers[i]!,
      comment: '1',
    }));
  }

  // Faction joins at t=25s–44s (alternate between faction_alpha and faction_beta)
  for (let i = 0; i < 20 && i < viewers.length * 2; i++) {
    const viewer = viewers[i % viewers.length]!;
    const faction = i % 2 === 0 ? 'faction_alpha' : 'faction_beta';
    events.push(makeChatEvent({
      timeMs: 25_000 + i * 1000,
      viewerId: viewer,
      comment: faction,
    }));
  }

  // General chat at t=50s–110s (~20 events spread out)
  const chatMessages = ['gg', 'nice', 'go go go', 'push now', 'defend base',
    'focus left', 'retreat', 'wow', 'lol', 'good game',
    'lets go', 'come on', 'yes', 'no', 'amazing',
    'great play', 'close one', 'well played', 'thanks', 'bye'];
  for (let i = 0; i < 20; i++) {
    events.push(makeChatEvent({
      timeMs: 50_000 + i * 3000,
      viewerId: viewers[i % viewers.length]!,
      comment: chatMessages[i]!,
    }));
  }

  return { name: 'normal_traffic', events, durationMs };
}

// ---------------------------------------------------------------------------
// Scenario 2: gift_streak
// 30 gift events from 1 viewer over 30 seconds (30,000 ms)
// ---------------------------------------------------------------------------

export function giftStreak(): Scenario {
  resetEventCounter();
  const events: ScheduledEvent[] = [];
  const durationMs = 30_000;
  const viewer = 'gift_viewer';
  const streakId = 'streak_001';

  for (let i = 0; i < 30; i++) {
    events.push(makeGiftEvent({
      timeMs: i * 1000,
      viewerId: viewer,
      giftId: 'gift_rose',
      giftName: 'Rose',
      repeatCount: 1,
      streakId,
      streakEnded: i === 29,
      providerValue: 1,
    }));
  }

  return { name: 'gift_streak', events, durationMs };
}

// ---------------------------------------------------------------------------
// Scenario 3: viral_burst
// 200 chat events from 50 viewers in 10 seconds (10,000 ms)
// Stress test — pipeline should rate-limit gracefully
// ---------------------------------------------------------------------------

export function viralBurst(): Scenario {
  resetEventCounter();
  const viewers = viewerPool(50);
  const events: ScheduledEvent[] = [];
  const durationMs = 10_000;

  for (let i = 0; i < 200; i++) {
    const viewer = viewers[i % viewers.length]!;
    events.push(makeChatEvent({
      timeMs: Math.floor((i / 200) * 10_000),
      viewerId: viewer,
      comment: `burst message ${i + 1}`,
    }));
  }

  return { name: 'viral_burst', events, durationMs };
}

// ---------------------------------------------------------------------------
// Scenario 4: malformed_payloads
// 20 malformed events + 10 valid events interspersed
// ---------------------------------------------------------------------------

export function malformedPayloads(): Scenario {
  resetEventCounter();
  const events: ScheduledEvent[] = [];
  const durationMs = 30_000;

  const malformedKinds = [
    'missing_user', 'wrong_type', 'missing_id', 'invalid_schema_version',
    'empty_user_id', 'null_input', 'array_input', 'control_chars',
    'overlength_comment', 'invalid_viewer_id_type',
    'missing_user', 'wrong_type', 'missing_id', 'invalid_schema_version',
    'empty_user_id', 'null_input', 'array_input', 'control_chars',
    'overlength_comment', 'invalid_viewer_id_type',
  ];

  // Intersperse: 2 malformed, 1 valid, repeat 10 times
  for (let i = 0; i < 10; i++) {
    const base = i * 3000;
    events.push(makeMalformedEvent(base, malformedKinds[i * 2]!));
    events.push(makeMalformedEvent(base + 500, malformedKinds[i * 2 + 1]!));
    events.push(makeChatEvent({
      timeMs: base + 1500,
      viewerId: `valid_viewer_${i}`,
      comment: `valid message ${i}`,
    }));
  }

  // Sort by time
  events.sort((a, b) => a.timeMs - b.timeMs);
  return { name: 'malformed_payloads', events, durationMs };
}

// ---------------------------------------------------------------------------
// Scenario 5: disconnect
// Simulate connection drop mid-stream
// Events for 10s, then disconnect marker at 10s
// ---------------------------------------------------------------------------

export function disconnect(): Scenario {
  resetEventCounter();
  const events: ScheduledEvent[] = [];
  const durationMs = 15_000;

  // 5 events before disconnect
  for (let i = 0; i < 5; i++) {
    events.push(makeChatEvent({
      timeMs: i * 2000,
      viewerId: `viewer_${i}`,
      comment: `pre-disconnect ${i}`,
    }));
  }

  // Disconnect marker: provider_status event with special comment
  events.push(makeChatEvent({
    timeMs: 10_000,
    viewerId: '__system__',
    displayName: 'System',
    comment: '__disconnect__',
  }));

  return { name: 'disconnect', events, durationMs };
}

// ---------------------------------------------------------------------------
// Scenario 6: reconnect
// Simulate reconnect after disconnect
// ---------------------------------------------------------------------------

export function reconnect(): Scenario {
  resetEventCounter();
  const events: ScheduledEvent[] = [];
  const durationMs = 25_000;

  // 3 events before disconnect
  for (let i = 0; i < 3; i++) {
    events.push(makeChatEvent({
      timeMs: i * 2000,
      viewerId: `viewer_${i}`,
      comment: `pre-disconnect ${i}`,
    }));
  }

  // Disconnect at 6s
  events.push(makeChatEvent({
    timeMs: 6_000,
    viewerId: '__system__',
    displayName: 'System',
    comment: '__disconnect__',
  }));

  // Reconnect at 12s
  events.push(makeChatEvent({
    timeMs: 12_000,
    viewerId: '__system__',
    displayName: 'System',
    comment: '__reconnect__',
  }));

  // 5 events after reconnect
  for (let i = 0; i < 5; i++) {
    events.push(makeChatEvent({
      timeMs: 14_000 + i * 2000,
      viewerId: `viewer_${i + 10}`,
      comment: `post-reconnect ${i}`,
    }));
  }

  return { name: 'reconnect', events, durationMs };
}

// ---------------------------------------------------------------------------
// Scenario 7: four_mode_round
// End-to-end round: mode vote → faction lobby → battle → results → next mode vote
// ~6 minutes simulated time
// ---------------------------------------------------------------------------

export function fourModeRound(): Scenario {
  resetEventCounter();
  const events: ScheduledEvent[] = [];

  // Timeline (in seconds):
  // 0–20:     MODE_VOTE (10 viewers vote mode 1 = countries)
  // 20–55:    FACTION_LOBBY (20 viewers join 2 factions)
  // 55–175:   BATTLE_OPENING (120s)
  // 175–235:  BATTLE_CRISIS (60s)
  // 235–295:  BATTLE_FINAL_SURGE (60s)
  // 295–340:  BATTLE_SUDDEN_DEATH (45s)
  // 340–360:  RESULTS (20s)
  // 360–380:  MODE_VOTE (next round)

  const viewers = viewerPool(20);

  // --- MODE_VOTE (0–20s): 10 voters pick mode 1 (countries) ---
  for (let i = 0; i < 10; i++) {
    events.push(makeChatEvent({
      timeMs: 1000 + i * 1500,
      viewerId: viewers[i]!,
      comment: '1',
    }));
  }

  // --- FACTION_LOBBY (25–50s): 20 viewers join 2 factions ---
  for (let i = 0; i < 20; i++) {
    const faction = i % 2 === 0 ? 'faction_alpha' : 'faction_beta';
    events.push(makeChatEvent({
      timeMs: 25_000 + i * 1000,
      viewerId: viewers[i]!,
      comment: faction,
    }));
  }

  // --- BATTLE phase (60–335s): periodic chat to keep engagement ---
  for (let i = 0; i < 30; i++) {
    events.push(makeChatEvent({
      timeMs: 60_000 + i * 9000,
      viewerId: viewers[i % viewers.length]!,
      comment: ['push', 'defend', 'focus', 'retreat'][i % 4]!,
    }));
  }

  // --- RESULTS (345s): a few celebration messages ---
  for (let i = 0; i < 5; i++) {
    events.push(makeChatEvent({
      timeMs: 345_000 + i * 2000,
      viewerId: viewers[i]!,
      comment: 'gg',
    }));
  }

  // --- Next MODE_VOTE (365s): 5 voters pick mode 2 (animals) ---
  for (let i = 0; i < 5; i++) {
    events.push(makeChatEvent({
      timeMs: 365_000 + i * 2000,
      viewerId: viewers[i]!,
      comment: '2',
    }));
  }

  const durationMs = 385_000; // 6 min 25 sec
  return { name: 'four_mode_round', events, durationMs };
}

// ---------------------------------------------------------------------------
// Scenario registry
// ---------------------------------------------------------------------------

export const SCENARIO_REGISTRY: Record<string, () => Scenario> = {
  normal_traffic: normalTraffic,
  gift_streak: giftStreak,
  viral_burst: viralBurst,
  malformed_payloads: malformedPayloads,
  disconnect,
  reconnect,
  four_mode_round: fourModeRound,
};

/** Returns a scenario by name, or throws if not found. */
export function getScenario(name: string): Scenario {
  const factory = SCENARIO_REGISTRY[name];
  if (!factory) {
    throw new Error(`Unknown scenario: ${name}. Available: ${Object.keys(SCENARIO_REGISTRY).join(', ')}`);
  }
  return factory();
}

/** Returns all available scenario names. */
export function listScenarios(): string[] {
  return Object.keys(SCENARIO_REGISTRY);
}
