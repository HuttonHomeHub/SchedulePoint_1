import { XMLParser, XMLValidator } from 'fast-xml-parser';

/**
 * The **pure MSPDI reader + format detector** (ADR-0050, Task 3.2).
 *
 * A Microsoft Project **MSPDI** file is the XML interchange format Project writes from *File → Save As →
 * XML*: a `<Project xmlns="http://schemas.microsoft.com/project">` root carrying `<Calendars>`,
 * `<Tasks>` (each `<Task>` may nest `<PredecessorLink>` elements), `<Resources>` and `<Assignments>`.
 * This module turns the raw bytes/string of such a file into a typed, format-specific document —
 * `{ version, project }`, the raw `<Project>` subtree safely typed — **without** interpreting the domain
 * (that is the adapter, Task 3.3). It hard-rejects anything that is not an MSPDI, and it is hardened
 * against untrusted input with byte + node caps.
 *
 * It is **pure and deterministic**: no I/O, no clock, no randomness, and it never evaluates any input as
 * code. Errors are returned as typed, user-safe values (a discriminated {@link MspdiParseResult}) — a
 * caller never has to catch a raw exception. The underlying parser is configured **defensively for
 * untrusted input**: declarations are ignored, entities are **not** processed (blocking
 * billion-laughs-style entity expansion — fast-xml-parser never resolves EXTERNAL entities so there is no
 * network/file XXE either), tag values are kept as raw strings (the adapter coerces), and attributes are
 * ignored (MSPDI is element-centric). The MS Project namespace is required, so a proprietary binary
 * `.mpp` file (an OLE compound document) is rejected with guidance to export MSPDI XML instead.
 */

// ---------------------------------------------------------------------------------------------------------
// Safety caps (untrusted-file input). Exceeding any cap returns a typed error, never an OOM.
// ---------------------------------------------------------------------------------------------------------

/** Tunable limits applied to a single parse. All are inclusive maxima; exceeding one returns an error. */
export interface MspdiParseCaps {
  /** Maximum decoded/raw input size. Larger input is rejected before any decode/allocation. */
  readonly maxBytes: number;
  /**
   * Maximum number of XML tag markers (`<` occurrences) permitted in the document — a coarse element/node
   * ceiling scanned cheaply before the parse tree is built, so a hostile deeply-nested/wide file is
   * rejected up front rather than allocating a giant tree.
   */
  readonly maxNodes: number;
}

/**
 * Sane defaults tuned to the product's ~2,000-activity ceiling (a real 2k-activity MSPDI is a few MiB;
 * each `<Task>` carries tens of child elements) with generous headroom, while still bounding a hostile
 * file to a safe size.
 *
 * These are **coarse file-shape caps**, not the domain graph ceiling. The authoritative
 * activity/dependency/resource limit is enforced downstream on the mapped graph by `importMspdi`
 * (`MAX_ACTIVITIES` / `MAX_DEPENDENCIES` / …, ADR-0050) — a file may parse under `maxNodes` yet still be
 * rejected there if it maps to too large a network. `maxNodes` therefore stays a generous upper bound; the
 * graph ceiling is the real gate.
 */
export const DEFAULT_MSPDI_PARSE_CAPS: MspdiParseCaps = {
  maxBytes: 64 * 1024 * 1024, // 64 MiB
  maxNodes: 2_000_000,
};

// ---------------------------------------------------------------------------------------------------------
// Typed, user-safe errors (returned, never thrown).
// ---------------------------------------------------------------------------------------------------------

/**
 * The class of a parse rejection. Each maps cleanly to a user-facing outcome / HTTP status in the thin
 * NestJS module (e.g. `FILE_TOO_LARGE` → 413; `NOT_MSPDI`/`UNSUPPORTED_MPP`/`MALFORMED_STRUCTURE`/
 * `EMPTY_FILE` → 422).
 */
export const MSPDI_PARSE_ERROR_CODES = [
  'EMPTY_FILE',
  'NOT_MSPDI',
  'UNSUPPORTED_MPP',
  'MALFORMED_STRUCTURE',
  'FILE_TOO_LARGE',
  'TOO_MANY_NODES',
] as const;
export type MspdiParseErrorCode = (typeof MSPDI_PARSE_ERROR_CODES)[number];

/** A typed, user-safe rejection. `message` never leaks internals/stack. */
export interface MspdiParseError {
  readonly code: MspdiParseErrorCode;
  /** A short, user-safe reason (no internals, no stack). */
  readonly message: string;
}

// ---------------------------------------------------------------------------------------------------------
// Parsed document shape + generic safe-XML tree accessors.
// ---------------------------------------------------------------------------------------------------------

/**
 * A parsed XML value: a leaf text string, a child element, or a repeated element (an array). Kept
 * deliberately generic — the adapter (Task 3.3) is the only place MSPDI's element vocabulary lives.
 */
export type MspdiValue = string | MspdiElement | MspdiValue[];

/** A parsed XML element: its child element names mapped to their parsed value(s). */
export interface MspdiElement {
  readonly [name: string]: MspdiValue | undefined;
}

/** A fully parsed MSPDI document: the raw `<Project>` subtree plus its `SaveVersion` (for provenance). */
export interface MspdiDocument {
  /** The `<SaveVersion>` of the writing Project version, if present; else null. */
  readonly version: string | null;
  /** The raw `<Project>` element tree (safely typed); the adapter navigates it. */
  readonly project: MspdiElement;
}

/** A discriminated result — success carries the document, failure carries a typed, user-safe error. */
export type MspdiParseResult =
  { ok: true; document: MspdiDocument } | { ok: false; error: MspdiParseError };

/** Detection carries only the `SaveVersion` (a cheap signature check, no body parse). */
export interface MspdiHeader {
  readonly version: string | null;
}

/** A discriminated result for detection only. */
export type MspdiDetectResult =
  { ok: true; header: MspdiHeader } | { ok: false; error: MspdiParseError };

/** Options for a parse/detect call. Missing caps fall back to {@link DEFAULT_MSPDI_PARSE_CAPS}. */
export interface MspdiParseOptions {
  readonly caps?: Partial<MspdiParseCaps>;
}

/** Narrow an arbitrary parsed value to an element (a non-null, non-array object), or `undefined`. */
export function asElement(value: MspdiValue | undefined): MspdiElement | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

/**
 * The parsed value(s) of a named child, always as an array (a single child → a one-element array; an
 * absent child → `[]`). `Object.hasOwn` guards the read so an inherited property can never masquerade as
 * a child (defence-in-depth alongside fast-xml-parser's own reserved-name rejection).
 */
export function childValues(parent: MspdiElement, name: string): MspdiValue[] {
  if (!Object.hasOwn(parent, name)) return [];
  const value = parent[name];
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

/** The named child elements, in source order (non-element values are skipped). */
export function childElements(parent: MspdiElement, name: string): MspdiElement[] {
  const out: MspdiElement[] = [];
  for (const value of childValues(parent, name)) {
    const element = asElement(value);
    if (element !== undefined) out.push(element);
  }
  return out;
}

/** The trimmed, non-empty text of a named leaf child, or `undefined` (the first such child wins). */
export function childText(parent: MspdiElement, name: string): string | undefined {
  for (const value of childValues(parent, name)) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== '') return trimmed;
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------------------------------------
// Internals.
// ---------------------------------------------------------------------------------------------------------

/** The MS Project XML namespace that signs an MSPDI file. */
const MSP_NAMESPACE = 'schemas.microsoft.com/project';
const UTF8_BOM: readonly [number, number, number] = [0xef, 0xbb, 0xbf];
/** The OLE2 compound-document signature that begins a proprietary binary `.mpp` file. */
const OLE_SIGNATURE: readonly number[] = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * fast-xml-parser configured **defensively for untrusted input**: no declaration, no entity processing
 * (blocks entity-expansion bombs; external entities are refused outright by the library), raw string tag
 * values (the adapter coerces), and ignored attributes (MSPDI is element-centric).
 */
const PARSER_OPTIONS = {
  ignoreDeclaration: true,
  processEntities: false,
  parseTagValue: false,
  parseAttributeValue: false,
  ignoreAttributes: true,
  trimValues: true,
} as const;

const MPP_GUIDANCE =
  'MS Project .mpp is a proprietary binary format. In Project, use File → Save As → XML to export an MSPDI (.xml) file and import that.';

function err(code: MspdiParseErrorCode, message: string): { ok: false; error: MspdiParseError } {
  return { ok: false, error: { code, message } };
}

function resolveCaps(caps: Partial<MspdiParseCaps> | undefined): MspdiParseCaps {
  return {
    maxBytes: caps?.maxBytes ?? DEFAULT_MSPDI_PARSE_CAPS.maxBytes,
    maxNodes: caps?.maxNodes ?? DEFAULT_MSPDI_PARSE_CAPS.maxNodes,
  };
}

/** Whether the bytes begin with the OLE2 compound-document signature (a `.mpp` binary). */
function hasOleSignature(bytes: Uint8Array): boolean {
  if (bytes.byteLength < OLE_SIGNATURE.length) return false;
  for (let i = 0; i < OLE_SIGNATURE.length; i += 1) {
    if (bytes[i] !== OLE_SIGNATURE[i]) return false;
  }
  return true;
}

/**
 * Decode raw input to text. A `string` is treated as already decoded; a `Uint8Array` is decoded honouring
 * a UTF-8 or UTF-16 (LE/BE) BOM and otherwise defaults to UTF-8 (XML's default). A `.mpp` OLE binary is
 * rejected here with guidance. Never throws.
 */
function decodeInput(
  input: Uint8Array | string,
  caps: MspdiParseCaps,
): { ok: true; text: string } | { ok: false; error: MspdiParseError } {
  if (typeof input === 'string') {
    if (input.length > caps.maxBytes) {
      return err('FILE_TOO_LARGE', `File exceeds the maximum size of ${caps.maxBytes} bytes.`);
    }
    return { ok: true, text: input.startsWith('﻿') ? input.slice(1) : input };
  }

  if (input.byteLength > caps.maxBytes) {
    return err('FILE_TOO_LARGE', `File exceeds the maximum size of ${caps.maxBytes} bytes.`);
  }
  if (hasOleSignature(input)) {
    return err('UNSUPPORTED_MPP', MPP_GUIDANCE);
  }

  const hasUtf8Bom =
    input.byteLength >= 3 &&
    input[0] === UTF8_BOM[0] &&
    input[1] === UTF8_BOM[1] &&
    input[2] === UTF8_BOM[2];
  if (hasUtf8Bom) {
    return { ok: true, text: new TextDecoder('utf-8').decode(input.subarray(3)) };
  }
  if (input.byteLength >= 2 && input[0] === 0xff && input[1] === 0xfe) {
    return { ok: true, text: new TextDecoder('utf-16le').decode(input.subarray(2)) };
  }
  if (input.byteLength >= 2 && input[0] === 0xfe && input[1] === 0xff) {
    return { ok: true, text: new TextDecoder('utf-16be').decode(input.subarray(2)) };
  }
  return { ok: true, text: new TextDecoder('utf-8').decode(input) };
}

/** Whether decoded text carries the MS Project namespace on a `<Project>` root (the MSPDI signature). */
function looksLikeMspdi(text: string): boolean {
  return text.includes('<Project') && text.includes(MSP_NAMESPACE);
}

/** Count `<` tag markers as a coarse node ceiling (an over-count vs. real elements — that is fine). */
function countTagMarkers(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 60 /* '<' */) count += 1;
  }
  return count;
}

/**
 * Cheaply extract `<SaveVersion>…</SaveVersion>` from the head of the file without a full parse. The
 * capture is `[^<]*` (linear, unambiguous — it cannot match the following `<` delimiter) and trimming
 * happens in JS; an overlapping `\s*…[^<]+?…\s*` form is a polynomial-backtracking ReDoS on untrusted
 * input (CodeQL js/polynomial-redos) and is deliberately avoided.
 */
function saveVersionFromText(text: string): string | null {
  const match = /<SaveVersion>([^<]*)<\/SaveVersion>/.exec(text);
  const value = match?.[1]?.trim();
  return value !== undefined && value !== '' ? value : null;
}

/** Shared decode + signature gate for detect/parse. */
function decodeAndSignatureCheck(
  input: Uint8Array | string,
  caps: MspdiParseCaps,
): { ok: true; text: string } | { ok: false; error: MspdiParseError } {
  const decoded = decodeInput(input, caps);
  if (!decoded.ok) return decoded;
  if (decoded.text.trim() === '') {
    return err('EMPTY_FILE', 'The file is empty.');
  }
  // A `.mpp` passed as a string (not bytes) still cannot carry the MSPDI namespace — caught below.
  if (!looksLikeMspdi(decoded.text)) {
    return err(
      'NOT_MSPDI',
      'This is not a recognised Microsoft Project MSPDI (.xml) file (the MS Project namespace is missing).',
    );
  }
  return { ok: true, text: decoded.text };
}

// ---------------------------------------------------------------------------------------------------------
// Public API.
// ---------------------------------------------------------------------------------------------------------

/**
 * Detect whether `input` is a Microsoft Project MSPDI file and, if so, extract its `SaveVersion`. Reads
 * only the file's signature (namespace + a cheap version scan) — it never builds the parse tree. Non-MSPDI
 * input (including a `.mpp` binary) is hard-rejected with a typed error.
 */
export function detectMspdi(
  input: Uint8Array | string,
  options?: MspdiParseOptions,
): MspdiDetectResult {
  const caps = resolveCaps(options?.caps);
  const gate = decodeAndSignatureCheck(input, caps);
  if (!gate.ok) return gate;
  return { ok: true, header: { version: saveVersionFromText(gate.text) } };
}

/**
 * Parse an MSPDI file into a typed `{ version, project }` document. The `<Project>` subtree is kept raw
 * (the adapter interprets element names). All problems — an empty / non-MSPDI / `.mpp` / oversized /
 * too-many-nodes / malformed file, or a file whose XML is well-formed but carries no `<Project>` element —
 * are returned as a typed {@link MspdiParseError}; a caller never catches a raw exception (an external
 * entity or reserved tag name that makes the underlying library throw is caught here and reported).
 */
export function parseMspdi(
  input: Uint8Array | string,
  options?: MspdiParseOptions,
): MspdiParseResult {
  const caps = resolveCaps(options?.caps);

  const gate = decodeAndSignatureCheck(input, caps);
  if (!gate.ok) return gate;
  const text = gate.text;

  if (countTagMarkers(text) > caps.maxNodes) {
    return err('TOO_MANY_NODES', `File exceeds the maximum of ${caps.maxNodes} XML nodes.`);
  }

  // Well-formedness gate: fast-xml-parser's tolerant `parse` would silently accept some malformed input
  // (e.g. a mismatched closing tag), so the strict validator is the structural gate.
  const validation = XMLValidator.validate(text);
  if (validation !== true) {
    return err('MALFORMED_STRUCTURE', 'The file is not well-formed XML.');
  }

  let parsed: unknown;
  try {
    parsed = new XMLParser(PARSER_OPTIONS).parse(text);
  } catch {
    // A refused external entity / reserved tag name / other library-level rejection — inert + reported.
    return err('MALFORMED_STRUCTURE', 'The file could not be parsed as a valid MSPDI document.');
  }

  const root = asElement(parsed as MspdiValue | undefined);
  const project = root === undefined ? undefined : asElement(root.Project);
  if (project === undefined) {
    return err('MALFORMED_STRUCTURE', 'The file has no <Project> root element.');
  }

  return { ok: true, document: { version: childText(project, 'SaveVersion') ?? null, project } };
}
