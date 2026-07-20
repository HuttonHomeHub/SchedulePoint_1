import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

import './PrintSurface.css';

/**
 * The **print-only diagram surface** for the TSLD Browser-Print deliverable (spec
 * `docs/specs/export-print/` §Milestone 4, feature-spec §4 **CQ-4** — the IMAGE path). It is the
 * counterpart to the co-located `PrintSurface.css` print stylesheet: a container that is
 * `display:none` on screen (so the live app is visually unchanged) and revealed only in `@media print`,
 * where the stylesheet hides the app-shell root (`#root`) so the print dialog shows just the
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
/** The wrapper the mount helper appends to `document.body`; the stylesheet keeps it (and only it)
 * visible while printing (`body > *:not(.tsld-print-container)` is hidden). */
const PRINT_CONTAINER_CLASS = 'tsld-print-container';
/** Fallback teardown delay (ms) if the browser never fires `afterprint` (e.g. the dialog is dismissed
 * without an event, or a headless context). Generous so it never races a real print session, but
 * bounded so the print-only DOM can't leak. */
export const PRINT_TEARDOWN_FALLBACK_MS = 60_000;

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
export interface PrintDiagramImageDeps {
  /** The print trigger (defaults to `window.print`). Injected in tests where jsdom has no `print`. */
  print?: () => void;
  /** The React root factory (defaults to `createRoot`); injectable for tests. */
  createRootImpl?: (container: Element) => Root;
  /** The fallback teardown delay (ms); defaults to {@link PRINT_TEARDOWN_FALLBACK_MS}. */
  fallbackMs?: number;
}

/**
 * Mount the {@link PrintSurface} for `input.blob`, open the browser print dialog, and tear everything
 * down again. The teardown fires on the `afterprint` event AND on a fallback timeout (in case
 * `afterprint` never fires), and is idempotent (whichever fires first wins). Focus is captured before
 * printing and restored to the previously-focused control afterwards, so keyboard users land back where
 * they were (WCAG 2.4.3). A no-op in a no-DOM environment (import-safe).
 *
 * The image is committed to the DOM synchronously (`flushSync`) before `window.print()` so the dialog
 * has the diagram to render. Errors from the caller-supplied `print` are swallowed after teardown is
 * still scheduled, so a print failure never leaks the mounted surface.
 */
export function printDiagramImage(
  input: PrintDiagramImageInput,
  deps: PrintDiagramImageDeps = {},
): void {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;

  const url = URL.createObjectURL(input.blob);
  const container = document.createElement('div');
  container.className = PRINT_CONTAINER_CLASS;
  document.body.appendChild(container);
  const root = (deps.createRootImpl ?? createRoot)(container);

  // Capture the control that had focus (the Print toolbar button) so we can return focus after printing.
  const previousFocus = document.activeElement as HTMLElement | null;

  // A `const` holder for the mutable fallback-timer id, so the `teardown` closure (defined before the
  // timer is scheduled) can read + clear it without a reassigned `let`.
  const state: { done: boolean; fallbackTimer?: ReturnType<typeof setTimeout> } = { done: false };
  const teardown = (): void => {
    if (state.done) return;
    state.done = true;
    window.removeEventListener('afterprint', teardown);
    if (state.fallbackTimer !== undefined) clearTimeout(state.fallbackTimer);
    root.unmount();
    container.remove();
    URL.revokeObjectURL(url);
    if (
      previousFocus &&
      typeof previousFocus.focus === 'function' &&
      document.contains(previousFocus)
    ) {
      previousFocus.focus();
    }
  };

  flushSync(() => {
    root.render(
      <PrintSurface
        imageUrl={url}
        title={input.title}
        subtitle={input.subtitle}
        alt={`Diagram of ${input.title}`}
      />,
    );
  });

  window.addEventListener('afterprint', teardown);
  state.fallbackTimer = setTimeout(teardown, deps.fallbackMs ?? PRINT_TEARDOWN_FALLBACK_MS);

  const print =
    deps.print ?? (typeof window.print === 'function' ? window.print.bind(window) : undefined);
  print?.();
}
