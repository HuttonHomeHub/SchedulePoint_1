/**
 * The cleaners for a browser crash report (browser crash reports M1-T2, spec §2 "Validation rules").
 *
 * **Load-bearing for ADR-0086 D6.** Staff must not read customer content, and a raw error message is
 * the one channel through which plan text could reach a staff screen. The browser removes query
 * strings before it sends, but the server is the authority: it cleans again, and nothing in this
 * file trusts that the caller did anything.
 *
 * Every function is pure and none throws. Three rules come from the table's author
 * (`CrashReport` model docblock) and are easy to break by tidying:
 *
 * 1. **U+0000 is removed from every text value.** Postgres `text` cannot hold a NUL and refuses the
 *    whole statement before any CHECK runs. It is the one failure on this table browser input alone
 *    can reach (`String(value)` of a thrown non-Error can carry one).
 * 2. **The cap is the LAST step of each cleaner.** Caps count code points, which is never more than
 *    Postgres' `char_length`, so a value capped here satisfies the column's CHECK. A redaction
 *    applied after the cap (`[email]` is longer than `a@b.c`) would not.
 * 3. **No control character survives**, which is what makes the U+001F join in the dedupe key
 *    unambiguous rather than merely unlikely.
 */

/** The spec's caps. The database holds the same numbers in `ck_crash_reports_*_length`. */
export const MAX_MESSAGE_LENGTH = 300;
export const MAX_STACK_LENGTH = 4_000;
export const MAX_COMPONENT_STACK_LENGTH = 2_000;
export const MAX_FRAMES = 20;

/** Input is sliced before the regex rules run so a 64 KB body cannot make them quadratic. */
const MAX_RAW_MESSAGE = 4_000;
const MAX_RAW_LINES = 200;
const MAX_RAW_LINE = 1_000;

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const DOTTED_IDENTIFIER = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const UUID_SOURCE = '[0-9A-Fa-f]{8}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{4}-[0-9A-Fa-f]{12}';
const UUID = new RegExp(UUID_SOURCE);
const UUID_GLOBAL = new RegExp(UUID_SOURCE, 'g');
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
const URL_TOKEN = /[A-Za-z][A-Za-z0-9+.-]*:\/\/[^\s'"`<>]+/g;
const OPAQUE_URI = /\b(?:data|blob|javascript):[^\s'"`<>]+/gi;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const DIGIT_RUN = /\d{4,}/g;
// A quote opens a span to its twin, or to the end when it never closes: an unterminated quote must
// not let the rest of the message through.
const QUOTED = /'([^']*)(?:'|$)|"([^"]*)(?:"|$)|`([^`]*)(?:`|$)/g;

/** Remove NUL, then turn every other control character into a space. */
function stripControls(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code === 0) continue;
    out += code < 0x20 || (code >= 0x7f && code <= 0x9f) ? ' ' : char;
  }
  return out;
}

/** Replace a lone surrogate (which no encoder agrees how to write) with U+FFFD. */
function wellFormed(value: string): string {
  return value.replace(LONE_SURROGATE, '�');
}

/** Cap at `max` code points, never splitting a surrogate pair. Always the last step. */
export function capCodePoints(value: string, max: number): string {
  if (value.length <= max) return value;
  const points = Array.from(value);
  return points.length <= max ? value : points.slice(0, max).join('');
}

/**
 * `scheme://host/path` with userinfo, query and fragment dropped. A trailing sentence punctuation
 * mark belongs to the prose, not the URL.
 */
function reduceUrl(token: string): string {
  const trailing = /[.,;:!)\]}]+$/.exec(token)?.[0] ?? '';
  const url = trailing ? token.slice(0, -trailing.length) : token;
  const cut = url.search(/[?#]/);
  const withoutTail = cut === -1 ? url : url.slice(0, cut);
  const schemeEnd = withoutTail.indexOf('://') + 3;
  const rest = withoutTail.slice(schemeEnd);
  const slash = rest.indexOf('/');
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  const path = slash === -1 ? '' : rest.slice(slash);
  const host = authority.slice(authority.lastIndexOf('@') + 1);
  return `${withoutTail.slice(0, schemeEnd)}${host}${path}${trailing}`;
}

/**
 * The message, with everything that could be somebody's value removed (spec §2, in this order):
 * URLs reduced, emails, UUIDs, digit runs of four or more, and quoted spans unless the quoted text is
 * a bare identifier (`reading 'startAt'` survives, `Unexpected token "secret"` does not).
 */
export function cleanMessage(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  let text = wellFormed(stripControls(raw.slice(0, MAX_RAW_MESSAGE)));
  text = text.replace(URL_TOKEN, reduceUrl);
  // `data:` / `blob:` URIs have no `//` and can carry a whole document.
  text = text.replace(OPAQUE_URI, (uri) => `${uri.slice(0, uri.indexOf(':') + 1)}[uri]`);
  text = text.replace(EMAIL, '[email]');
  text = text.replace(UUID_GLOBAL, '[id]');
  text = text.replace(DIGIT_RUN, '[n]');
  text = text.replace(QUOTED, (match: string, single?: string, double?: string, tick?: string) => {
    const inner = single ?? double ?? tick ?? '';
    const quote = match[0] ?? "'";
    const closed = match.length >= 2 && match.endsWith(quote);
    return closed && IDENTIFIER.test(inner) ? match : "'…'";
  });
  text = text.replace(/\s+/g, ' ').trim();
  return capCodePoints(text, MAX_MESSAGE_LENGTH);
}

/** `Error` unless the name is an identifier of at most 64 characters (spec §2). */
export function cleanErrorName(raw: unknown): string {
  return typeof raw === 'string' && /^[A-Za-z_$][\w$]{0,63}$/.test(raw) ? raw : 'Error';
}

/** A TanStack route id, or null. Never a resolved path: a pattern holds no UUID (spec §2). */
export function cleanRoutePattern(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  if (!/^[A-Za-z0-9_$/.-]{1,200}$/.test(raw) || UUID.test(raw)) return null;
  return raw;
}

/** A loose version token, or `unknown` (spec §2). */
export function cleanWebVersion(raw: unknown): string {
  return typeof raw === 'string' && /^[0-9A-Za-z.+-]{1,32}$/.test(raw) ? raw : 'unknown';
}

/**
 * A code location reduced to something that cannot identify a person or a document.
 *
 * A bare path (what the browser sends) keeps its path. An absolute URL keeps its path only when its
 * origin is one this installation serves (`sameOrigins`, lower-case, no trailing slash); anything
 * else becomes its scheme alone, so a browser extension's frame reads `[chrome-extension]`. A path
 * with a character outside the asset-file alphabet, a UUID, or more than 200 characters becomes `?`.
 */
function cleanLocationBase(raw: string, sameOrigins: readonly string[]): string {
  const noTail = raw.split(/[?#]/, 1)[0] ?? '';
  const scheme = /^([A-Za-z][A-Za-z0-9+.-]*):\/\//.exec(noTail);
  let path = noTail;
  if (scheme) {
    const origin = /^[A-Za-z][A-Za-z0-9+.-]*:\/\/[^/]*/.exec(noTail)?.[0] ?? '';
    const name = (scheme[1] ?? '').toLowerCase();
    if (!['http', 'https'].includes(name) || !sameOrigins.includes(origin.toLowerCase())) {
      return `[${name}]`;
    }
    path = noTail.slice(origin.length);
  }
  if (!/^\/[\w\-./]{0,199}$/.test(path) || UUID.test(path)) return '?';
  return path;
}

interface ParsedLine {
  readonly fn: string;
  readonly location: string | null;
}

function cleanFunctionName(raw: string): string {
  const name = raw.replace(/^(?:async|new)\s+/, '').trim();
  return name.length <= 64 && DOTTED_IDENTIFIER.test(name) ? name : '?';
}

function cleanLocation(raw: string, sameOrigins: readonly string[]): string | null {
  const trimmed = raw.trim();
  if (trimmed === '[native code]' || trimmed === 'native') return '[native]';
  if (trimmed === '<anonymous>') return '[anonymous]';
  const match = /^(.*?):(\d{1,7})(?::(\d{1,7}))?$/.exec(trimmed);
  if (!match || !match[1]) return null;
  const base = cleanLocationBase(match[1], sameOrigins);
  return `${base}:${match[2]}${match[3] ? `:${match[3]}` : ''}`;
}

/**
 * One line of a V8 (`at fn (loc)`), Firefox or Safari (`fn@loc`) stack, or null for a line that is
 * not a frame. The first line of a V8 stack is `Name: message` and is dropped here, which is why the
 * message is never recovered from the stack. A line with no recognisable location is not a frame
 * unless `allowBare` (a React component stack names components with no location).
 */
function parseLine(
  line: string,
  sameOrigins: readonly string[],
  allowBare: boolean,
): ParsedLine | null {
  const text = line.trim();
  const v8 = /^at\s+(.*)$/.exec(text);
  if (v8) {
    const body = v8[1] ?? '';
    const wrapped = /^(.*?)\s+\((.*)\)$/.exec(body);
    if (wrapped) {
      const fn = cleanFunctionName(wrapped[1] ?? '');
      const location = cleanLocation(wrapped[2] ?? '', sameOrigins);
      if (location !== null) return { fn, location };
      return allowBare ? { fn, location: null } : null;
    }
    const location = cleanLocation(body, sameOrigins);
    if (location !== null) return { fn: '?', location };
    return allowBare ? { fn: cleanFunctionName(body), location: null } : null;
  }
  const at = text.indexOf('@');
  if (at !== -1) {
    const location = cleanLocation(text.slice(at + 1), sameOrigins);
    if (location !== null) return { fn: cleanFunctionName(text.slice(0, at)), location };
  }
  return null;
}

function formatLine({ fn, location }: ParsedLine): string {
  return location === null ? fn : `${fn} @ ${location}`;
}

function parseLines(raw: unknown, sameOrigins: readonly string[], allowBare: boolean): string[] {
  if (typeof raw !== 'string') return [];
  const lines = wellFormed(raw)
    .split(/\r?\n/, MAX_RAW_LINES)
    .map((line) => line.slice(0, MAX_RAW_LINE));
  const out: string[] = [];
  for (const line of lines) {
    const parsed = parseLine(stripControls(line), sameOrigins, allowBare);
    if (parsed) out.push(formatLine(parsed));
    if (out.length === MAX_FRAMES) break;
  }
  return out;
}

/** The cleaned stack frames, at most {@link MAX_FRAMES}. The hash reads the first five of these. */
export function cleanFrames(raw: unknown, sameOrigins: readonly string[]): string[] {
  return parseLines(raw, sameOrigins, false);
}

/** The stack as stored: frames joined by newlines, capped last, or null when none survive. */
export function stackText(frames: readonly string[]): string | null {
  return frames.length === 0 ? null : capCodePoints(frames.join('\n'), MAX_STACK_LENGTH);
}

/** The React component stack as stored, or null when there is none. */
export function cleanComponentStack(raw: unknown, sameOrigins: readonly string[]): string | null {
  const lines = parseLines(raw, sameOrigins, true);
  return lines.length === 0 ? null : capCodePoints(lines.join('\n'), MAX_COMPONENT_STACK_LENGTH);
}
