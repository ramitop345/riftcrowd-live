import { createHash } from 'node:crypto';
/**
 * Deterministic identity helpers. The gateway derives event/command ids and raw-payload hashes from
 * content, never from randomness, so replays produce identical ids and dedupe works across restarts.
 *
 * This module imports `node:crypto` and is therefore Node-only. It is deliberately excluded from
 * the package root export and exposed ONLY via the `./identity` subpath so the root entry stays
 * browser-safe; browser consumers (the dashboard) must not import it.
 */
/** Number of leading hex characters kept from a SHA-256 digest when building a short id. */
const ID_HASH_LENGTH = 24;
function sha256Hex(input) {
    return createHash('sha256').update(input, 'utf8').digest('hex');
}
/**
 * Recursively rebuilds a value with object keys sorted (code-unit order) so serialization does not
 * depend on key insertion order. Array order is meaningful and preserved.
 */
function sortKeysDeep(value) {
    if (Array.isArray(value)) {
        return value.map(sortKeysDeep);
    }
    if (value !== null && typeof value === 'object') {
        const sorted = {};
        for (const key of Object.keys(value).sort()) {
            sorted[key] = sortKeysDeep(value[key]);
        }
        return sorted;
    }
    return value;
}
/**
 * Deterministic JSON serialization: identical values always produce identical strings, regardless of
 * object key insertion order. Arrays keep their order. Values JSON cannot represent at the top level
 * (`undefined`, functions, symbols) serialize as `"null"` so the result is always a string.
 */
export function stableStringify(value) {
    return JSON.stringify(sortKeysDeep(value)) ?? 'null';
}
/**
 * Hash of a raw provider payload: `sha256:` followed by 64 lowercase hex characters. Enables dedupe
 * and log correlation without ever storing or logging the raw payload itself.
 */
export function computeRawHash(rawPayload) {
    return `sha256:${sha256Hex(stableStringify(rawPayload))}`;
}
/**
 * Content-derived event id: `evt_` + first 24 hex chars of
 * `sha256(stableStringify(['event', provider, type, rawHash]))`. Hashing the JSON-serialized tuple
 * (instead of delimiter-joined strings) makes the derivation collision-proof for arbitrary inputs:
 * `('a|b', 'c')` and `('a', 'b|c')` serialize differently. The same raw payload from the same
 * provider always maps to the same event id.
 */
export function deterministicEventId(provider, type, rawHash) {
    return `evt_${sha256Hex(stableStringify(['event', provider, type, rawHash])).slice(0, ID_HASH_LENGTH)}`;
}
/**
 * Content-derived command id: `cmd_` + first 24 hex chars of
 * `sha256(stableStringify(['command', type, sourceEventIds]))`. The tuple serialization keeps ids
 * unambiguous even when inputs contain delimiter characters. Source order matters: merged commands
 * must sort or freeze their id list before calling.
 */
export function deterministicCommandId(type, sourceEventIds) {
    return `cmd_${sha256Hex(stableStringify(['command', type, sourceEventIds])).slice(0, ID_HASH_LENGTH)}`;
}
