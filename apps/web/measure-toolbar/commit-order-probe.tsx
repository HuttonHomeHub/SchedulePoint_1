/**
 * **A probe module, loaded by `commit-order.spec.ts` through Vite's `/@fs/` route.**
 *
 * It is deliberately NOT under `apps/web/src`: nothing in the product imports it, and a file in
 * the source tree that nothing imports is dead code (CLAUDE.md §5). It lives beside the harness
 * that runs it, and the dev server transforms it on demand like any other module.
 *
 * ## What it answers, and why it cannot be reasoned about
 *
 * `docs/specs/unmount-focus-handoff/` M0-T2 (falsification condition F3). The design rests on one
 * claim: at the moment a `useLayoutEffect` runs in the commit that removed the focused node,
 * `document.activeElement` is `<body>` — because React's mutation phase detaches the node before
 * the layout phase runs, and a browser moves focus to the body synchronously on detach.
 *
 * That is a statement about **React's commit ordering and the browser's focus model together**,
 * and jsdom has neither a real focus ring nor React's DOM scheduling, so the unit tier structurally
 * cannot ask it. Hence a real Chromium and a real React root.
 *
 * **It must remove the node through a state change, not a DOM call.** `el.remove()` measures a
 * case React never produces, which is the trap M0-T2's risk note names.
 */
import { useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

export interface CommitOrderReading {
  /** `document.activeElement` at the top of the layout effect in the removing commit. */
  inLayoutEffect: string;
  /** The same, one animation frame later — the point at which the hook's handoff would act. */
  inAnimationFrame: string;
  /** Sanity: what had focus immediately before the state flip. Guards a vacuous run. */
  beforeFlip: string;
  /** Whether the removed node was genuinely focused when the flip happened. */
  wasFocusedBeforeFlip: boolean;
}

function describe(el: Element | null): string {
  if (!el) return '(null)';
  if (el === document.body) return 'BODY';
  if (el === document.documentElement) return 'HTML';
  const id = el.id ? `#${el.id}` : '';
  return `${el.tagName}${id}`;
}

/**
 * Mount a focusable child, focus it, then remove it by flipping state — reading
 * `document.activeElement` in the layout phase of the removing commit and again a frame later.
 */
export async function runProbe(): Promise<CommitOrderReading> {
  const host = document.createElement('div');
  document.body.append(host);

  const reading: Partial<CommitOrderReading> = {};
  let settle: (() => void) | null = null;
  const done = new Promise<void>((resolve) => {
    settle = resolve;
  });

  // A mutable holder rather than a bare `let`: TypeScript narrows a `let` assigned only inside a
  // closure to `never` at the call site, and the assertion that would silence it hides the shape.
  const control: { flip: (() => void) | null } = { flip: null };

  function Probe(): React.ReactElement {
    const [present, setPresent] = useState(true);
    control.flip = () => setPresent(false);

    useLayoutEffect(() => {
      if (present) return;
      // The removing commit's layout phase. React has already run the mutation phase, so the
      // <button> is detached by now — if the browser reassigned focus, this read sees it.
      reading.inLayoutEffect = describe(document.activeElement);
      requestAnimationFrame(() => {
        reading.inAnimationFrame = describe(document.activeElement);
        settle?.();
      });
    }, [present]);

    return present ? (
      <div>
        <button id="probe-target" type="button">
          target
        </button>
      </div>
    ) : (
      <div>gone</div>
    );
  }

  const root = createRoot(host);
  root.render(<Probe />);

  // One frame for the first commit to land and paint before anything is focused.
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

  const target = host.querySelector<HTMLButtonElement>('#probe-target');
  target?.focus();
  reading.beforeFlip = describe(document.activeElement);
  reading.wasFocusedBeforeFlip = document.activeElement === target;

  control.flip?.();
  await done;

  root.unmount();
  host.remove();

  return reading as CommitOrderReading;
}
