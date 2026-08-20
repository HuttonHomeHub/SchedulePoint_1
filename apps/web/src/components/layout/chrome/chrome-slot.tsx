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
 * **Two slots, named** (ADR-0097 Landing D1b). `rows` has always held the plan's toolbar rows;
 * `identity` is new and sits **inside the app header row**, so a plan's identity line merges into
 * the header instead of taking a row of its own — the merge ADR-0092 M5 withdrew at "134 px short
 * at 1646" and D1a paid for by moving the organisation nav to the rail (+250 px of slack at 1440,
 * `m0-landing-d1-measurement.md`).
 *
 * A **name** rather than a second parallel API: one context, one provider, one portal component,
 * and a third slot costs a string. `ChromeIdentitySlotProvider` beside `ChromeSlotProvider` would
 * be two of everything that has to stay in step, which this register keeps recording as how things
 * drift.
 */
/**
 * `rows` is the command band; `rail` is the tool rail's mode cluster (Graphite M5).
 *
 * A second name came back here for a better reason than the one that took it away. ADR-0097 D1b's
 * `identity` slot existed to carry a plan's identity line across the shell boundary, and M3 removed
 * it because the identity and the modes ended up in the same component. This one carries the mode
 * cluster into the RAIL, which the shell renders and which must stay plan-unaware (ADR-0029) — the
 * same problem the band solved in ADR-0055 §3, one column along.
 */
/**
 * `drawer` is the trailing context drawer's body (Graphite M6-T2) — the third name, and taken on
 * exactly the terms the paragraph above sets. An activity editor belongs *visually* to the drawer,
 * which the shell owns, and *logically* to the plan workspace, which owns `usePlanWorkspaceModel`,
 * the ADR-0060 per-scope gating and the mutation hooks it reads. Lifting any of that into the shell
 * is the thing ADR-0029 forbids; a portal moves the DOM node and leaves the React tree alone.
 */
/**
 * `status` is the plan status bar's row (Graphite M7) — grid row 3, the mirror of the command
 * band's row 1. Same argument as every other name here: the facts it shows belong to the plan, the
 * row belongs to the shell, and a portal is what keeps the shell from learning the difference.
 */
export type ChromeSlotName = 'rows' | 'rail' | 'drawer' | 'status';

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
      // The rows slot stacks; the identity slot is one item in a flex row and must be able to
      // shrink, or a long plan name pushes the account chip off the header.
      className={cn(
        name === 'rows' && 'flex flex-col',
        // The drawer body is a COLUMN that must be able to shrink and scroll — the editor inside it
        // is a tab rail beside a pane, and a row layout would lay them side by side in 224–420 px.
        name === 'drawer' && 'flex min-h-0 flex-1 flex-col',
        name === 'rail' && 'flex min-w-0 items-center',
        // A status bar with nothing in it is a ZERO-HEIGHT row, which is what lets grid row 3 stay
        // `auto` and keeps the twelve screens that are not a plan exactly as they were.
        name === 'status' && 'flex min-w-0 items-center empty:hidden',
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
