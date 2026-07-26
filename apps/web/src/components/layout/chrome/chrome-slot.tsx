import { createContext, useCallback, useContext, useState } from 'react';
import { createPortal } from 'react-dom';

import { DESIGNED_CHROME_ENABLED } from '@/config/env';
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
const ChromeSlotContext = createContext<HTMLElement | null>(null);

/**
 * Publishes the slot node to any `ChromePortal` below. Rendered by the chrome band; a subtree
 * with no provider has no slot, and `ChromePortal` renders nothing rather than throwing.
 */
export function ChromeSlotProvider({
  node,
  children,
}: {
  node: HTMLElement | null;
  children: React.ReactNode;
}): React.ReactElement {
  return <ChromeSlotContext value={node}>{children}</ChromeSlotContext>;
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
  className,
}: {
  slotRef: (node: HTMLDivElement | null) => void;
  className?: string;
}): React.ReactElement {
  return <div ref={slotRef} data-chrome-slot="" className={cn('flex flex-col', className)} />;
}

/**
 * Renders `children` into the chrome band's slot when the flag is on, and **in place** when it is
 * off — an identity wrapper, which is what makes the rollback byte-for-byte.
 *
 * With the flag on but no slot mounted yet (or a subtree with no band at all — a test harness),
 * it renders `null` for that commit rather than falling back to rendering in place. The fallback
 * would paint the toolbar twice for one frame on the way in, which is worse than a frame of
 * nothing.
 */
export function ChromePortal({ children }: { children: React.ReactNode }): React.ReactNode {
  const node = useContext(ChromeSlotContext);
  if (!DESIGNED_CHROME_ENABLED) return children;
  if (!node) return null;
  return createPortal(children, node);
}
