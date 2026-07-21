import { describe, expect, it } from 'vitest';

import { checkUploadSize, MAX_UPLOAD_BYTES, toImportError } from './interchange-errors';

import { ApiFetchError } from '@/lib/api/client';

describe('toImportError', () => {
  it('maps a 413 to an oversize message', () => {
    const result = toImportError(
      new ApiFetchError(413, { code: 'PAYLOAD_TOO_LARGE', message: 'x' }),
    );
    expect(result.kind).toBe('oversize');
    expect(result.message).toMatch(/16 MiB/);
  });

  it('maps a 422 UNPARSEABLE_FILE to a friendly "not an XER" message', () => {
    const result = toImportError(
      new ApiFetchError(422, {
        code: 'VALIDATION_FAILED',
        message: 'nope',
        details: { reason: 'UNPARSEABLE_FILE' },
      }),
    );
    expect(result.kind).toBe('unparseable');
    expect(result.message).toMatch(/Primavera P6/);
  });

  it('maps a 422 NO_FILE to a "choose a file" message', () => {
    const result = toImportError(
      new ApiFetchError(422, {
        code: 'VALIDATION_FAILED',
        message: 'nope',
        details: { reason: 'NO_FILE' },
      }),
    );
    expect(result.kind).toBe('no-file');
    expect(result.message).toMatch(/Choose a file/);
  });

  it('maps a synthetic network failure (status 0) to a connection message', () => {
    const result = toImportError(new ApiFetchError(0, { code: 'NETWORK_ERROR', message: 'x' }));
    expect(result.kind).toBe('network');
    expect(result.message).toMatch(/reach the server/);
  });

  it('falls back to a generic message for a non-ApiFetchError', () => {
    expect(toImportError(new Error('boom')).message).toMatch(/went wrong/);
  });
});

describe('checkUploadSize', () => {
  it('rejects a file over the cap and passes a file within it', () => {
    const over = { size: MAX_UPLOAD_BYTES + 1 } as File;
    const under = { size: 1024 } as File;
    expect(checkUploadSize(over)?.kind).toBe('oversize');
    expect(checkUploadSize(under)).toBeNull();
  });
});
