import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { downloadBlob } from './download';

// jsdom does not implement `URL.createObjectURL` / `revokeObjectURL`, so stub them (the module no-ops
// without them). `HTMLAnchorElement.prototype.click` is a jsdom no-op, so spy it to capture the anchor.
const MOCK_URL = 'blob:mock-object-url';
const createObjectURL = vi.fn(() => MOCK_URL);
const revokeObjectURL = vi.fn();

describe('downloadBlob', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
      writable: true,
    });
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
  });

  afterEach(() => {
    Reflect.deleteProperty(URL, 'createObjectURL');
    Reflect.deleteProperty(URL, 'revokeObjectURL');
    vi.restoreAllMocks();
  });

  it('creates an object URL, clicks a named download anchor, then revokes the URL', () => {
    let captured: { download: string; href: string } | undefined;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      captured = { download: this.download, href: this.href };
      // The anchor must still be mounted at click time (some browsers require it in the DOM).
      expect(document.body.contains(this)).toBe(true);
    });

    const blob = new Blob(['id,name\r\n'], { type: 'text/csv' });
    downloadBlob(blob, 'north-tower-schedule-2026-07-20.csv');

    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(clickSpy).toHaveBeenCalledOnce();
    expect(captured?.download).toBe('north-tower-schedule-2026-07-20.csv');
    expect(captured?.href).toContain(MOCK_URL);
    // The URL is revoked so the blob can be GC'd, and the anchor is detached again.
    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
    expect(document.querySelector('a[download]')).toBeNull();
  });

  it('revokes the object URL even if the anchor click throws', () => {
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(() => downloadBlob(new Blob(['x']), 'x.csv')).toThrow('blocked');
    expect(revokeObjectURL).toHaveBeenCalledWith(MOCK_URL);
  });

  it('is a no-op when the environment has no object-URL support', () => {
    // Model a no-DOM / SSR runtime by removing `createObjectURL` (the guard checks for a function).
    Object.defineProperty(URL, 'createObjectURL', { value: undefined, configurable: true });
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click');
    expect(() => downloadBlob(new Blob(['x']), 'x.csv')).not.toThrow();
    expect(clickSpy).not.toHaveBeenCalled();
  });
});
