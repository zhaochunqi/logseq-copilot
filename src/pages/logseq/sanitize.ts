/**
 * Pure, dependency-free HTML/URL helpers shared by the block renderer.
 *
 * These are intentionally conservative: the renderer feeds its output into
 * `dangerouslySetInnerHTML`, so block content coming from Logseq (which may be
 * attacker-controlled) must never be able to inject executable markup.
 */

const CONTROL_CHARS = /[\u0000-\u001F\u007F]+/g;

export const escapeHtml = (value: string): string =>
  String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');

/**
 * Wrap occurrences of `query` in `<mark>` for search highlighting.
 *
 * `text` is expected to already be HTML-escaped by the caller; only the query
 * that gets inserted into the `<mark>` element is escaped here so a malicious
 * query cannot break out of the markup.
 */
export const highlightText = (text: string, query?: string): string => {
  if (!query) {
    return text;
  }
  return text.replaceAll(query, `<mark>${escapeHtml(query)}</mark>`);
};

const IMAGE_DATA_URI = /^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,/i;
const DANGEROUS_SCHEME = /^(javascript|vbscript|file):/i;
const ALLOWED_SCHEME = /^(https?|mailto):/i;
const ANY_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/**
 * Validate and normalise a URL pulled from untrusted block content.
 *
 * Returns the cleaned href when it is safe for the given context, otherwise
 * `null`. `link` allows `http:`/`https:`/`mailto:`, in-page `#fragment` and
 * relative paths. `image` additionally allows inline base64 image data URIs.
 *
 * The scheme check runs after trimming and stripping control characters so
 * obfuscated payloads such as `java\nscript:` are still rejected.
 */
export const safeHref = (
  href: string | null | undefined,
  kind: 'link' | 'image',
): string | null => {
  if (href == null) {
    return null;
  }
  const cleaned = String(href).replace(CONTROL_CHARS, '').trim();
  if (!cleaned) {
    return null;
  }

  if (DANGEROUS_SCHEME.test(cleaned)) {
    return null;
  }

  if (/^data:/i.test(cleaned)) {
    return kind === 'image' && IMAGE_DATA_URI.test(cleaned) ? cleaned : null;
  }

  if (ALLOWED_SCHEME.test(cleaned)) {
    return cleaned;
  }

  if (cleaned.startsWith('#')) {
    return cleaned;
  }

  // Anything else that still looks like it carries a scheme is rejected.
  if (ANY_SCHEME.test(cleaned)) {
    return null;
  }

  // Relative path (no scheme): `foo`, `./foo`, `../foo` or `/foo`.
  return cleaned;
};
