/**
 * The lazy **PDF export** shim for the TSLD Diagram-PDF deliverable (spec `docs/specs/export-print/`
 * §Milestone 3, feature-spec §4 **CQ-2**, behind `VITE_EXPORT_PRINT`). It embeds the already-produced
 * Diagram-PNG blob (the M2 `renderExportImage` output) on a single landscape page — so the PDF is a
 * faithful, portable copy of the same off-screen render, with no second paint.
 *
 * **jsPDF is DYNAMICALLY imported** (`await import('jspdf')`) — the ONLY reference to the library in the
 * app — so it is **absent from the initial JS bundle** and only fetched on the first PDF export (CQ-2
 * code-split; the bundle-bloat mitigation). Do NOT add a static top-level jsPDF import anywhere: that
 * would pull the library into the initial chunk and defeat the split. The page-fit geometry is a pure helper
 * ({@link fitImageToPage}) so it is exhaustively unit-testable without jsPDF (and without a canvas).
 */

/** The placed image box (PDF user units, pt) inside the page — aspect-preserved and centred. */
export interface PdfImageBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Fit an image of `imgW × imgH` into a `pageW × pageH` page, **preserving aspect ratio** and **centring**
 * it: scale by the smaller of the two axis ratios (so the image is bounded by whichever axis binds first
 * and never overflows the page), then centre the scaled box on the free axis. Pure geometry — no jsPDF,
 * no DOM — so the fit is unit-tested against known aspect ratios (a portrait image on a landscape page, a
 * very wide image, a square). Degenerate (≤ 0) dimensions are floored to 1 so it never divides by zero.
 */
export function fitImageToPage(
  imgW: number,
  imgH: number,
  pageW: number,
  pageH: number,
): PdfImageBox {
  const safeW = imgW > 0 ? imgW : 1;
  const safeH = imgH > 0 ? imgH : 1;
  const scale = Math.min(pageW / safeW, pageH / safeH);
  const w = safeW * scale;
  const h = safeH * scale;
  return { x: (pageW - w) / 2, y: (pageH - h) / 2, w, h };
}

/** The metadata the PDF export needs: the download filename + the source image's pixel dimensions (its
 * aspect ratio), taken from the M2 export viewport (`round(size * dpr)`). */
export interface ExportDiagramToPdfMeta {
  filename: string;
  imageWidth: number;
  imageHeight: number;
}

/**
 * Embed `pngBlob` on a single **landscape A4** PDF page (fit-to-page, centred) and save it as
 * `meta.filename`. jsPDF is fetched lazily here, so it never enters the initial chunk. Returns a promise
 * that **rejects** (it never throws synchronously) when the library can't load (offline) or the blob
 * can't be read — so the caller can surface a user-safe error and leave the PNG/CSV paths unaffected
 * (US-3).
 */
export async function exportDiagramToPdf(
  pngBlob: Blob,
  meta: ExportDiagramToPdfMeta,
): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const dataUrl = await blobToPngDataUrl(pngBlob);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const { x, y, w, h } = fitImageToPage(meta.imageWidth, meta.imageHeight, pageW, pageH);
  doc.addImage(dataUrl, 'PNG', x, y, w, h);
  doc.save(meta.filename);
}

/** Encode a PNG {@link Blob} as a base64 `data:` URL without `fetch`/`FileReader` (so it works in jsdom
 * and the browser alike), for `jsPDF.addImage`. */
async function blobToPngDataUrl(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:image/png;base64,${btoa(binary)}`;
}
