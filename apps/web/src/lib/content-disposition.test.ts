import { describe, expect, it } from 'vitest';

import { parseContentDispositionFilename } from './content-disposition';

describe('parseContentDispositionFilename', () => {
  it('reads the quoted filename the API sends (attachment; filename="…")', () => {
    expect(
      parseContentDispositionFilename('attachment; filename="riverside.xer"', 'fallback.xer'),
    ).toBe('riverside.xer');
  });

  it('reads a bare unquoted filename', () => {
    expect(parseContentDispositionFilename('attachment; filename=plan.xml', 'fallback.xml')).toBe(
      'plan.xml',
    );
  });

  it('prefers and URL-decodes the RFC 5987 filename* form', () => {
    expect(
      parseContentDispositionFilename(
        'attachment; filename="plan.xer"; filename*=UTF-8\'\'my%20plan.xer',
        'fallback.xer',
      ),
    ).toBe('my plan.xer');
  });

  it('falls back when the header is absent, null, or carries no filename', () => {
    expect(parseContentDispositionFilename(null, 'fallback.xer')).toBe('fallback.xer');
    expect(parseContentDispositionFilename(undefined, 'fallback.xer')).toBe('fallback.xer');
    expect(parseContentDispositionFilename('attachment', 'fallback.xer')).toBe('fallback.xer');
  });
});
