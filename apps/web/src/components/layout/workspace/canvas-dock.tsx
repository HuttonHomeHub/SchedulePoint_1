import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * **The canvas dock** — one place at the FOOT of the plan workspace for every transient strip the
 * diagram needs to show: the armed-tool statement, the link confirmation, the singular and plural
 * selection bars, the edit-conflict banner and the empty-plan notice.
 *
 * All six used to be **reserved chrome above the scene**, which was the right call when ADR-0064
 * made it — the alternative on the table then was floating them over the diagram, and a fourth
 * overlay eventually lands on the bar you meant to click. What that decision did not price is that
 * chrome above the scene pushes the scene **down**, and the workspace measured 240 px of chrome
 * against 576 px of canvas at 1646 CSS px before any of these strips is showing. The product owner
 * put it plainly: "the helper text in blue which tells a user what to do is taking up canvas space."
 *
 * The dock keeps ADR-0064's rule intact — nothing overlays the scene — and pays no height for it,
 * because the row it occupies **already exists**: `ActivityPanelCollapsedBar` is a 36 px strip
 * carrying the word "Activities" at one end and an expand button at the other, with the whole width
 * between them empty. A strip in the dock fills that gap. Nothing showing ⇒ the row is exactly what
 * it was.
 *
 * **The fallback is not a courtesy, it is the parity contract.** `CanvasDock` renders its children
 * in place when no outlet has registered — which is what happens in the legacy stacked layout and
 * in every unit test that mounts `TsldPanel` on its own. So this change cannot alter what those
 * suites see, and they go on asserting the same DOM they always did; only the workspace that
 * provides an outlet gets the move. A portal is the mechanism for the same reason the plan toolbar
 * uses one to reach the chrome band (ADR-0055 S2): the shell mounts once and is plan-unaware
 * (ADR-0029), so the diagram cannot render into the shell's row by nesting.
 *
 * It lives in `components/layout/workspace/` rather than inside the tsld feature because two of its
 * three exports are the WORKSPACE's half of the arrangement — the provider that wraps both halves
 * and the outlet the activities row renders. Only `CanvasDock`, the consumer, belongs to the
 * diagram, and a feature may consume an app-level layout component (CLAUDE.md §5) where the shell
 * may not reach into a feature.
 *
 * Tab order improves rather than degrades. The strips previously sat before the canvas and its
 * parallel listbox; docked, they follow both — so a keyboard planner reaches the diagram first and
 * its actions after, which is the order the screen now reads in.
 */
const CanvasDockContext = createContext<{
  element: HTMLElement | null;
  register: (element: HTMLElement) => void;
  unregister: (element: HTMLElement) => void;
}>({ element: null, register: () => undefined, unregister: () => undefined });

/** Wrap the diagram and its dock outlet, so the two can find each other. */
export function CanvasDockProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const register = useCallback((next: HTMLElement) => setElement(next), []);
  // **Clear by identity, never by "an outlet went away".** Exactly one outlet is mounted at a time
  // — the collapsed activities handle's, or the expanded panel header's — and React does not
  // promise to unmount the outgoing one before mounting the incoming one. Both orders have to end
  // in the same place, and only the departing node's identity distinguishes "the outlet I am
  // holding has gone" from "an outlet I already replaced has gone".
  //
  // Two weaker rules were tried and each broke the case the other fixed. Taking a bare `null` at
  // face value empties the dock on roughly half the transitions — the armed-tool statement
  // vanishing when the planner opens the activities list, on the surface it exists to explain.
  // Keeping the held node while `isConnected` inverts the failure: React runs a ref cleanup BEFORE
  // detaching the node, so on a real teardown the guard sees a still-connected element, keeps it,
  // and the strips portal into a node that is about to leave the document — present in no
  // accessibility tree at all, which is worse than absent because nothing looks wrong.
  const unregister = useCallback((gone: HTMLElement) => {
    setElement((prev) => (prev === gone ? null : prev));
  }, []);
  const value = useMemo(() => ({ element, register, unregister }), [element, register, unregister]);
  return <CanvasDockContext.Provider value={value}>{children}</CanvasDockContext.Provider>;
}

/**
 * Where the dock's strips land. Rendered by the workspace inside the row it already pays for.
 *
 * `min-w-0` and `flex-1` rather than a fixed width: the strips are as wide as their content and the
 * row's two fixed ends ("Activities", the expand button) must keep their own space.
 */
export function CanvasDockOutlet(): React.ReactElement {
  const { register, unregister } = useContext(CanvasDockContext);
  // React 19's ref-cleanup form, which hands the cleanup the node it was given — the identity
  // `unregister` needs — and suppresses the legacy `ref(null)` call that carries no identity at all.
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      // The `null` branch is the legacy call, which React only makes when the callback returns
      // nothing. It cannot happen alongside the cleanup below, and it carries no identity, so
      // there is nothing safe to do with it — see `unregister`.
      if (node === null) return undefined;
      register(node);
      return () => unregister(node);
    },
    [register, unregister],
  );
  return <div ref={ref} className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden" />;
}

/**
 * Render `children` into the dock outlet when one exists, and in place when it does not.
 *
 * `key` is deliberately absent from the portal call: the strips inside are already keyed by what
 * they are, and re-keying on the outlet would unmount and remount a focused control every time the
 * activities panel is expanded or collapsed.
 */
export function CanvasDock({ children }: { children: React.ReactNode }): React.ReactElement | null {
  const { element } = useContext(CanvasDockContext);
  if (element === null) return <>{children}</>;
  return createPortal(children, element);
}
