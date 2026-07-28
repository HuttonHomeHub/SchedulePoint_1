import './PrintSurface.css';

import {
  mountPrintDocument,
  PRINT_TEARDOWN_FALLBACK_MS,
  type PrintDocumentDeps,
} from '@/lib/print-document';

/**
 * The **print-only diagram surface** for the TSLD Browser-Print deliverable (spec
 * `docs/specs/export-print/` §Milestone 4, feature-spec §4 **CQ-4** — the IMAGE path). It rides the
 * shared print-document convention (`@/lib/print-document`): a detached container that is
 * `display:none` on screen (so the live app is visually unchanged) and revealed only in
 * `@media print`, where the app-shell root (`#root`) is hidden so the print dialog shows just the
 * whole-diagram image + its title.
 *
 * Printing reuses the SAME off-screen PNG the PNG/PDF deliverables produce (the shared
 * `buildDiagramImage` helper → `renderExportImage`), so the printed diagram is byte-faithful to the
 * export and the live canvas is never touched (ADR-0026). The image is already self-describing (its
 * title band + legend are painted onto the light print palette); this surface adds the plan-name · date
 * heading the plan calls for and provides the print-document structure.
 */

/** The class the print stylesheet keys the on-screen-hidden / print-revealed rules on. */
const PRINT_ROOT_CLASS = 'tsld-print-root';

export { PRINT_TEARDOWN_FALLBACK_MS };

export interface PrintSurfaceProps {
  /** The object/data URL of the already-produced whole-diagram PNG. */
  imageUrl: string;
  /** The document title — the plan name. */
  title: string;
  /** The subtitle line — the "as of" data date. */
  subtitle: string;
  /** The image's alt text (accessible description of the printed diagram). */
  alt: string;
}

/**
 * The print surface markup: a print-only container holding the whole-diagram image and a
 * plan-name · date title. Static (no state/effects) — the {@link printDiagramImage} helper owns its
 * lifecycle (mount → `window.print()` → teardown).
 */
export function PrintSurface({
  imageUrl,
  title,
  subtitle,
  alt,
}: PrintSurfaceProps): React.ReactElement {
  return (
    <div className={PRINT_ROOT_CLASS} data-testid="tsld-print-surface">
      <h1 className="tsld-print-title">{title}</h1>
      <p className="tsld-print-subtitle">{subtitle}</p>
      <img className="tsld-print-image" src={imageUrl} alt={alt} />
    </div>
  );
}

export interface PrintDiagramImageInput {
  /** The already-produced whole-diagram PNG blob (from the shared `buildDiagramImage` helper). */
  blob: Blob;
  /** The plan name (the print document title). */
  title: string;
  /** The subtitle line (e.g. "As of 2026-07-20"). */
  subtitle: string;
}

/** Injectable seams so the mount/teardown lifecycle is testable without a real print dialog. */
export type PrintDiagramImageDeps = PrintDocumentDeps;

/**
 * Mount the {@link PrintSurface} for `input.blob`, open the browser print dialog, and tear everything
 * down again — all of which is the shared {@link mountPrintDocument} lifecycle. The only concern
 * added here is the object URL: created before the mount, revoked in the teardown, so the blob is
 * released exactly once however the print session ends.
 *
 * A no-op where `URL.createObjectURL` is unavailable (import-safe).
 */
export function printDiagramImage(
  input: PrintDiagramImageInput,
  deps: PrintDiagramImageDeps = {},
): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;

  const url = URL.createObjectURL(input.blob);
  mountPrintDocument(
    <PrintSurface
      imageUrl={url}
      title={input.title}
      subtitle={input.subtitle}
      alt={`Diagram of ${input.title}`}
    />,
    { ...deps, onTeardown: () => URL.revokeObjectURL(url) },
  );
}
