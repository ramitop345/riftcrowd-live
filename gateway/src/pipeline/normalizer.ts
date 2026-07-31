/**
 * Normalizer — validates raw provider events against the NormalizedLiveEvent schema.
 *
 * Pure function that never throws. Returns a discriminated result:
 *   { ok: true, value: NormalizedLiveEvent } | { ok: false, errors: string[] }
 *
 * Sanitizes untrusted text fields (displayName, comment) before validation.
 * Malformed events are rejected with error reasons and never reach the rules engine.
 */

import { NormalizedLiveEventSchema, type NormalizedLiveEvent } from '@riftcrowd/shared';
import { sanitizeAndCap } from '../util/sanitize.js';

export type NormalizeResult =
  | { ok: true; value: NormalizedLiveEvent }
  | { ok: false; errors: string[] };

/**
 * Maximum chat comment text length for sanitization (schema allows 500).
 * We cap sanitized text at 200 chars for safety per the task spec.
 */
const CHAT_TEXT_CAP = 200;

/**
 * Validates and sanitizes a raw provider event.
 *
 * Steps:
 * 1. Pre-process: sanitize text fields (displayName, handle, comment) if present.
 * 2. Validate against NormalizedLiveEventSchema (strict Zod).
 * 3. Return result or errors.
 *
 * @param raw — untrusted input from a provider adapter.
 */
export function normalizeProviderEvent(raw: unknown): NormalizeResult {
  // Must be a non-null object
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: ['Input must be a non-null object'] };
  }

  // Clone and sanitize text fields before validation
  const input = { ...(raw as Record<string, unknown>) };

  // Sanitize user fields if present
  if (typeof input['user'] === 'object' && input['user'] !== null && !Array.isArray(input['user'])) {
    const user = { ...(input['user'] as Record<string, unknown>) };

    if (user['displayName'] !== undefined) {
      user['displayName'] = sanitizeAndCap(user['displayName'], 64);
    }
    if (user['handle'] !== undefined) {
      user['handle'] = sanitizeAndCap(user['handle'], 128);
    }

    input['user'] = user;
  }

  // Sanitize comment if present (cap at 200 chars per spec)
  if (typeof input['comment'] === 'string') {
    input['comment'] = sanitizeAndCap(input['comment'], CHAT_TEXT_CAP);
  }

  // Validate against schema
  const result = NormalizedLiveEventSchema.safeParse(input);

  if (result.success) {
    return { ok: true, value: result.data };
  }

  return {
    ok: false,
    errors: result.error.issues.map(
      (issue) => `${issue.path.join('.')}: ${issue.message}`,
    ),
  };
}
