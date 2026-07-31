/**
 * Sanitization helpers for untrusted provider data.
 *
 * Extracted from viewer_profile.ts to be reusable across the pipeline
 * (normalizer, viewer registry, and any future adapter).
 */

/**
 * Regex matching ASCII control characters (0x00–0x1F) and DEL (0x7F).
 */
// eslint-disable-next-line no-control-regex
const ASCII_CONTROL_RE = /[\x00-\x1F\x7F]/g;

/**
 * Regex matching zero-width Unicode characters that can cause rendering
 * glitches or be used to bypass moderation filters.
 */
const ZERO_WIDTH_RE = /(?:\u200B|\u200C|\u200D|\uFEFF)/g;

/**
 * Strips ASCII control characters and zero-width Unicode characters from
 * untrusted text, then trims whitespace. Never throws.
 *
 * @param raw — untrusted string from a provider adapter.
 * @returns sanitized string safe for display and storage.
 */
export function sanitizeText(raw: unknown): string {
  try {
    if (typeof raw !== 'string') {
      if (raw === null || raw === undefined) return '';
      try {
        raw = String(raw);
      } catch {
        return '';
      }
    }
    let s = raw as string;
    s = s.replace(ASCII_CONTROL_RE, '');
    s = s.replace(ZERO_WIDTH_RE, '');
    return s.trim();
  } catch {
    return '';
  }
}

/**
 * Sanitizes untrusted text and caps it at `maxLength` characters.
 * Used for displayName (64) and comment/chat text (200 or 500).
 *
 * @param raw — untrusted string from a provider adapter.
 * @param maxLength — maximum allowed length.
 * @returns sanitized, length-bounded string.
 */
export function sanitizeAndCap(raw: unknown, maxLength: number): string {
  const s = sanitizeText(raw);
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}
