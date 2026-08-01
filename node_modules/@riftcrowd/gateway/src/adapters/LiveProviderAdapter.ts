import type { NormalizedLiveEvent } from '@riftcrowd/shared';

/** Connection lifecycle of a provider adapter. */
export type AdapterStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

/**
 * Boundary between a live platform and the rest of the gateway. Adapters translate raw
 * provider payloads into NormalizedLiveEvent; provider vocabulary never crosses this line.
 */
export interface LiveProviderAdapter {
  readonly id: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getStatus(): AdapterStatus;
  onEvent(callback: (event: NormalizedLiveEvent) => void): void;
  onStatus(callback: (status: AdapterStatus) => void): void;
}
