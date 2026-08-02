/**
 * LiveAdapter — abstract interface for live event producers.
 *
 * Phase 9 defines this contract so MockLiveAdapter, ReplayAdapter, and
 * TikFinityAdapter (Phase 14) all plug into the pipeline the same way.
 *
 * The existing LiveProviderAdapter (Phase 1) remains for backward compatibility
 * and is used by the gateway's adapter slot. LiveAdapter is a higher-level
 * abstraction that adds scenario playback semantics.
 */
/**
 * TikTokLiveAdapter — legacy Phase 9 stub kept for backward compatibility.
 * Every method throws NotImplementedError. The real Phase 14 implementation
 * is `TikFinityAdapter` in `tikfinity_adapter.ts`.
 */
export class TikTokLiveAdapter {
    async start() {
        throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
    }
    async stop() {
        throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
    }
    onEvent(handler) {
        void handler;
        throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
    }
    isConnected() {
        throw new Error('NotImplementedError: TikTokLiveAdapter is Phase 14 territory');
    }
}
