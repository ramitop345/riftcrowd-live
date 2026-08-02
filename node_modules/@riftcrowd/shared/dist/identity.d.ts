/**
 * Deterministic JSON serialization: identical values always produce identical strings, regardless of
 * object key insertion order. Arrays keep their order. Values JSON cannot represent at the top level
 * (`undefined`, functions, symbols) serialize as `"null"` so the result is always a string.
 */
export declare function stableStringify(value: unknown): string;
/**
 * Hash of a raw provider payload: `sha256:` followed by 64 lowercase hex characters. Enables dedupe
 * and log correlation without ever storing or logging the raw payload itself.
 */
export declare function computeRawHash(rawPayload: unknown): string;
/**
 * Content-derived event id: `evt_` + first 24 hex chars of
 * `sha256(stableStringify(['event', provider, type, rawHash]))`. Hashing the JSON-serialized tuple
 * (instead of delimiter-joined strings) makes the derivation collision-proof for arbitrary inputs:
 * `('a|b', 'c')` and `('a', 'b|c')` serialize differently. The same raw payload from the same
 * provider always maps to the same event id.
 */
export declare function deterministicEventId(provider: string, type: string, rawHash: string): string;
/**
 * Content-derived command id: `cmd_` + first 24 hex chars of
 * `sha256(stableStringify(['command', type, sourceEventIds]))`. The tuple serialization keeps ids
 * unambiguous even when inputs contain delimiter characters. Source order matters: merged commands
 * must sort or freeze their id list before calling.
 */
export declare function deterministicCommandId(type: string, sourceEventIds: string[]): string;
