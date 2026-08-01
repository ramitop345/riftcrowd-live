/**
 * Phase 15 — Audio unit tests.
 *
 * Tests: AudioConfig (5+), AudioOrchestrator (15+).
 * Total target: ≥20 tests.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AudioConfigSchema,
  AUDIO_DEFAULTS,
  loadAudioConfig,
} from '../src/audio/audio_config.js';
import { AudioOrchestrator } from '../src/audio/audio_orchestrator.js';
import type { NormalizedLiveEvent } from '@riftcrowd/shared';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  type: NormalizedLiveEvent['type'],
  overrides?: Partial<NormalizedLiveEvent>,
): NormalizedLiveEvent {
  const id = `evt_${Math.random().toString(36).slice(2, 10)}`;
  return {
    schemaVersion: 1,
    id,
    provider: 'mock',
    type,
    receivedAt: new Date().toISOString(),
    user: { id: 'viewer-1', handle: '@viewer1', displayName: 'Viewer1' },
    rawHash: `sha256:mock_${id}`,
    ...overrides,
  } as NormalizedLiveEvent;
}

// ===================================================================
// AudioConfig
// ===================================================================

describe('AudioConfig', () => {
  it('validates the default config', () => {
    const result = AudioConfigSchema.safeParse(AUDIO_DEFAULTS);
    expect(result.success).toBe(true);
  });

  it('rejects volume above 100', () => {
    const invalid = {
      ...AUDIO_DEFAULTS,
      volumeGroups: { ...AUDIO_DEFAULTS.volumeGroups, master: 101 },
    };
    expect(AudioConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects negative volume', () => {
    const invalid = {
      ...AUDIO_DEFAULTS,
      volumeGroups: { ...AUDIO_DEFAULTS.volumeGroups, master: -1 },
    };
    expect(AudioConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects unknown field (strict)', () => {
    const invalid = { ...AUDIO_DEFAULTS, unknownField: true };
    expect(AudioConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('rejects empty track path', () => {
    const invalid = {
      ...AUDIO_DEFAULTS,
      tracks: { ...AUDIO_DEFAULTS.tracks, backgroundMusic: '' },
    };
    expect(AudioConfigSchema.safeParse(invalid).success).toBe(false);
  });

  it('loadAudioConfig returns defaults on missing file', () => {
    const config = loadAudioConfig('/nonexistent/path.json');
    expect(config.volumeGroups.master).toBe(80);
  });

  it('loadAudioConfig loads from default path', () => {
    const config = loadAudioConfig();
    expect(config.volumeGroups.master).toBe(80);
    expect(config.sfx.hit).toBe('audio/sfx/hit.ogg');
  });
});

// ===================================================================
// AudioOrchestrator
// ===================================================================

describe('AudioOrchestrator', () => {
  let orchestrator: AudioOrchestrator;

  beforeEach(() => {
    orchestrator = new AudioOrchestrator(AUDIO_DEFAULTS);
  });

  it('chat event produces no audio', () => {
    const result = orchestrator.triggerAudio(makeEvent('chat'));
    expect(result.commands).toHaveLength(0);
  });

  it('like event produces hit SFX', () => {
    const result = orchestrator.triggerAudio(makeEvent('like'));
    expect(result.commands.length).toBe(1);
    expect(result.commands[0]!.type).toBe('PLAY_AUDIO');
    expect(result.commands[0]!.metadata?.['track']).toBe('audio/sfx/hit.ogg');
  });

  it('like milestone (>=100) also plays spotlight SFX', () => {
    const result = orchestrator.triggerAudio(
      makeEvent('like', { likeCount: 100 }),
    );
    expect(result.commands.length).toBe(2);
    expect(result.commands[1]!.metadata?.['track']).toBe('audio/sfx/spotlight.ogg');
  });

  it('like non-milestone (<100) does not play spotlight', () => {
    const result = orchestrator.triggerAudio(
      makeEvent('like', { likeCount: 50 }),
    );
    expect(result.commands.length).toBe(1);
  });

  it('follow event plays follow SFX', () => {
    const result = orchestrator.triggerAudio(makeEvent('follow'));
    expect(result.commands.length).toBe(1);
    expect(result.commands[0]!.metadata?.['track']).toBe('audio/sfx/follow.ogg');
  });

  it('share event plays share SFX', () => {
    const result = orchestrator.triggerAudio(makeEvent('share'));
    expect(result.commands.length).toBe(1);
    expect(result.commands[0]!.metadata?.['track']).toBe('audio/sfx/share.ogg');
  });

  it('gift event plays gift SFX', () => {
    const result = orchestrator.triggerAudio(
      makeEvent('gift', {
        gift: { id: 'gift_001', name: 'Rose', repeatCount: 1 },
      }),
    );
    expect(result.commands.length).toBe(1);
    expect(result.commands[0]!.metadata?.['track']).toBe('audio/sfx/gift.ogg');
  });

  it('cinematic gift also plays ability SFX', () => {
    const result = orchestrator.triggerAudio(
      makeEvent('gift', {
        gift: { id: 'gift_015', name: 'Phoenix', repeatCount: 100 },
      }),
    );
    expect(result.commands.length).toBe(2);
    expect(result.commands[1]!.metadata?.['track']).toBe('audio/sfx/ability.ogg');
  });

  it('subscription plays follow + spotlight SFX', () => {
    const result = orchestrator.triggerAudio(makeEvent('subscribe'));
    expect(result.commands.length).toBe(2);
    expect(result.commands[0]!.metadata?.['track']).toBe('audio/sfx/follow.ogg');
    expect(result.commands[1]!.metadata?.['track']).toBe('audio/sfx/spotlight.ogg');
  });

  it('computeVolume applies master × group / 10000', () => {
    // master=80, sfx=90 → 80*90/10000 = 0.72
    const vol = orchestrator.computeVolume('sfx');
    expect(vol).toBeCloseTo(0.72, 2);
  });

  it('computeVolume for music group', () => {
    // master=80, music=60 → 80*60/10000 = 0.48
    const vol = orchestrator.computeVolume('music');
    expect(vol).toBeCloseTo(0.48, 2);
  });

  it('stats increment correctly', () => {
    orchestrator.triggerAudio(makeEvent('like'));
    orchestrator.triggerAudio(makeEvent('follow'));
    const stats = orchestrator.getStats();
    expect(stats.eventsProcessed).toBe(2);
    expect(stats.commandsEmitted).toBe(2);
  });

  it('reloadConfig updates orchestrator', () => {
    const newConfig = {
      ...AUDIO_DEFAULTS,
      volumeGroups: { ...AUDIO_DEFAULTS.volumeGroups, master: 50 },
    };
    orchestrator.reloadConfig(newConfig);
    expect(orchestrator.getConfig().volumeGroups.master).toBe(50);
  });

  it('reset clears stats', () => {
    orchestrator.triggerAudio(makeEvent('like'));
    orchestrator.reset();
    const stats = orchestrator.getStats();
    expect(stats.eventsProcessed).toBe(0);
    expect(stats.commandsEmitted).toBe(0);
  });

  it('unknown event type returns empty commands', () => {
    const result = orchestrator.triggerAudio(makeEvent('join'));
    expect(result.commands).toHaveLength(0);
  });

  it('PLAY_AUDIO command has correct schema version', () => {
    const result = orchestrator.triggerAudio(makeEvent('like'));
    expect(result.commands[0]!.schemaVersion).toBe(6);
  });

  it('PLAY_AUDIO command includes sourceEventIds', () => {
    const event = makeEvent('like');
    const result = orchestrator.triggerAudio(event);
    expect(result.commands[0]!.sourceEventIds).toContain(event.id);
  });
});
