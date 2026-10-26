import { describe, expect, it } from 'vitest';

import {
  cleanNoteText,
  decodeXmlEntities,
  htmlToText,
  importNoteText,
  looksLikeHtml,
  NOTE_BODY_MAX,
  NOTE_JOINER,
  NOTE_RAW_MAX,
  noteBodiesToMemoHtml,
  noteBodiesToPlainNotes,
  splitNoteBody,
} from './note-text.js';

describe('decodeXmlEntities', () => {
  it.each([
    ['A &amp; B', 'A & B'],
    ['&lt;b&gt; &quot;x&quot; &apos;y&apos;', '<b> "x" \'y\''],
    ['line&#10;two', 'line\ntwo'],
    ['tab&#x9;here', 'tab\there'],
    ['&#x1F600;', '\u{1F600}'],
  ])('decodes %j', (input, expected) => {
    expect(decodeXmlEntities(input)).toBe(expected);
  });

  it('keeps what it cannot decode as written', () => {
    expect(decodeXmlEntities('&nbsp; &bogus; &#xD800; &#1114112; &amp')).toBe(
      '&nbsp; &bogus; &#xD800; &#1114112; &amp',
    );
  });

  it('decodes once, never twice', () => {
    expect(decodeXmlEntities('&amp;lt;')).toBe('&lt;');
  });
});

describe('looksLikeHtml', () => {
  it.each(['<p>x</p>', 'a <b>b</b>', '<br>', '<!-- c -->', 'x </div> y'])('detects %j', (input) => {
    expect(looksLikeHtml(input)).toBe(true);
  });

  it.each(['x<y', '1 < 2 and 3 > 2', 'a <3 b', 'plain text', '<', '<>', '< b>', 'x <b'])(
    'does not detect %j',
    (input) => {
      expect(looksLikeHtml(input)).toBe(false);
    },
  );
});

describe('htmlToText', () => {
  const text = (html: string) => htmlToText(html, true).text;

  it('turns blocks into line breaks and list items into bullets', () => {
    expect(text('<p>One</p><p>Two</p>')).toBe('One\nTwo\n');
    expect(text('a<br>b<br/>c<BR />d')).toBe('a\nb\nc\nd');
    expect(text('<ul><li>x</li><li>y</li></ul>')).toBe('• x\n• y\n');
    expect(text('a<hr>b')).toBe('a\nb');
    expect(text('<table><tr><td>a</td></tr><tr><td>b</td></tr></table>')).toBe('a\nb\n');
  });

  it('removes other tags and keeps their text', () => {
    expect(text('<font color="red"><b>Hot</b></font> work')).toBe('Hot work');
  });

  it('drops script, style and head with their content', () => {
    expect(text('a<script>alert(1)</script>b')).toBe('ab');
    expect(text('a<STYLE>p{x:y}</STYLE>b')).toBe('ab');
    expect(text('<head><title>T</title></head><body>b</body>')).toBe('b');
  });

  it('drops an unterminated script to the end rather than showing its source', () => {
    expect(text('a<script>alert(1)')).toBe('a');
  });

  it('drops a comment, and keeps an unterminated one as text', () => {
    expect(text('a<!-- hidden -->b')).toBe('ab');
    expect(text('a<!-- never closed')).toBe('a<!-- never closed');
  });

  it('keeps a "<" that does not start a tag', () => {
    expect(text('<b>x</b> then y<z or 1 < 2 and 3 > 2')).toBe('x then y<z or 1 < 2 and 3 > 2');
  });

  it('decodes entities after tags are gone, so an escaped tag stays text', () => {
    expect(text('<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &nbsp;x</p>')).toBe(
      '<script>alert(1)</script> &  x\n',
    );
  });

  it('collapses three newlines to two only when asked to', () => {
    expect(htmlToText('a<br><br><br><br>b', true).text).toBe('a\n\nb');
    expect(htmlToText('a<br><br><br><br>b', false).text).toBe('a\n\n\n\nb');
  });

  it('says when markup beyond line structure was removed', () => {
    expect(htmlToText('<html><body><p>a</p><br></body></html>', true).formatted).toBe(false);
    expect(htmlToText('<!DOCTYPE html><p>a</p>', true).formatted).toBe(false);
    expect(htmlToText('<p><b>a</b></p>', true).formatted).toBe(true);
    expect(htmlToText('a<script>x</script>', true).formatted).toBe(true);
  });

  it('is linear on hostile input', () => {
    for (const hostile of [
      '<'.repeat(1_000_000),
      '<a'.repeat(500_000),
      '<a '.repeat(300_000),
      '<!--'.repeat(250_000),
      '<script>'.repeat(125_000),
      `<a ${'x'.repeat(999_000)}`,
    ]) {
      const started = performance.now();
      htmlToText(hostile, true);
      looksLikeHtml(hostile);
      expect(performance.now() - started).toBeLessThan(1500);
    }
  });
});

describe('cleanNoteText', () => {
  it('normalises line breaks and trims', () => {
    expect(cleanNoteText('  a\r\nb\rc  ')).toBe('a\nb\nc');
  });

  it('keeps newline and tab, removes every other control character including NUL', () => {
    expect(cleanNoteText('a\u0000b\u0001c\td\u007fe\u0085f\nɡ')).toBe('abc\tdef\nɡ');
  });

  it('removes bidirectional overrides and isolates and zero-width characters', () => {
    expect(cleanNoteText('a\u202Eb\u202Ac\u2066d\u2069e\u200Bf\u200Dg\uFEFFh')).toBe('abcdefgh');
  });

  it('removes them when they arrive as numeric references, which is how a file smuggles one in', () => {
    expect(importNoteText('right&#8238;left &#x200B;gap', 'XML_TEXT')).toMatchObject({
      bodies: ['rightleft gap'],
    });
    expect(importNoteText('<p>x&#8238;y</p>', 'XER_FOREIGN')).toMatchObject({ bodies: ['xy'] });
  });

  it('removes unpaired surrogates and keeps pairs', () => {
    expect(cleanNoteText('a\uD800b\uDC00c\u{1F600}')).toBe('abc\u{1F600}');
  });
});

describe('splitNoteBody', () => {
  const paragraph = (n: number) => `${'w'.repeat(n)}`;

  it('refuses a window too small to advance', () => {
    expect(() => splitNoteBody('abc', 1)).toThrow(RangeError);
    expect(() => splitNoteBody('abc', 0)).toThrow(RangeError);
    expect(splitNoteBody('abcd', 2)).toEqual(['ab', 'cd']);
  });

  it('leaves 4,999 and 5,000 characters whole', () => {
    expect(splitNoteBody(paragraph(4999))).toEqual([paragraph(4999)]);
    expect(splitNoteBody(paragraph(5000))).toEqual([paragraph(5000)]);
  });

  it('splits 5,001 characters into pieces that each fit', () => {
    const pieces = splitNoteBody(paragraph(5001));
    expect(pieces.map((p) => p.length)).toEqual([5000, 1]);
  });

  it('prefers a paragraph boundary, then a line, then whitespace', () => {
    const para = `${paragraph(3000)}\n\n${paragraph(3000)}`;
    expect(splitNoteBody(para)).toEqual([paragraph(3000), paragraph(3000)]);
    const line = `${paragraph(3000)}\n${paragraph(3000)}`;
    expect(splitNoteBody(line)).toEqual([paragraph(3000), paragraph(3000)]);
    const space = `${paragraph(3000)} ${paragraph(3000)}`;
    expect(splitNoteBody(space)).toEqual([paragraph(3000), paragraph(3000)]);
  });

  it('ignores a boundary in the first half of the window', () => {
    const early = `${paragraph(100)}\n\n${paragraph(5100)}`;
    expect(splitNoteBody(early).map((p) => p.length)).toEqual([5000, 202]);
  });

  it('never cuts a surrogate pair', () => {
    const text = 'a'.repeat(4999) + '\u{1F600}'.repeat(10);
    const pieces = splitNoteBody(text);
    expect(pieces.every((p) => p.length <= NOTE_BODY_MAX)).toBe(true);
    expect(pieces.join('')).toBe(text);
    expect(pieces.every((p) => !/[\uD800-\uDBFF]$/.test(p) && !/^[\uDC00-\uDFFF]/.test(p))).toBe(
      true,
    );
  });

  it('loses nothing but whitespace at the cuts', () => {
    const words = Array.from({ length: 3000 }, (_, i) => `word${i}`).join(' ');
    const pieces = splitNoteBody(words);
    expect(pieces.length).toBeGreaterThan(1);
    expect(pieces.every((p) => p.length <= NOTE_BODY_MAX && p === p.trim())).toBe(true);
    expect(pieces.join(' ')).toBe(words);
  });

  it('handles the largest accepted memo quickly', () => {
    const started = performance.now();
    const pieces = splitNoteBody('x'.repeat(NOTE_RAW_MAX));
    expect(pieces.length).toBe(200);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe('importNoteText', () => {
  it('refuses a raw memo over the bound', () => {
    expect(importNoteText('x'.repeat(NOTE_RAW_MAX + 1), 'XER_FOREIGN')).toEqual({
      ok: false,
      reason: 'TOO_LARGE',
    });
    expect(importNoteText('x'.repeat(NOTE_RAW_MAX), 'XML_TEXT').ok).toBe(true);
  });

  it('refuses RTF', () => {
    expect(importNoteText('{\\rtf1\\ansi Hello}', 'XML_TEXT')).toEqual({
      ok: false,
      reason: 'RICH_TEXT',
    });
  });

  it('reads MSPDI text through XML entities, not as HTML', () => {
    const result = importNoteText('A &amp; B &lt;b&gt;bold&lt;/b&gt;&#10;next', 'XML_TEXT');
    expect(result).toMatchObject({
      ok: true,
      bodies: ['A & B <b>bold</b>\nnext'],
      formatted: false,
    });
  });

  it('treats a foreign XER memo as HTML only when it contains a tag-shaped token', () => {
    expect(importNoteText('x<y and &amp; z', 'XER_FOREIGN')).toMatchObject({
      bodies: ['x<y and &amp; z'],
      formatted: false,
    });
    expect(importNoteText('<p>Hello <b>world</b></p>', 'XER_FOREIGN')).toMatchObject({
      bodies: ['Hello world'],
      formatted: true,
    });
  });

  it('prefixes a foreign topic as the first line of every note', () => {
    expect(importNoteText('Body', 'XER_FOREIGN', 'Site Notes')).toMatchObject({
      bodies: ['[Site Notes]\nBody'],
    });
    expect(importNoteText('   ', 'XER_FOREIGN', 'Site Notes')).toMatchObject({ bodies: [] });
  });

  it('ignores a blank memo', () => {
    expect(importNoteText('  \n\t ', 'XML_TEXT')).toMatchObject({ ok: true, bodies: [] });
    expect(importNoteText('<p>&nbsp;</p>', 'XER_FOREIGN')).toMatchObject({ ok: true, bodies: [] });
  });

  it('removes a NUL so the row can be stored', () => {
    const result = importNoteText('bad\u0000byte', 'XML_TEXT');
    expect(result).toMatchObject({ bodies: ['badbyte'] });
  });

  it('splits a long note and counts it', () => {
    const result = importNoteText(`${'a'.repeat(3000)}\n\n${'b'.repeat(3000)}`, 'XML_TEXT');
    expect(result).toMatchObject({ ok: true, longNotes: 1, longPieces: 2 });
    if (result.ok) expect(result.bodies.every((b) => b.length <= NOTE_BODY_MAX)).toBe(true);
  });

  it('reads a SchedulePoint memo as several notes with no prefix', () => {
    const memo = noteBodiesToMemoHtml(['first', 'second\nline']);
    expect(importNoteText(memo, 'XER_SCHEDULEPOINT', 'ignored')).toMatchObject({
      bodies: ['first', 'second\nline'],
      formatted: false,
    });
  });
});

describe('the round trip through the XER memo', () => {
  const tricky = [
    'plain',
    'A & B < C > D "quoted"',
    'tab\there',
    'blank\n\nlines\n\n\nand three',
    'literal <hr> and <br> and <script>alert(1)</script>',
    'ünïcödé — 日本語 \u{1F600}',
    'x'.repeat(NOTE_BODY_MAX),
  ];

  it('returns the same bodies, byte for byte', () => {
    const memo = noteBodiesToMemoHtml(tricky);
    expect(memo).not.toMatch(/[\t\n]/);
    const back = importNoteText(memo, 'XER_SCHEDULEPOINT');
    expect(back).toMatchObject({ ok: true, bodies: tricky, longNotes: 0 });
  });
});

describe('noteBodiesToMemoHtml', () => {
  it('escapes every markup character, so a body can never add structure to the memo', () => {
    expect(noteBodiesToMemoHtml(['<&>"\t\n'])).toBe(
      '<html><body>&lt;&amp;&gt;&quot;&#9;<br></body></html>',
    );
    expect(noteBodiesToMemoHtml(['a < b', '<script>x</script>'])).toBe(
      '<html><body>a &lt; b<hr>&lt;script&gt;x&lt;/script&gt;</body></html>',
    );
  });
});

describe('the export strips invisible characters too', () => {
  it('removes direction overrides and zero-width characters from both formats', () => {
    expect(noteBodiesToMemoHtml(['a\u202Eb\u200Bc'])).toBe('<html><body>abc</body></html>');
    expect(noteBodiesToPlainNotes(['a\u202Eb\u200Bc'])).toEqual({
      text: 'abc',
      removedForbidden: true,
    });
  });
});

describe('noteBodiesToPlainNotes', () => {
  it('writes one note as it is and joins several with the separator', () => {
    expect(noteBodiesToPlainNotes(['one']).text).toBe('one');
    expect(noteBodiesToPlainNotes(['a', 'b']).text).toBe(`a${NOTE_JOINER}b`);
  });

  it('removes characters XML 1.0 forbids and says so', () => {
    const result = noteBodiesToPlainNotes(['a\u0000b\u000bc\uFFFEd\uD800e']);
    expect(result).toEqual({ text: 'abcde', removedForbidden: true });
    expect(noteBodiesToPlainNotes(['clean\ttext\n']).removedForbidden).toBe(false);
  });
});
