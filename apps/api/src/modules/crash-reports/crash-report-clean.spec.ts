import { describe, expect, it } from 'vitest';

import {
  MAX_COMPONENT_STACK_LENGTH,
  MAX_FRAMES,
  MAX_MESSAGE_LENGTH,
  MAX_STACK_LENGTH,
  capCodePoints,
  cleanComponentStack,
  cleanErrorName,
  cleanFrames,
  cleanMessage,
  cleanRoutePattern,
  cleanWebVersion,
  stackText,
} from './crash-report-clean';

const ORIGINS = ['https://app.example'];

describe('cleanMessage — one fixture per rule', () => {
  it('reduces a URL to scheme://host, dropping userinfo, path, query and fragment', () => {
    expect(cleanMessage('GET https://user:pw@api.example/v1/plans?token=abc#frag failed')).toBe(
      'GET https://api.example failed',
    );
    expect(cleanMessage('See https://react.dev/errors/185?invariant=185 for details.')).toBe(
      'See https://react.dev for details.',
    );
  });

  it('loses a slug in a URL path, because a slug is a customer', () => {
    const cleaned = cleanMessage(
      'Failed https://app.example/api/v1/organizations/acme-corp/clients/jane-smith',
    );
    expect(cleaned).toBe('Failed https://app.example');
  });

  it('drops a rooted path with or without a query, one segment or many', () => {
    expect(cleanMessage('Failed /api/v1/organizations/acme/plans?search=Jane%20Doe now')).toBe(
      'Failed [path] now',
    );
    expect(cleanMessage('no route /organizations/acme-corp/plans/tower-a')).toBe('no route [path]');
    expect(cleanMessage("bad '/jane-smith' value")).toBe("bad '…' value");
  });

  it('drops a scheme-less host path and any token carrying a query', () => {
    expect(cleanMessage('GET www.x.com/customers/jane?token=abc failed')).toBe('GET [path] failed');
    expect(cleanMessage('GET www.x.com/customers/jane failed')).toBe('GET [path] failed');
    expect(cleanMessage('bad page?name=Jane here')).toBe('bad [path] here');
  });

  it('leaves prose with a slash or a question mark alone', () => {
    expect(cleanMessage('expected and/or text/html, got 1/2. Did you mean? Yes')).toBe(
      'expected and/or text/html, got 1/2. Did you mean? Yes',
    );
  });

  it('drops a regular-expression literal', () => {
    expect(cleanMessage('Invalid pattern /^acme-corp$/i for field')).toBe(
      'Invalid pattern [regex] for field',
    );
    expect(cleanMessage('Invalid pattern /(jane|john) smith/ here')).toBe(
      'Invalid pattern [regex] here',
    );
  });

  it('redacts an email', () => {
    expect(cleanMessage('Invite for ada@example.com failed')).toBe('Invite for [email] failed');
  });

  it('redacts a non-ASCII local part and an internationalised domain', () => {
    expect(cleanMessage('Invite for josé@example.com failed')).toBe('Invite for [email] failed');
    expect(cleanMessage('Invite for ada@müller.de and 李@例え.jp')).toBe(
      'Invite for [email] and [email]',
    );
  });

  it('redacts a UUID', () => {
    expect(cleanMessage('No activity 0b9f7c1e-3a52-4d0e-8a1b-5c2d9e7f1a30')).toBe(
      'No activity [id]',
    );
  });

  it('redacts a run of four or more digits and leaves a shorter one', () => {
    expect(cleanMessage('code 123456 and 185 and 1234')).toBe('code [n] and 185 and [n]');
  });

  it('redacts digit runs written in other scripts', () => {
    expect(cleanMessage('code ١٢٣٤٥٦ and １２３４５ and 12')).toBe('code [n] and [n] and 12');
  });

  it('keeps a quoted bare identifier, so `reading startAt` survives', () => {
    expect(cleanMessage("Cannot read properties of undefined (reading 'startAt')")).toBe(
      "Cannot read properties of undefined (reading 'startAt')",
    );
  });

  it('redacts a quoted value that is not a bare identifier, in all three quote styles', () => {
    expect(cleanMessage(`bad 'Mrs Smith' and "secret plan" and \`k 1\``)).toBe(
      "bad '…' and '…' and '…'",
    );
  });

  it('redacts a JSON.parse snippet', () => {
    const message = `Unexpected token 'o', "[object Obj"... is not valid JSON`;
    expect(cleanMessage(message)).toBe("Unexpected token 'o', '…'... is not valid JSON");
  });

  it('redacts a Zod-style received value', () => {
    expect(cleanMessage("Invalid enum value. Expected 'a' | 'b', received \"Acme Tower\"")).toBe(
      "Invalid enum value. Expected 'a' | 'b', received '…'",
    );
  });

  it('treats an unterminated quote as running to the end, so nothing slips past it', () => {
    expect(cleanMessage("failed on 'Mrs Smith at 12 Elm St")).toBe("failed on '…'");
  });

  it('reduces a data: URI to its scheme', () => {
    expect(cleanMessage('bad src data:text/plain;base64,QWNtZSBwbGFu end')).toBe(
      'bad src data:[uri] end',
    );
  });

  it('collapses whitespace', () => {
    expect(cleanMessage('a \n\t b   c')).toBe('a b c');
  });

  it('removes U+0000 and turns other controls into spaces', () => {
    expect(cleanMessage('a\u0000b\u001fc')).toBe('ab c');
    expect(cleanMessage('12\u000034 56')).toBe('[n] 56');
  });

  it('replaces a lone surrogate', () => {
    expect(cleanMessage('a\uD800b')).toBe('a�b');
  });

  it('caps last, at 300 code points, without splitting a pair', () => {
    const cleaned = cleanMessage('😀'.repeat(400));
    expect(Array.from(cleaned)).toHaveLength(MAX_MESSAGE_LENGTH);
    expect(cleaned).not.toMatch(/�/);
  });

  it('caps AFTER redaction: a cap before it would let `[email]` overrun the column', () => {
    const cleaned = cleanMessage('a@b.co '.repeat(100));
    expect(Array.from(cleaned).length).toBeLessThanOrEqual(MAX_MESSAGE_LENGTH);
  });

  it('answers an empty string for a non-string', () => {
    expect(cleanMessage(undefined)).toBe('');
    expect(cleanMessage({ toString: () => 'x' })).toBe('');
  });

  it('is stable when run twice', () => {
    const once = cleanMessage(`x "a b" 'c' 99999 https://h/p?q=1 /a/b`);
    expect(cleanMessage(once)).toBe(once);
  });
});

describe('cleanErrorName / cleanRoutePattern / cleanWebVersion', () => {
  it('keeps an identifier and replaces anything else with Error', () => {
    expect(cleanErrorName('TypeError')).toBe('TypeError');
    expect(cleanErrorName('NonError')).toBe('NonError');
    expect(cleanErrorName('Bad Name')).toBe('Error');
    expect(cleanErrorName('A'.repeat(65))).toBe('Error');
    expect(cleanErrorName(42)).toBe('Error');
  });

  it('keeps a route id and refuses a resolved or UUID-bearing one', () => {
    expect(cleanRoutePattern('/_authed/orgs/$orgSlug/plans/$planId')).toBe(
      '/_authed/orgs/$orgSlug/plans/$planId',
    );
    expect(cleanRoutePattern('/orgs/0b9f7c1e-3a52-4d0e-8a1b-5c2d9e7f1a30')).toBeNull();
    expect(cleanRoutePattern('/orgs/acme?x=1')).toBeNull();
    expect(cleanRoutePattern('')).toBeNull();
    expect(cleanRoutePattern('/a'.repeat(101))).toBeNull();
  });

  it('keeps a version token and otherwise says unknown', () => {
    expect(cleanWebVersion('0.200.7')).toBe('0.200.7');
    expect(cleanWebVersion('1.0.0-rc.1+build')).toBe('1.0.0-rc.1+build');
    expect(cleanWebVersion('v 1')).toBe('unknown');
    expect(cleanWebVersion('1'.repeat(33))).toBe('unknown');
    expect(cleanWebVersion(null)).toBe('unknown');
  });
});

describe('cleanFrames', () => {
  const v8 = [
    "TypeError: Cannot read properties of undefined (reading 'x')",
    '    at PlanView (/assets/plan-Ab12.jsx:10:20)',
    '    at https://app.example/assets/canvas-Cd34.jsx:1:2',
    '    at async Object.run (https://evil.example/x.js?token=1:3:4)',
    '    at Foo.<anonymous> (chrome-extension://abc/inject.jsx:5:6)',
  ].join('\n');

  it('drops the leading Name: message line and keeps path-only frames', () => {
    expect(cleanFrames(v8, ORIGINS)).toEqual([
      'PlanView @ /assets/plan-Ab12.jsx:10:20',
      '? @ /assets/canvas-Cd34.jsx:1:2',
      'Object.run @ [https]:3:4',
      '? @ [chrome-extension]:5:6',
    ]);
  });

  it('reads Firefox and Safari frames', () => {
    expect(
      cleanFrames('render@/assets/a.jsx:1:2\n@https://app.example/assets/b.jsx:3:4', ORIGINS),
    ).toEqual(['render @ /assets/a.jsx:1:2', '? @ /assets/b.jsx:3:4']);
  });

  it('does not take a message that contains @ for a frame', () => {
    expect(cleanFrames('Error: mail ada@example.com failed', ORIGINS)).toEqual([]);
  });

  it('refuses a path with a UUID or a character outside the asset alphabet', () => {
    expect(
      cleanFrames(
        'at a (/orgs/0b9f7c1e-3a52-4d0e-8a1b-5c2d9e7f1a30/x.jsx:1:2)\nat b (/a b/c.jsx:1:2)',
        ORIGINS,
      ),
    ).toEqual(['a @ ?:1:2', 'b @ ?:1:2']);
  });

  it('caps at 20 frames and 4,000 characters, last', () => {
    const line = `at fn${'x'.repeat(40)} (/assets/${'p'.repeat(150)}.jsx:1:2)`;
    const frames = cleanFrames(Array.from({ length: 50 }, () => line).join('\n'), ORIGINS);
    expect(frames).toHaveLength(MAX_FRAMES);
    const text = stackText(frames) ?? '';
    expect(Array.from(text).length).toBeLessThanOrEqual(MAX_STACK_LENGTH);
  });

  it('returns nothing for a non-string, and null text for no frames', () => {
    expect(cleanFrames(undefined, ORIGINS)).toEqual([]);
    expect(stackText([])).toBeNull();
  });

  it('strips a NUL inside a frame', () => {
    expect(cleanFrames('at a\u0000b (/x.jsx:1:2)', ORIGINS)).toEqual(['ab @ /x.jsx:1:2']);
  });
});

describe('cleanComponentStack', () => {
  it('keeps component names and cleaned locations, and names with no location', () => {
    const raw = '\n    at Foo (https://app.example/assets/a.jsx:1:2)\n    at div\n    at Bar';
    expect(cleanComponentStack(raw, ORIGINS)).toBe('Foo @ /assets/a.jsx:1:2\ndiv\nBar');
  });

  it('turns a non-identifier component name into ? and caps at 20 lines / 2,000 characters', () => {
    expect(cleanComponentStack('at Foo Bar', ORIGINS)).toBe('?');
    const raw = Array.from({ length: 40 }, () => `at ${'C'.repeat(60)}`).join('\n');
    const text = cleanComponentStack(raw, ORIGINS) ?? '';
    expect(text.split('\n')).toHaveLength(MAX_FRAMES);
    expect(Array.from(text).length).toBeLessThanOrEqual(MAX_COMPONENT_STACK_LENGTH);
  });

  it('is null when there is nothing', () => {
    expect(cleanComponentStack('', ORIGINS)).toBeNull();
    expect(cleanComponentStack(undefined, ORIGINS)).toBeNull();
  });
});

describe('capCodePoints', () => {
  it('leaves a short value alone and cuts a long one', () => {
    expect(capCodePoints('abc', 5)).toBe('abc');
    expect(capCodePoints('abcdef', 5)).toBe('abcde');
  });
});
