import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

/**
 * The app's **print-document** convention: printing is done by mounting a purpose-built document
 * into a detached container on `document.body`, not by styling the live application for paper.
 *
 * **Why not a print stylesheet over the live DOM.** The authenticated shell is deliberately built
 * from fixed-height, clipped panes so the *workspace* scrolls instead of the page (ADR-0029/0030).
 * On paper that is exactly wrong: every ancestor of the content would crop it to one screenful, and
 * a virtualized list would print whichever rows happened to be scrolled into view — a programme
 * silently truncated to a scroll position, which looks complete and is not. A detached container
 * has no such ancestors, so the printed document is exactly what we chose to put in it.
 *
 * The companion stylesheet is `src/styles/print-document.css`: {@link PRINT_CONTAINER_CLASS} is
 * `display:none` on screen, and in `@media print` it is revealed while `#root` (and every other
 * body-level node — portalled menus and dialogs) is hidden.
 *
 * This module owns only the *lifecycle*. Each surface owns its own markup and its own print styles.
 */

/**
 * The class the print stylesheet keys on. Named for the TSLD surface that established the pattern;
 * kept as-is because it is baked into shipped CSS and carries no behaviour of its own.
 */
export const PRINT_CONTAINER_CLASS = 'tsld-print-container';

/**
 * Fallback teardown delay (ms) if the browser never fires `afterprint` (e.g. the dialog is
 * dismissed without an event, or a headless context). Generous so it never races a real print
 * session, but bounded so the print-only DOM can't leak.
 */
export const PRINT_TEARDOWN_FALLBACK_MS = 60_000;

export interface PrintDocumentDeps {
  /** The print trigger (defaults to `window.print`). Injected in tests where jsdom has no `print`. */
  print?: () => void;
  /** The React root factory (defaults to `createRoot`); injectable for tests. */
  createRootImpl?: (container: Element) => Root;
  /** The fallback teardown delay (ms); defaults to {@link PRINT_TEARDOWN_FALLBACK_MS}. */
  fallbackMs?: number;
  /** Extra cleanup run exactly once with the teardown (e.g. revoking an object URL). */
  onTeardown?: () => void;
}

/**
 * Mount `node` into a print-only container, open the browser print dialog, and tear everything down
 * again. Teardown fires on the `afterprint` event AND on a fallback timeout — whichever comes first
 * wins, and it is idempotent, so a browser that fires both never double-cleans.
 *
 * Focus is captured before printing and restored to the previously-focused control afterwards, so
 * keyboard users land back on the control they activated (WCAG 2.4.3).
 *
 * The markup is committed synchronously (`flushSync`) before `window.print()`, because the dialog
 * renders whatever is in the DOM at the moment it opens — a concurrent render would print a blank
 * page. Errors from the caller-supplied `print` are swallowed *after* teardown is scheduled, so a
 * print failure can never leak the mounted surface.
 *
 * A no-op in a no-DOM environment (import-safe).
 */
export function mountPrintDocument(node: React.ReactNode, deps: PrintDocumentDeps = {}): void {
  if (typeof document === 'undefined') return;

  const container = document.createElement('div');
  container.className = PRINT_CONTAINER_CLASS;
  document.body.appendChild(container);
  const root = (deps.createRootImpl ?? createRoot)(container);

  // Capture the control that had focus (the Print toolbar item) so we can return focus after printing.
  const previousFocus = document.activeElement as HTMLElement | null;

  // A `const` holder for the mutable fallback-timer id, so the `teardown` closure (defined before
  // the timer is scheduled) can read and clear it without a reassigned `let`.
  const state: { done: boolean; fallbackTimer?: ReturnType<typeof setTimeout> } = { done: false };
  const teardown = (): void => {
    if (state.done) return;
    state.done = true;
    window.removeEventListener('afterprint', teardown);
    if (state.fallbackTimer !== undefined) clearTimeout(state.fallbackTimer);
    root.unmount();
    container.remove();
    deps.onTeardown?.();
    if (
      previousFocus &&
      typeof previousFocus.focus === 'function' &&
      document.contains(previousFocus)
    ) {
      previousFocus.focus();
    }
  };

  flushSync(() => {
    root.render(node);
  });

  window.addEventListener('afterprint', teardown);
  state.fallbackTimer = setTimeout(teardown, deps.fallbackMs ?? PRINT_TEARDOWN_FALLBACK_MS);

  const print =
    deps.print ?? (typeof window.print === 'function' ? window.print.bind(window) : undefined);
  print?.();
}
