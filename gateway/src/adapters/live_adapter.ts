/**
 * LiveAdapter — abstract interface for live event producers.
 *
 * Phase 9 defines this contract so MockLiveAdapter, ReplayAdapter, and future
 * TikTokLiveAdapter (Phase 14) all plug into the pipeline the same way.
 *
 * The existing LiveProviderAdapter (Phase 1) remains for backward compatibility
 * and is used by the gateway's adapter slot. LiveAdapter is a higher-level
 * abstraction that adds scenario playback semantics.
 */

import type { NormalizedLiveEvent } from '@riftcrowd/shared';

/**
 * Abstract live event adapter. Implementations produce NormalizedLiveEvent
 * objects and deliver them via the registered handler.
 */
export interface LiveAdapter {
  /** Starts event production. Resolves when the adapter is ready. */
  start(): Promise<void>;

  /** Stops event production and clears pending scheduled events. */
  stop(): Promise<void>;

  /**
   * Registers a handler that receives emitted events.
   * Only one handler may be active at a time; calling again replaces the prior handler.
   */
  onEvent(handler: (event: NormalizedLiveEvent) => void): void;

  /** Returns whether the adapter is currently connected and producing events. */
  isConnected(): boolean;
}

/**
 * TikTokLiveAdapter — placeholder for Phase 14 (TikFinity integration).
 *
 * Every method throws NotImplementedError so any accidental use during Phase 9
 * is immediately obvious. This class exists to satisfy the deliverable: a named
 * class in the adapter module that documents the Phase 14 territory.
 */
export class TikTokLiveAdapter implements LiveAdapter {
  async start(): Promise<void> {
    throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
  }

  async stop(): Promise<void> {
    throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
  }

  onEvent(handler: (event: NormalizedLiveEvent) => void): void {
    void handler;
    throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
  }

  isConnected(): boolean {
    throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
  }
}
