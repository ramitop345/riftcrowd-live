/**
 * ReplayAdapter — replays a RecordedSession as a LiveAdapter.
 *
 * Takes a RecordedSession and a TestClock, emits events at their recorded
 * timestamps (relative to session start). Deterministic: same session →
 * same event sequence → same commands.
 */

import type { NormalizedLiveEvent } from '@riftcrowd/shared';
import type { LiveAdapter } from './live_adapter.js';
import type { TestClock } from './test_clock.js';
import type { RecordedSession } from './recording.js';
import type { ScheduledEvent } from './scenarios.js';
import type { Pipeline } from '../pipeline/pipeline.js';
import type { MatchDirector } from '../director/match_director.js';
import type { GameCommand } from '@riftcrowd/shared';

export interface ReplayAdapterOptions {
  session: RecordedSession;
  clock: TestClock;
  pipeline?: Pipeline;
  director?: MatchDirector;
}

export class ReplayAdapter implements LiveAdapter {
  readonly session: RecordedSession;
  readonly clock: TestClock;

  private handler?: (event: NormalizedLiveEvent) => void;
  private connected: boolean = false;
  private running: boolean = false;
  private pendingEvents: ScheduledEvent[] = [];
  private unsubClock?: () => void;

  private readonly pipeline?: Pipeline;
  private readonly director?: MatchDirector;

  private _emittedEvents: NormalizedLiveEvent[] = [];
  private _commands: GameCommand[] = [];
  private _lastAdvanceTimeMs: number = 0;

  constructor(opts: ReplayAdapterOptions) {
    this.session = opts.session;
    this.clock = opts.clock;
    this.pipeline = opts.pipeline;
    this.director = opts.director;
  }

  async start(): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.connected = true;
    this._emittedEvents = [];
    this._commands = [];
    this._lastAdvanceTimeMs = this.clock.now();

    // Use session events as scheduled events
    this.pendingEvents = [...this.session.events].sort((a, b) => a.timeMs - b.timeMs);

    this.unsubClock = this.clock.onAdvance(() => this.onClockAdvance());
    this.onClockAdvance();
  }

  async stop(): Promise<void> {
    this.running = false;
    this.connected = false;
    this.pendingEvents = [];
    if (this.unsubClock) {
      this.unsubClock();
      this.unsubClock = undefined;
    }
  }

  onEvent(handler: (event: NormalizedLiveEvent) => void): void {
    this.handler = handler;
  }

  isConnected(): boolean {
    return this.connected;
  }

  get emittedEvents(): readonly NormalizedLiveEvent[] {
    return this._emittedEvents;
  }

  get commands(): readonly GameCommand[] {
    return this._commands;
  }

  get pendingCount(): number {
    return this.pendingEvents.length;
  }

  /**
   * Runs the entire replay by advancing the clock until all events are emitted.
   */
  runToEnd(stepMs: number = 5000): { eventsEmitted: number; commandsProduced: number } {
    // Find the max event time
    const maxTime = this.session.events.reduce((max, e) => Math.max(max, e.timeMs), 0);
    while (this.pendingEvents.length > 0 || this.clock.now() < maxTime) {
      this.clock.advance(stepMs);
      if (this.pendingEvents.length === 0 && this.clock.now() >= maxTime + stepMs) break;
      if (this.clock.now() > maxTime + stepMs * 10) break;
    }
    this.clock.advance(stepMs);

    return {
      eventsEmitted: this._emittedEvents.length,
      commandsProduced: this._commands.length,
    };
  }

  private onClockAdvance(): void {
    if (!this.running) return;

    const currentTime = this.clock.now();
    const deltaMs = currentTime - this._lastAdvanceTimeMs;
    this._lastAdvanceTimeMs = currentTime;

    const toEmit: ScheduledEvent[] = [];
    while (this.pendingEvents.length > 0 && this.pendingEvents[0]!.timeMs <= currentTime) {
      toEmit.push(this.pendingEvents.shift()!);
    }

    for (const scheduled of toEmit) {
      if (!scheduled.event || typeof scheduled.event !== 'object') continue;
      if (!this.connected) continue;

      this._emittedEvents.push(scheduled.event);
      this.handler?.(scheduled.event);

      if (this.pipeline) {
        const result = this.pipeline.process(scheduled.event);
        for (const cmd of result.commands) {
          this._commands.push(cmd);
        }
      }

      if (this.director && scheduled.event.type === 'chat' && typeof scheduled.event.user?.id === 'string') {
        try {
          this.director.handleChatEvent(scheduled.event);
        } catch {
          // Malformed event — director rejects it; log at debug level
        }
      }
    }

    if (this.director && deltaMs > 0) {
      this.director.advanceTime(Math.ceil(deltaMs / 1000));
    }
  }
}
