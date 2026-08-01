import type { NormalizedLiveEvent } from '@riftcrowd/shared';

import type { AdapterStatus, LiveProviderAdapter } from './LiveProviderAdapter.js';

/**
 * Mock provider adapter. Transitions connection states honestly but emits no events yet:
 * scripted scenario playback arrives in Phase 9. It never fabricates success beyond what
 * actually happened.
 */
export class MockLiveAdapter implements LiveProviderAdapter {
  readonly id = 'mock';

  private status: AdapterStatus = 'disconnected';
  private eventCallback?: (event: NormalizedLiveEvent) => void;
  private statusCallback?: (status: AdapterStatus) => void;

  async connect(): Promise<void> {
    this.setStatus('connected');
  }

  async disconnect(): Promise<void> {
    this.setStatus('disconnected');
  }

  getStatus(): AdapterStatus {
    return this.status;
  }

  onEvent(callback: (event: NormalizedLiveEvent) => void): void {
    // Stored for Phase 9 scripted scenarios; no events are generated in Phase 1.
    this.eventCallback = callback;
  }

  onStatus(callback: (status: AdapterStatus) => void): void {
    this.statusCallback = callback;
  }

  /** Reserved for Phase 9 scenario playback so the stored callback is exercised honestly. */
  protected emitEvent(event: NormalizedLiveEvent): void {
    this.eventCallback?.(event);
  }

  private setStatus(status: AdapterStatus): void {
    this.status = status;
    this.statusCallback?.(status);
  }
}
