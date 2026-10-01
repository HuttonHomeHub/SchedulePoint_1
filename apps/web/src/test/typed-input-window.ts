import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';

/**
 * The **typed-input window probe** (docs/specs/activity-editor-seeding, M0).
 *
 * A form seeded by `reset()` in a passive effect keyed on `open` empties react-hook-form's field
 * registry and leaves the DOM alone; until the next render re-registers the fields, an `input`
 * event finds no field and is ignored, and the re-render then writes the stored value over what was
 * typed. A person cannot click and type inside one task, so Testing Library's `fireEvent` — which
 * wraps every call in `act` and so flushes that re-render first — cannot see the window at all.
 * A driver (Playwright's `fill`) can. This module models the driver.
 *
 * What it does differently from every other suite here, and why each part is load-bearing:
 *
 * - **`createRoot`, not `render`**, with `IS_REACT_ACT_ENVIRONMENT` off: under the act environment
 *   React flushes scheduled work at the end of every `act` scope, which closes the window.
 * - **The opening inside `flushSync`**: a click's own task flushes passive effects synchronously
 *   when the committed lanes include the sync lane, so the effect's `reset()` has run by the time
 *   `flushSync` returns — and the re-render it scheduled has not.
 * - **A native `input` event straight after**, using the prototype's value setter: assigning
 *   `node.value` directly updates React's value tracker and React then swallows the event as "no
 *   change".
 */

const actEnvironment = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean | undefined };

export interface Probe {
  root: Root;
  container: HTMLElement;
  /** Render synchronously, so the commit and its passive effects have run when this returns. */
  renderNow: (node: React.ReactNode) => void;
  dispose: () => void;
}

/** Turn the act environment off for one test and hand back the root to render into. */
export function startProbe(): Probe {
  const previous = actEnvironment.IS_REACT_ACT_ENVIRONMENT;
  actEnvironment.IS_REACT_ACT_ENVIRONMENT = false;
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  return {
    root,
    container,
    renderNow: (node) => flushSync(() => root.render(node)),
    dispose: () => {
      flushSync(() => root.unmount());
      container.remove();
      actEnvironment.IS_REACT_ACT_ENVIRONMENT = previous;
    },
  };
}

/** What a driver's `fill` does: set the value through the prototype setter, then fire `input`. */
export function typeNow(input: HTMLInputElement, value: string): void {
  // The setter is invoked with `.call(input, …)` on the next line, so it is never separated from
  // the object the rule worries about.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- called with an explicit receiver
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (!setter) throw new Error('HTMLInputElement has no value setter');
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** One macrotask: long enough for the default-priority re-render the opening scheduled. */
export function nextTask(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/** Poll for something that arrives through the network layer, without `act` in the way. */
export async function until<T>(read: () => T | null | undefined, what: string): Promise<T> {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    const found = read();
    if (found !== null && found !== undefined) return found;
    await nextTask();
  }
  throw new Error(`timed out waiting for ${what}`);
}

/** The labelled input inside a container — the element a driver would `fill`. */
export function fieldByLabel(container: HTMLElement, label: string): HTMLInputElement | null {
  const wanted = label.toLowerCase();
  for (const el of container.ownerDocument.querySelectorAll('label')) {
    if (!(el.textContent ?? '').trim().toLowerCase().startsWith(wanted)) continue;
    const id = el.getAttribute('for');
    const target = id ? container.ownerDocument.getElementById(id) : el.querySelector('input');
    if (target instanceof HTMLInputElement) return target;
  }
  return null;
}
