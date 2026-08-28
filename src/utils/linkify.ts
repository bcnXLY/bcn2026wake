/* ==========================================================================
   Linkify
   --------------------------------------------------------------------------
   Splits a plain-text message into runs of text and runs of URL, so the board
   can render the URLs as anchors. Everything stays a string here — the caller
   builds the elements, and React escapes them, so no message can inject markup.

   Only http(s) and bare "www." are recognised. That is deliberate: the href we
   hand back can never carry a javascript:, data: or mailto: scheme.
   ========================================================================== */

export interface LinkSegment {
  /** The text to show — for a link, the URL as the sender typed it. */
  text: string;
  /** Absolute http(s) URL, or undefined when this run is ordinary text. */
  href?: string;
}

/**
 * A scheme (or a bare "www.") followed by anything that isn't whitespace or a
 * character that can't appear unescaped in a URL. Trailing punctuation is
 * pruned afterwards rather than excluded here, since "." and ")" are legal
 * inside a path and only stop being part of the link at the very end.
 */
const URL_PATTERN = /(?:https?:\/\/|www\.)[^\s<>"'`\\]+/gi;

/** Sentence punctuation that people write straight after a URL. */
const TRAILING_PUNCTUATION = /[.,;:!?…"']+$/;

const CLOSERS: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

const countOf = (haystack: string, needle: string) => haystack.split(needle).length - 1;

/**
 * Walks back over characters that end the sentence rather than the URL:
 * "see https://example.com/docs." loses the full stop, and
 * "(https://example.com/a)" loses the bracket it never opened — while
 * "https://en.wikipedia.org/wiki/Foo_(bar)" keeps its own balanced pair.
 */
function trimTrailing(url: string): string {
  let out = url.replace(TRAILING_PUNCTUATION, '');
  for (;;) {
    const opener = CLOSERS[out.slice(-1)];
    if (!opener || countOf(out, out.slice(-1)) <= countOf(out, opener)) return out;
    out = out.slice(0, -1).replace(TRAILING_PUNCTUATION, '');
  }
}

/**
 * The absolute URL for a matched run, or null when it isn't really one.
 * The host has to contain a dot, which is what keeps "https://" on its own —
 * or a stray "www.something" with no domain — from becoming a dead link.
 */
function hrefFor(match: string): string | null {
  const candidate = /^www\./i.test(match) ? `https://${match}` : match;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.hostname.includes('.') ? candidate : null;
  } catch {
    return null;
  }
}

/**
 * Breaks `text` into consecutive segments. Plain text comes back as a single
 * segment with no href, so a message without links costs one array entry.
 */
export function linkify(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let cursor = 0;

  URL_PATTERN.lastIndex = 0;
  for (let match = URL_PATTERN.exec(text); match; match = URL_PATTERN.exec(text)) {
    const candidate = trimTrailing(match[0]);
    // Resume after the trimmed URL so the punctuation we dropped stays in the text.
    URL_PATTERN.lastIndex = match.index + candidate.length;

    const href = hrefFor(candidate);
    if (!href) continue;

    if (match.index > cursor) segments.push({ text: text.slice(cursor, match.index) });
    segments.push({ text: candidate, href });
    cursor = match.index + candidate.length;
  }

  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments;
}
