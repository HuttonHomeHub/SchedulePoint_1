import { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

import { cn } from '@/lib/utils';

/**
 * The **chrome slot** and its portal (ADR-0055 §3).
 *
 * The problem this solves: with the flag on, a plan's toolbar rows belong *visually* to the top
 * band, which the app shell owns — but they belong *logically* to the plan workspace, which owns
 * every piece of state they read (`usePlanWorkspaceModel`, `useTsldToolbarContext`, the whole
 * ADR-0031 registry and its predicates). Lifting that state into the shell would make the shell
 * plan-aware, contradicting ADR-0029's "the shell mounts once and knows nothing about plans".
 *
 * A portal separates the two: the toolbar stays exactly where it is in the **React** tree, and
 * only its **DOM** node moves. Nothing about the workspace changes; the shell gains a `<div>`.
 * (This is also why `usePlanWorkspaceKeyScope` had to become a React handler first — React events
 * follow the React tree, so they cross the portal; native listeners do not.)
 *
 * One subtlety worth stating: the slot publishes its node through context **as state**, not as a
 * ref. `createPortal` needs a real element at render time, and a ref mutation does not re-render
 * the consumer — the toolbar would render into nothing on first paint and never recover. A
 * callback ref feeding `useState` re-renders consumers exactly once, when the node mounts.
 */
/**
 * **The names, and what each one carries.** A name rather than a second parallel API: one context,
 * one provider, one portal component, and another slot costs a string. `ChromeIdentitySlotProvider`
 * beside `ChromeSlotProvider` would be two of everything that has to stay in step, which this
 * register keeps recording as how things drift.
 *
 * - **`rows`** — the plan's command band. The original, and the only one that has never moved.
 * - **`drawer`** — the trailing context drawer's body (Graphite M6-T2). An activity editor belongs
 *   *visually* to the drawer, which the shell owns, and *logically* to the plan workspace, which
 *   owns `usePlanWorkspaceModel`, the ADR-0060 per-scope gating and the mutation hooks it reads.
 * - **`status`** — the plan status bar's row (Graphite M7), the mirror of the command band's row 1.
 * - **`identity`** — the plan's breadcrumb, status badge and Edit-plan control, carried into the app
 *   header row (the one-row header, 2026-08-26).
 * - **`mode`** — the plan's four mode controls and its pen controls, carried into the **middle** of
 *   that row. A second name rather than one slot holding both, because the header places them in
 *   different sections: the identity belongs beside the brand, and the modes belong between the
 *   brand and the account. One slot could not put its contents in two places. (`mode` also names
 *   what Graphite M5's `rail` slot carried, before ADR-0109 D2 deleted the rail.)
 *
 * **This block replaced five stacked docblocks, two of which were describing slots that no longer
 * exist** — one announced "two slots, named" beside a union of four, and one documented a `rail`
 * name ADR-0109 D2 deleted with the rail itself. Each was correct when written and none was removed
 * when its subject was, because a comment above a union is nobody's when the union changes. Recorded
 * rather than quietly tidied: it is `docs/TECH_DEBT.md`'s most-repeated shape, in the file whose own
 * job is to keep two halves of the app from learning about each other.
 *
 * `identity` is a **return**, not a new idea. ADR-0097 D1b created it to carry a plan's identity line
 * into the header; Graphite M3 deleted it, correctly, because the identity and the modes ended up in
 * one component and there was nothing left for a slot to carry across the shell boundary. It comes
 * back for the original reason, now that the row it feeds **wraps** — so the merge ADR-0092 M5 and
 * ADR-0110 D3 each withdrew on width has a shape that fits.
 */
export const CHROME_SLOT_NAMES = ['rows', 'identity', 'mode', 'drawer', 'status'] as const;

/**
 * **One list, and the type derives from it.** The roster was written out three times — this union,
 * `TEST_CHROME_SLOTS`, and a third copy in `chrome-slot.test.tsx` — each hand-maintained, and a
 * `readonly ChromeSlotName[]` annotation accepts a **subset**, so a name omitted from one of them
 * type-checks and quietly narrows the gate that was supposed to catch exactly that. Deriving the
 * union from the array makes the array the single source and leaves the gate one job: proving the
 * component renders a target for each.
 */
export type ChromeSlotName = (typeof CHROME_SLOT_NAMES)[number];

const ChromeSlotContext = createContext<Partial<Record<ChromeSlotName, HTMLElement | null>>>({});

/**
 * Publishes the slot node to any `ChromePortal` below. Rendered by the chrome band; a subtree
 * with no provider has no slot, and `ChromePortal` renders nothing rather than throwing.
 */
export function ChromeSlotProvider({
  nodes,
  children,
}: {
  nodes: Partial<Record<ChromeSlotName, HTMLElement | null>>;
  children: React.ReactNode;
}): React.ReactElement {
  return <ChromeSlotContext value={nodes}>{children}</ChromeSlotContext>;
}

/** The band's own hook: owns the slot node and hands it to the provider. */
export function useChromeSlot(): {
  slotRef: (node: HTMLDivElement | null) => void;
  node: HTMLElement | null;
} {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const slotRef = useCallback((element: HTMLDivElement | null) => setNode(element), []);
  return { slotRef, node };
}

/** The band's slot element — empty until a workspace portals into it. */
export function ChromeSlot({
  slotRef,
  name = 'rows',
  className,
}: {
  slotRef: (node: HTMLDivElement | null) => void;
  name?: ChromeSlotName;
  className?: string;
}): React.ReactElement {
  return (
    <div
      ref={slotRef}
      data-chrome-slot={name}
      className={cn(
        // The rows slot stacks: it holds the command band, which is a column of one row today and
        // was two until ADR-0109 D1.
        name === 'rows' && 'flex flex-col',
        // The drawer body is a COLUMN that must be able to shrink and scroll — the editor inside it
        // is a tab rail beside a pane, and a row layout would lay them side by side in 224–420 px.
        name === 'drawer' && 'flex min-h-0 flex-1 flex-col',
        // A status bar with nothing in it is a ZERO-HEIGHT row, which is what lets grid row 3 stay
        // `auto` and keeps the twelve screens that are not a plan exactly as they were.
        name === 'status' && 'flex min-w-0 items-center empty:hidden',
        // **`min-w-0` and `empty:hidden`, and both are load-bearing.** This slot is one item on a
        // wrapping flex line, so it must be able to shrink below its content width or a long plan
        // name pushes the account chip off the row instead of wrapping — and it must occupy nothing
        // at all on the twelve `_authed` routes that are not a plan, or every one of them gains a
        // phantom flex item and a `gap` beside it. `flex-1` is deliberately ABSENT: an item that
        // absorbs the line's slack never lets anything wrap, which is the single defect this row's
        // design turns on (`docs/specs/one-row-header/falsification.md`, third result).
        name === 'identity' && 'flex min-w-0 shrink items-center empty:hidden',
        // The mode cluster is the row's middle section. It is four segmented controls and a pen
        // badge, and squeezing it folds `Early | Visual | Diagram | Gantt` onto a second line
        // INSIDE the row, turning one clean row into two ragged ones (ADR-0112 D4). The identity
        // slot beside it is the one that gives way.
        //
        // **That is `shrink` with the default `min-width: auto`, NOT `shrink-0`** (ADR-0118 M3).
        // `shrink-0` takes `max-content` and can never be asked to give anything back — so at a
        // 390 px viewport the cluster laid out 430 px wide and `Gantt` and `Stop editing` were
        // measured at x = 409 and x = 565, painted, in the DOM, and **entirely outside the
        // viewport**: on a phone a planner could neither switch view nor release the pen. It is
        // ADR-0114 M1's defect one surface along — a row that cannot shrink is never asked to
        // wrap — and it shipped unreported for the same reason, because a control that is not
        // painted looks exactly like a control that does not exist.
        //
        // The ADR-0112 ordering survives without `shrink-0`, and that is why this is the fix
        // rather than a compromise: a flex item's default `min-width: auto` floors it at
        // min-content, while the identity slot one line up carries `min-w-0` and can shrink to
        // nothing. So the identity still gives way FIRST and completely; this cluster gives way
        // only once there is nothing left to take, which is a state that does not occur at any
        // width a mouse user works at (measured: identical layout at 1920, 1646, 1440 and 1280).
        name === 'mode' && 'flex items-center empty:hidden',
        className,
      )}
    />
  );
}

/**
 * Renders `children` into the chrome band's slot.
 *
 * With no slot mounted yet (or a subtree with no band at all — a test harness) it renders `null`
 * for that commit rather than falling back to rendering in place. The fallback would paint the
 * toolbar twice for one frame on the way in, which is worse than a frame of nothing.
 */
export function ChromePortal({
  children,
  name = 'rows',
}: {
  children: React.ReactNode;
  name?: ChromeSlotName;
}): React.ReactNode {
  const node = useContext(ChromeSlotContext)[name] ?? null;
  if (!node) return null;
  return createPortal(children, node);
}
