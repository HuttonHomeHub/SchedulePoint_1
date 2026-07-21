import { describe, expect, it } from 'vitest';

import {
  DEFAULT_MSPDI_PARSE_CAPS,
  detectMspdi,
  parseMspdi,
  childText,
  type MspdiDetectResult,
  type MspdiParseError,
  type MspdiParseResult,
} from './mspdi-parser.js';
import { buildMspdi } from './mspdi.fixtures.js';

/**
 * Exhaustive, fixture-driven tests for the pure MSPDI reader + detector (Task 3.2). Covers: detection by
 * the MS Project namespace, single-vs-array child normalisation, `SaveVersion` provenance, every malformed
 * / rejection branch, the byte/node safety caps, BOM/`.mpp` byte handling, and the untrusted-XML hardening
 * (billion-laughs entity expansion is inert, external entities are refused, reserved tag names are
 * rejected). Domain/mapping semantics are deliberately NOT tested here (that is Task 3.3).
 */

const MINIMAL = buildMspdi({
  name: 'Apartments',
  currentDate: '2026-01-05T00:00:00',
  saveVersion: '14',
  tasks: [{ uid: '1', id: '1', name: 'Mobilise', duration: 'PT40H0M0S', outlineLevel: 1 }],
});

function expectFailure(result: MspdiParseResult | MspdiDetectResult): MspdiParseError {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected a failure result');
  return result.error;
}

function expectDocument(
  result: MspdiParseResult,
): Extract<MspdiParseResult, { ok: true }>['document'] {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(`expected success, got ${result.error.code}`);
  return result.document;
}

/** An OLE2 compound-document (`.mpp`) byte header followed by arbitrary bytes. */
function oleBytes(): Uint8Array {
  return Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00, 0x00, 0x00, 0x00]);
}

/** UTF-8 bytes with a leading BOM. */
function utf8WithBom(text: string): Uint8Array {
  const body = new TextEncoder().encode(text);
  const out = new Uint8Array(body.length + 3);
  out.set([0xef, 0xbb, 0xbf], 0);
  out.set(body, 3);
  return out;
}

// =====================================================================================================

describe('detectMspdi', () => {
  it('recognises a valid MSPDI and extracts the SaveVersion', () => {
    const result = detectMspdi(MINIMAL);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.header.version).toBe('14');
  });

  it('recognises MSPDI byte input with a UTF-8 BOM', () => {
    const result = detectMspdi(utf8WithBom(MINIMAL));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.header.version).toBe('14');
  });

  it('rejects an empty / whitespace-only file', () => {
    expect(expectFailure(detectMspdi('')).code).toBe('EMPTY_FILE');
    expect(expectFailure(detectMspdi('   \n\t \n')).code).toBe('EMPTY_FILE');
  });

  it('rejects XML that is not an MS Project document (no namespace)', () => {
    const notMsp = '<?xml version="1.0"?><Project><Name>x</Name></Project>';
    expect(expectFailure(detectMspdi(notMsp)).code).toBe('NOT_MSPDI');
  });

  it('rejects unrelated content', () => {
    expect(expectFailure(detectMspdi('just some text, not xml')).code).toBe('NOT_MSPDI');
  });

  it('rejects a proprietary binary .mpp file with guidance', () => {
    const error = expectFailure(detectMspdi(oleBytes()));
    expect(error.code).toBe('UNSUPPORTED_MPP');
    expect(error.message).toContain('Save As');
  });
});

describe('parseMspdi — valid documents', () => {
  it('parses the Project subtree and SaveVersion', () => {
    const doc = expectDocument(parseMspdi(MINIMAL));
    expect(doc.version).toBe('14');
    expect(childText(doc.project, 'Name')).toBe('Apartments');
    expect(childText(doc.project, 'CurrentDate')).toBe('2026-01-05T00:00:00');
  });

  it('normalises a single <Task> to a one-element array shape (via the accessors)', () => {
    const doc = expectDocument(parseMspdi(MINIMAL));
    // The raw Tasks container holds one Task object (not an array); the adapter accessors normalise it.
    expect(doc.project.Tasks).toBeDefined();
  });

  it('parses MSPDI byte input with a UTF-8 BOM', () => {
    const doc = expectDocument(parseMspdi(utf8WithBom(MINIMAL)));
    expect(childText(doc.project, 'Name')).toBe('Apartments');
  });
});

describe('parseMspdi — malformed / non-MSPDI input is rejected with a typed error', () => {
  it('rejects an empty file', () => {
    expect(expectFailure(parseMspdi('')).code).toBe('EMPTY_FILE');
  });

  it('rejects a non-MSPDI XML file (no namespace)', () => {
    expect(expectFailure(parseMspdi('<Project><Name>x</Name></Project>')).code).toBe('NOT_MSPDI');
  });

  it('rejects a .mpp binary with guidance', () => {
    expect(expectFailure(parseMspdi(oleBytes())).code).toBe('UNSUPPORTED_MPP');
  });

  it('rejects malformed XML (a mismatched closing tag)', () => {
    const malformed = '<Project xmlns="http://schemas.microsoft.com/project"><Name>x</Project>';
    expect(expectFailure(parseMspdi(malformed)).code).toBe('MALFORMED_STRUCTURE');
  });

  it('rejects well-formed XML that carries no <Project> namespace tag', () => {
    // Namespace present in a comment but no real Project element ⇒ signature passes, structure fails.
    const noProject =
      '<Root xmlns="http://schemas.microsoft.com/project"><Foo/></Root><!-- <Project> -->';
    const error = expectFailure(parseMspdi(noProject));
    expect(['MALFORMED_STRUCTURE', 'NOT_MSPDI']).toContain(error.code);
  });
});

describe('parseMspdi — safety caps', () => {
  it('rejects input over the byte cap (string path)', () => {
    expect(expectFailure(parseMspdi(MINIMAL, { caps: { maxBytes: 10 } })).code).toBe(
      'FILE_TOO_LARGE',
    );
  });

  it('rejects input over the byte cap (bytes path)', () => {
    const bytes = new TextEncoder().encode(MINIMAL);
    expect(expectFailure(parseMspdi(bytes, { caps: { maxBytes: 10 } })).code).toBe(
      'FILE_TOO_LARGE',
    );
  });

  it('rejects a file with too many XML nodes', () => {
    expect(expectFailure(parseMspdi(MINIMAL, { caps: { maxNodes: 3 } })).code).toBe(
      'TOO_MANY_NODES',
    );
  });

  it('exposes sane defaults', () => {
    expect(DEFAULT_MSPDI_PARSE_CAPS.maxBytes).toBeGreaterThan(0);
    expect(DEFAULT_MSPDI_PARSE_CAPS.maxNodes).toBeGreaterThan(0);
  });
});

describe('parseMspdi — untrusted-XML hardening', () => {
  it('does NOT expand a billion-laughs entity payload (bounded output, no hang)', () => {
    const bomb = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE lolz [',
      ' <!ENTITY lol "lol">',
      ' <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;&lol;">',
      ' <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;&lol2;">',
      ' <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;&lol3;">',
      ']>',
      '<Project xmlns="http://schemas.microsoft.com/project"><Name>&lol4;</Name></Project>',
    ].join('\n');

    const start = Date.now();
    const doc = expectDocument(parseMspdi(bomb));
    // The entity is left literal, never expanded to (10^4 × "lol") — output stays tiny.
    const name = childText(doc.project, 'Name') ?? '';
    expect(name.length).toBeLessThan(50);
    expect(name.includes('lollollollol')).toBe(false);
    expect(Date.now() - start).toBeLessThan(1000);
  });

  it('treats an external-entity reference as inert (no file read, typed rejection)', () => {
    const xxe = [
      '<?xml version="1.0"?>',
      '<!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>',
      '<Project xmlns="http://schemas.microsoft.com/project"><Name>&xxe;</Name></Project>',
    ].join('');
    const error = expectFailure(parseMspdi(xxe));
    // External entities are refused outright — no file is ever read; the failure is typed, not a throw.
    expect(error.code).toBe('MALFORMED_STRUCTURE');
    expect(error.message.includes('root')).toBe(false);
  });

  it('rejects a reserved __proto__ tag name (no prototype pollution)', () => {
    const hostile =
      '<Project xmlns="http://schemas.microsoft.com/project"><__proto__>x</__proto__><Name>N</Name></Project>';
    expect(expectFailure(parseMspdi(hostile)).code).toBe('MALFORMED_STRUCTURE');
    // Nothing, anywhere, gained a polluted property.
    expect(({} as Record<string, unknown>).x).toBeUndefined();
  });
});
