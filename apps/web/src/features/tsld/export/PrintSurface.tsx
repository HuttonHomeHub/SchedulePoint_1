import './PrintSurface.css';

import {
  mountPrintDocumentWhenReady,
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

export type PrintSurfaceStripStatus = 'ready' | 'loading' | 'error' | 'empty';

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

const STRIP_ALT_SUFFIX = {
  ready: ', with resource load',
  loading: ', resource load section was still loading',
  error: ', resource load section could not be loaded',
  empty: ', resource load section was empty',
} as const;

/** The printed diagram's alt text, worded by what the strip actually contributed (ADR-0122). */
export function printAlt(
  title: string,
  parts: { strip?: PrintSurfaceStripStatus | undefined; swimlaneCount?: number } = {},
): string {
  const { strip, swimlaneCount = 0 } = parts;
  // The swimlane names are painted into the picture, so the alt says the diagram is divided and
  // into how many (ADR-0122: it states what the picture holds, and only that).
  const divided =
    swimlaneCount > 0
      ? `, divided into ${String(swimlaneCount)} ${swimlaneCount === 1 ? 'swimlane' : 'swimlanes'}`
      : '';
  return `Diagram of ${title}${divided}${strip ? STRIP_ALT_SUFFIX[strip] : ''}`;
}

export interface PrintDiagramImageInput {
  /** The already-produced whole-diagram PNG blob (from the shared `buildDiagramImage` helper). */
  blob: Blob;
  /** The plan name (the print document title). */
  title: string;
  /** The subtitle line (e.g. "As of 2026-07-20"). */
  subtitle: string;
  /**
   * The resource strip's state in the picture, or absent/`null` when it is not open. The image's
   * `alt` is the only text a screen reader gets for it (ADR-0122), so it states what the picture
   * HOLDS: only a `ready` strip is claimed as resource load; a strip that was still loading, failed
   * or was empty is named as exactly that, never as content the picture does not have.
   */
  resourceStripStatus?: PrintSurfaceStripStatus | null;
  /** How many swimlanes the picture is divided into (`0`/absent: none), so the `alt` can say so. */
  swimlaneCount?: number;
}

/** How long the printed picture may take to load and decode before the print is given up. */
export const PRINT_IMAGE_READY_MS = 10_000;

/** Injectable seams so the mount/teardown lifecycle is testable without a real print dialog. */
export type PrintDiagramImageDeps = PrintDocumentDeps & {
  /** The ready timeout (ms); defaults to {@link PRINT_IMAGE_READY_MS}. */
  imageReadyMs?: number;
};

/**
 * Resolve once the mounted `<img>` has loaded and decoded, reject if it cannot be made or does not
 * arrive in `timeoutMs`. `decode()` is what makes the pixels available to the print snapshot; where
 * a browser lacks it (jsdom) the `load` event is the best signal there is.
 */
function imageReady(container: HTMLElement, timeoutMs: number): Promise<void> {
  const img = container.querySelector('img');
  if (!img) return Promise.reject(new Error('The print surface holds no image.'));
  const loaded =
    typeof img.decode === 'function'
      ? img.decode()
      : new Promise<void>((resolve, reject) => {
          if (img.complete && img.naturalWidth > 0) resolve();
          img.addEventListener('load', () => resolve(), { once: true });
          img.addEventListener('error', () => reject(new Error('The diagram image failed.')), {
            once: true,
          });
        });
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('The diagram image took too long to load.'));
    }, timeoutMs);
    loaded.then(
      () => {
        clearTimeout(timer);
        resolve();
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error('The diagram image failed to decode.'));
      },
    );
  });
}

/**
 * Mount the {@link PrintSurface} for `input.blob`, wait for its image to load and decode, open the
 * browser print dialog, and tear everything down again — the lifecycle is the shared
 * {@link mountPrintDocumentWhenReady}. The waiting is the point: `window.print()` snapshots the DOM at
 * the instant it is called, and an `<img>` of a blob URL has not loaded when it is mounted, so
 * printing straight away produced the title over a blank page (TECH_DEBT #585). The object URL is
 * created before the mount and revoked in the teardown, so the blob is released exactly once
 * however the print session ends.
 *
 * Rejects — after tearing the surface down, with nothing printed — if the picture cannot be made
 * ready in time; the caller owns saying so.
 *
 * Resolves without doing anything where `URL.createObjectURL` is unavailable (import-safe).
 */
export async function printDiagramImage(
  input: PrintDiagramImageInput,
  deps: PrintDiagramImageDeps = {},
): Promise<void> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') return;

  const { imageReadyMs, ...documentDeps } = deps;
  const url = URL.createObjectURL(input.blob);
  await mountPrintDocumentWhenReady(
    <PrintSurface
      imageUrl={url}
      title={input.title}
      subtitle={input.subtitle}
      alt={printAlt(input.title, {
        strip: input.resourceStripStatus ?? undefined,
        ...(input.swimlaneCount === undefined ? {} : { swimlaneCount: input.swimlaneCount }),
      })}
    />,
    (container) => imageReady(container, imageReadyMs ?? PRINT_IMAGE_READY_MS),
    { ...documentDeps, onTeardown: () => URL.revokeObjectURL(url) },
  );
}
