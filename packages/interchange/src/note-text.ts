/**
 * The **note text step** (notes-through-interchange M1, ADR-0046): the one place the rules for turning
 * a foreign remark into an activity note, and an activity note into a foreign remark, live. Both
 * adapters and both emitters share it, so conversion and escaping are round-trip-tested against each
 * other rather than agreeing by coincidence.
 *
 * A note is **plain text**, 1 to {@link NOTE_BODY_MAX} characters (`ck_notes_body_length`). Everything
 * here is a *fidelity* transform that makes foreign text fit that shape — it is not a sanitiser. The
 * safety of an imported remark comes from never rendering it as markup, which the web client does not.
 *
 * Pure and dependency-free. Every scan is a single forward pass with no backtracking pattern, and a raw
 * memo over {@link NOTE_RAW_MAX} is refused before any of it runs, so the cost is linear and bounded
 * whatever the file holds.
 */

/** The database's `ck_notes_body_length` ceiling, counted in UTF-16 units (the DTO's `MaxLength`). */
export const NOTE_BODY_MAX = 5000;

/** A raw memo longer than this is not processed at all: it is refused and counted. */
export const NOTE_RAW_MAX = 1_000_000;

/**
 * The most notes one import (or one export) carries, counted after splitting. Equal to
 * `MAX_ASSIGNMENTS`, the largest per-import ceiling that already exists. Measured at the ceiling in
 * M1-T0 against the import's transaction budget (spec FC-6).
 */
export const MAX_NOTES = 20_000;

/**
 * The exact P6 notebook-topic label SchedulePoint writes (M2). A `MEMOTYPE` carrying it means the memo
 * is SchedulePoint's own: split on the horizontal rule and add no prefix (the ADR-0156 exact-label rule).
 */
export const SCHEDULEPOINT_NOTES_TOPIC = 'SchedulePoint notes v1';

/** What MSPDI `<Notes>` joins several notes with; a single note carries no separator. */
export const NOTE_JOINER = '\n\n————\n\n';

const LINE_BREAK_TAGS: ReadonlySet<string> = new Set(['br', 'hr', '/p', '/div', '/li', '/tr']);

/**
 * Tags whose removal costs only line structure. Removing any other tag (font, span, b, a, img, …) is
 * "formatting was removed" in the report.
 */
const STRUCTURE_TAGS: ReadonlySet<string> = new Set([
  'br',
  'hr',
  'p',
  'div',
  'li',
  'ul',
  'ol',
  'tr',
  'table',
  'tbody',
  'html',
  'body',
]);

/** Elements whose content is not text at all and is dropped with the element. */
const DROPPED_ELEMENTS: ReadonlySet<string> = new Set(['script', 'style', 'head']);

const NAMED_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

const XML_ENTITIES = new Set(['amp', 'lt', 'gt', 'quot', 'apos']);

const ENTITY_PATTERN = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,6});/gi;

function decodeEntities(input: string, named: (name: string) => string | undefined): string {
  return input.replace(ENTITY_PATTERN, (match, body: string) => {
    if (body.startsWith('#')) {
      const hex = body[1] === 'x' || body[1] === 'X';
      const codePoint = Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10);
      const isSurrogate = codePoint >= 0xd800 && codePoint <= 0xdfff;
      if (codePoint > 0x10ffff || isSurrogate) return match;
      return String.fromCodePoint(codePoint);
    }
    return named(body.toLowerCase()) ?? match;
  });
}

/**
 * Decode XML character data: the five predefined entities and numeric references. MSPDI needs this
 * because the parser runs with `processEntities: false` (an anti-expansion hardening). Decoding only
 * shrinks text, so it cannot become an expansion.
 */
export function decodeXmlEntities(input: string): string {
  return decodeEntities(input, (name) =>
    XML_ENTITIES.has(name) ? NAMED_ENTITIES[name] : undefined,
  );
}

function decodeHtmlEntities(input: string): string {
  return decodeEntities(input, (name) => NAMED_ENTITIES[name]);
}

/** Whether a memo contains a tag-shaped token (`<` then a letter, `/` or `!`, then `>` with no `<` between). */
export function looksLikeHtml(input: string): boolean {
  let from = 0;
  for (;;) {
    const open = input.indexOf('<', from);
    if (open === -1 || open + 1 >= input.length) return false;
    const next = input.charCodeAt(open + 1);
    const tagShaped =
      (next >= 65 && next <= 90) || (next >= 97 && next <= 122) || next === 47 || next === 33;
    if (tagShaped && tagEnd(input, open) !== -1) return true;
    from = open + 1;
  }
}

/** Index of the `>` closing a tag opened at `open`, or -1 when a `<` or the end of input comes first. */
function tagEnd(input: string, open: number): number {
  for (let j = open + 1; j < input.length; j += 1) {
    const code = input.charCodeAt(j);
    if (code === 62) return j;
    if (code === 60) return -1;
  }
  return -1;
}

function tagName(content: string): string {
  const head = content.slice(0, 24).toLowerCase();
  const match = /^\/?[a-z][a-z0-9]*/.exec(head);
  return match === null ? '' : match[0];
}

export interface HtmlText {
  readonly text: string;
  /** Markup beyond line structure (or a dropped script/style/head element) was removed. */
  readonly formatted: boolean;
}

/**
 * Convert an HTML memo to text with one forward tokenizer. Blocks become line breaks, a list item gets
 * a bullet, `script`/`style`/`head` are dropped with their content, every other tag is removed, and a
 * `<` that does not start a tag is kept literally. Entities are decoded last, so an escaped `&lt;b&gt;`
 * stays the text `<b>`.
 *
 * `collapseBlankLines` folds three or more newlines to two. A SchedulePoint memo turns it off: its
 * bodies are written with every newline explicit, and folding would break the exact round trip.
 */
export function htmlToText(input: string, collapseBlankLines: boolean): HtmlText {
  const parts: string[] = [];
  let formatted = false;
  let skipping: string | null = null;
  let commentsRemain = true;
  let i = 0;
  const n = input.length;

  while (i < n) {
    const open = input.indexOf('<', i);
    const textEnd = open === -1 ? n : open;
    if (textEnd > i && skipping === null) parts.push(input.slice(i, textEnd));
    if (open === -1) break;

    const next = open + 1 < n ? input.charCodeAt(open + 1) : 0;
    const tagShaped =
      (next >= 65 && next <= 90) || (next >= 97 && next <= 122) || next === 47 || next === 33;
    if (!tagShaped) {
      if (skipping === null) parts.push('<');
      i = open + 1;
      continue;
    }

    if (commentsRemain && input.startsWith('<!--', open)) {
      const end = input.indexOf('-->', open + 4);
      if (end !== -1) {
        i = end + 3;
        continue;
      }
      // One miss means no later comment can close either, so the rest are not searched for again.
      commentsRemain = false;
    }

    const close = tagEnd(input, open);
    if (close === -1) {
      if (skipping === null) parts.push('<');
      i = open + 1;
      continue;
    }

    const content = input.slice(open + 1, close);
    const name = tagName(content);
    i = close + 1;

    if (skipping !== null) {
      if (name === `/${skipping}`) skipping = null;
      continue;
    }
    if (DROPPED_ELEMENTS.has(name)) {
      skipping = name;
      formatted = true;
      continue;
    }
    // `<!DOCTYPE …>` and the like carry no formatting.
    if (!content.startsWith('!') && !STRUCTURE_TAGS.has(name.replace('/', ''))) formatted = true;
    if (LINE_BREAK_TAGS.has(name)) parts.push('\n');
    else if (name === 'li') parts.push('• ');
  }

  let text = decodeHtmlEntities(parts.join(''));
  if (collapseBlankLines) text = text.replace(/\n{3,}/g, '\n\n');
  return { text, formatted };
}

/**
 * Make text fit the note shape: normalise line breaks to `\n`, remove control characters other than
 * newline and tab (a NUL alone would make PostgreSQL refuse the row and roll the whole import back),
 * remove unpaired surrogates, and trim.
 */
export function cleanNoteText(input: string): string {
  return (
    input
      .replace(/\r\n?/g, '\n')
      // The point of this call is to match control characters.
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B-\u001F\u007F-\u009F]/g, '')
      .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '')
      .trim()
  );
}

/**
 * Split text into pieces of at most `max` UTF-16 units, cutting at a paragraph, then a line, then
 * whitespace boundary in the second half of the window, and never inside a surrogate pair. A boundary
 * in the first half is ignored so every pass consumes at least half a window, which bounds the work.
 * Pieces are trimmed and blank ones dropped, so only whitespace at a cut is lost.
 */
export function splitNoteBody(text: string, max: number = NOTE_BODY_MAX): string[] {
  const pieces: string[] = [];
  let position = 0;
  while (text.length - position > max) {
    const window = text.slice(position, position + max);
    const floor = Math.floor(max / 2);
    let cut = window.lastIndexOf('\n\n');
    if (cut < floor) cut = window.lastIndexOf('\n');
    if (cut < floor) {
      cut = -1;
      for (let j = max - 1; j >= floor; j -= 1) {
        if (/\s/.test(window.charAt(j))) {
          cut = j;
          break;
        }
      }
    }
    if (cut < floor) {
      cut = max;
      const last = window.charCodeAt(max - 1);
      if (last >= 0xd800 && last <= 0xdbff) cut = max - 1;
    }
    const piece = window.slice(0, cut).trim();
    if (piece !== '') pieces.push(piece);
    position += cut;
  }
  const tail = text.slice(position).trim();
  if (tail !== '') pieces.push(tail);
  return pieces;
}

/** How a source stores its notes, which decides how one is read. */
export type NoteSource =
  /** MSPDI `<Notes>`: plain text in XML character data. */
  | 'XML_TEXT'
  /** A P6 memo from another tool: HTML when it contains a tag-shaped token, otherwise plain text. */
  | 'XER_FOREIGN'
  /** A memo SchedulePoint wrote under {@link SCHEDULEPOINT_NOTES_TOPIC}: several notes split on `<hr>`. */
  | 'XER_SCHEDULEPOINT';

export type NoteTextResult =
  | {
      readonly ok: true;
      /** The notes this remark becomes, in order; empty when it is blank. */
      readonly bodies: string[];
      /** Markup beyond line structure was removed from at least one. */
      readonly formatted: boolean;
      /** How many segments were over the ceiling and were split, and into how many notes. */
      readonly longNotes: number;
      readonly longPieces: number;
    }
  | { readonly ok: false; readonly reason: 'TOO_LARGE' | 'RICH_TEXT' };

const TOPIC_MAX = 80;

/** A topic name as one bracketed line, or nothing when it cleans to empty. */
function topicLabel(topic: string): string {
  const oneLine = cleanNoteText(topic).replace(/\s+/g, ' ').slice(0, TOPIC_MAX).trim();
  return oneLine === '' ? '' : `[${oneLine}]`;
}

/**
 * The whole text step for one source remark: bound, decode, convert, clean, split (spec §2 Workflows).
 * `topic`, when given, becomes a `[topic]` first line on every non-blank note, so a P6 notebook topic
 * survives as text.
 */
export function importNoteText(raw: string, source: NoteSource, topic?: string): NoteTextResult {
  if (raw.length > NOTE_RAW_MAX) return { ok: false, reason: 'TOO_LARGE' };

  let segments: string[];
  let formatted = false;
  if (source === 'XML_TEXT') {
    const decoded = decodeXmlEntities(raw);
    if (decoded.trimStart().startsWith('{\\rtf')) return { ok: false, reason: 'RICH_TEXT' };
    segments = [decoded];
  } else {
    const rawSegments = source === 'XER_SCHEDULEPOINT' ? raw.split(/<hr\s*\/?>/i) : [raw];
    const collapse = source !== 'XER_SCHEDULEPOINT';
    segments = rawSegments.map((segment) => {
      if (source === 'XER_FOREIGN' && !looksLikeHtml(segment)) return segment;
      const converted = htmlToText(segment, collapse);
      formatted ||= converted.formatted;
      return converted.text;
    });
  }

  const label = topic === undefined || source !== 'XER_FOREIGN' ? '' : topicLabel(topic);
  const bodies: string[] = [];
  let longNotes = 0;
  let longPieces = 0;
  for (const segment of segments) {
    const body = cleanNoteText(segment);
    if (body === '') continue;
    const cleaned = label === '' ? body : `${label}\n${body}`;
    if (cleaned.length > NOTE_BODY_MAX) {
      const pieces = splitNoteBody(cleaned);
      longNotes += 1;
      longPieces += pieces.length;
      bodies.push(...pieces);
    } else {
      bodies.push(cleaned);
    }
  }
  return { ok: true, bodies, formatted, longNotes, longPieces };
}

function escapeMemoHtml(body: string): string {
  return body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/\t/g, '&#9;')
    .replace(/\r\n?|\n/g, '<br>');
}

/**
 * The XER `task_memo` for one activity's notes (M2 wires it): each body HTML-escaped with tabs and
 * newlines explicit — the XER serialiser collapses a raw tab or newline to a space — joined oldest
 * first with `<hr>`. A body that literally contains `<hr>` was escaped to `&lt;hr&gt;`, so it cannot
 * split on the way back.
 */
export function noteBodiesToMemoHtml(bodies: readonly string[]): string {
  return `<html><body>${bodies.map(escapeMemoHtml).join('<hr>')}</body></html>`;
}

/**
 * The MSPDI `<Notes>` text for one activity's notes (M2 wires it): bodies joined oldest first with
 * {@link NOTE_JOINER}, with characters XML 1.0 forbids removed so the file stays well-formed.
 */
export function noteBodiesToPlainNotes(bodies: readonly string[]): {
  readonly text: string;
  readonly removedForbidden: boolean;
} {
  const joined = bodies.join(NOTE_JOINER);
  const text = joined
    // XML 1.0 forbids these; matching them is the point.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '')
    .replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
  return { text, removedForbidden: text.length !== joined.length };
}
