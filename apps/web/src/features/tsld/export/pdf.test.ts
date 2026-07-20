import { beforeEach, describe, expect, it, vi } from 'vitest';

import { exportDiagramToPdf, fitImageToPage } from './pdf';
// The module's own source, read via Vite's `?raw` loader, for the code-split (dynamic-import) assertion.
import pdfSource from './pdf.ts?raw';

/**
 * Unit coverage for the lazy PDF shim (spec `docs/specs/export-print/` §Milestone 3):
 * - the pure {@link fitImageToPage} page-fit math against known aspect ratios (no jsPDF, no canvas);
 * - {@link exportDiagramToPdf} against a MOCKED dynamic `import('jspdf')` — no real jsPDF runs — proving
 *   it creates a landscape doc, fits the image, and saves under the given filename, and that a library
 *   load failure REJECTS (never throws synchronously) so the caller can surface a user-safe error;
 * - a source-level assertion that jsPDF is imported dynamically (code-split), never statically.
 */

// A4 landscape in points (72 pt/in), mirroring the page `exportDiagramToPdf` creates.
const PAGE_W = 841.89;
const PAGE_H = 595.28;

// The mocked jsPDF surface. `fail` flips the constructor to throw, standing in for the dynamic
// `import('jspdf')` being unavailable (offline) — either way the caller sees a rejected promise.
const jspdf = vi.hoisted(() => {
  const save = vi.fn();
  const addImage = vi.fn();
  const state = { fail: false };
  // A regular function (not an arrow) so it is constructable — `exportDiagramToPdf` calls `new jsPDF()`.
  const jsPDF = vi.fn(function jsPDFMock() {
    if (state.fail) throw new Error('jsPDF failed to load');
    return {
      internal: { pageSize: { getWidth: () => PAGE_W, getHeight: () => PAGE_H } },
      addImage,
      save,
    };
  });
  return { save, addImage, jsPDF, state };
});

vi.mock('jspdf', () => ({ jsPDF: jspdf.jsPDF }));

beforeEach(() => {
  vi.clearAllMocks();
  jspdf.state.fail = false;
});

describe('fitImageToPage', () => {
  it('fits a portrait image onto a landscape page by its HEIGHT, centred horizontally', () => {
    const box = fitImageToPage(300, 600, PAGE_W, PAGE_H);
    // Height binds first (portrait on landscape) → box height fills the page height.
    expect(box.h).toBeCloseTo(PAGE_H, 5);
    expect(box.w).toBeCloseTo(PAGE_H * (300 / 600), 5);
    expect(box.w).toBeLessThanOrEqual(PAGE_W + 1e-6);
    expect(box.y).toBeCloseTo(0, 5);
    expect(box.x).toBeCloseTo((PAGE_W - box.w) / 2, 5);
  });

  it('fits a very wide image by its WIDTH, centred vertically', () => {
    const box = fitImageToPage(4000, 500, PAGE_W, PAGE_H);
    // Width binds first (wide) → box width fills the page width.
    expect(box.w).toBeCloseTo(PAGE_W, 5);
    expect(box.h).toBeCloseTo(PAGE_W * (500 / 4000), 5);
    expect(box.h).toBeLessThanOrEqual(PAGE_H + 1e-6);
    expect(box.x).toBeCloseTo(0, 5);
    expect(box.y).toBeCloseTo((PAGE_H - box.h) / 2, 5);
  });

  it('fits a square image by the shorter page axis (height on landscape) and centres it', () => {
    const box = fitImageToPage(1000, 1000, PAGE_W, PAGE_H);
    expect(box.w).toBeCloseTo(PAGE_H, 5);
    expect(box.h).toBeCloseTo(PAGE_H, 5);
    expect(box.y).toBeCloseTo(0, 5);
    expect(box.x).toBeCloseTo((PAGE_W - PAGE_H) / 2, 5);
  });

  it('never divides by zero on a degenerate (zero) dimension', () => {
    const box = fitImageToPage(0, 0, PAGE_W, PAGE_H);
    expect(Number.isFinite(box.w)).toBe(true);
    expect(Number.isFinite(box.h)).toBe(true);
    expect(Number.isFinite(box.x)).toBe(true);
    expect(Number.isFinite(box.y)).toBe(true);
  });
});

describe('exportDiagramToPdf (mocked dynamic import)', () => {
  const blob = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });

  it('creates a landscape page, fits the image, and saves under the filename', async () => {
    await exportDiagramToPdf(blob, {
      filename: 'north-tower-diagram-2026-07-20.pdf',
      imageWidth: 4000,
      imageHeight: 500,
    });
    expect(jspdf.jsPDF).toHaveBeenCalledWith(expect.objectContaining({ orientation: 'landscape' }));
    // Fit-to-page: a 4000×500 image binds on width, so the placed box width is the page width.
    expect(jspdf.addImage).toHaveBeenCalledTimes(1);
    const [dataUrl, format, , , w] = jspdf.addImage.mock.calls[0] as [
      string,
      string,
      number,
      number,
      number,
      number,
    ];
    expect(dataUrl.startsWith('data:image/png;base64,')).toBe(true);
    expect(format).toBe('PNG');
    expect(w).toBeCloseTo(PAGE_W, 5);
    expect(jspdf.save).toHaveBeenCalledWith('north-tower-diagram-2026-07-20.pdf');
  });

  it('REJECTS (no synchronous throw) when the jsPDF library fails to load', async () => {
    jspdf.state.fail = true;
    const call = exportDiagramToPdf(blob, {
      filename: 'x.pdf',
      imageWidth: 100,
      imageHeight: 100,
    });
    expect(call).toBeInstanceOf(Promise);
    await expect(call).rejects.toThrow();
    expect(jspdf.save).not.toHaveBeenCalled();
  });
});

describe('pdf.ts is code-split (jsPDF dynamically imported)', () => {
  it("uses a dynamic import('jspdf') so it is absent from the initial bundle", () => {
    expect(pdfSource).toMatch(/import\(\s*['"]jspdf['"]\s*\)/);
  });

  it('never statically imports from jspdf (which would pull it into the initial chunk)', () => {
    expect(pdfSource).not.toMatch(/^\s*import\s[^\n]*from\s+['"]jspdf['"]/m);
  });
});
