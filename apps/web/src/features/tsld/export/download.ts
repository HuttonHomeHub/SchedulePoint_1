/**
 * The thin browser **download** shim for the TSLD export deliverables (spec `docs/specs/export-print/`,
 * behind `VITE_EXPORT_PRINT`). The only IO here is an object-URL + a synthetic anchor click; kept
 * isolated so the pure serialisers (`export-csv.ts` et al.) stay DOM-free and unit-testable. Triggered
 * by a real toolbar button, so the download is keyboard-operable.
 */

/**
 * Download a {@link Blob} as `filename` via a temporary object URL and a synthetic `<a download>` click,
 * revoking the URL immediately afterwards so it isn't leaked. Guarded for a no-DOM / SSR environment
 * (no `document` or no `URL.createObjectURL`), where it is a no-op — the client is browser-only, but the
 * guard keeps the module import-safe and the failure mode silent rather than a thrown error.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;
  const url = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    // Not a navigation; keep it out of the layout and detached from any opener.
    anchor.rel = 'noopener';
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    // Always release the object URL — even if the click threw — so the blob can be GC'd.
    URL.revokeObjectURL(url);
  }
}
