import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * **Where the plan's facts render** — the activities handle row where one is mounted, the shell's
 * status row where none is (M2-T2).
 *
 * Modelled on `CanvasDockProvider` deliberately and **not** merged into it. The two want the same
 * row at the same time — a docked strip and the facts both live in the activities handle row, and
 * one outlet holding both would have to decide their order and their give-way behaviour, which is
 * exactly the pair of decisions M2-T3's collapse rule owns. Two registries, one row, explicit
 * layout: the dock outlet keeps `flex-1 min-w-0` and takes the middle, the facts are `shrink-0` at
 * the trailing end until the container query fires.
 *
 * **The fallback is the whole point, not a courtesy.** Below the `md` breakpoint the activities
 * handle row is **not mounted at all** — measured, not inferred: `activitiesBarMounted: false` at
 * 700 and 600 CSS px (`docs/specs/workspace-chrome-fit/m0-measurement.md`, and
 * `plan-workspace-toolbar.tsx` passes `hostsDock={false}` for a pane the narrow layout hides). A
 * merge that assumed the row exists would delete the plan's facts on exactly the screens with the
 * least room to lose them, which is ADR-0081's defect: a capability with no host, shipped green.
 * So `PlanFactsHost` renders in place when nobody has registered, and the narrow layout gets the
 * facts from the shell status row exactly as it does today.
 *
 * **Clear by identity, never by "an outlet went away".** Copied from the dock because the reasoning
 * is identical and was learnt the hard way there: exactly one outlet is mounted at a time — the
 * collapsed handle's or the expanded panel header's — and React does not promise to unmount the
 * outgoing one before mounting the incoming one. A bare `null` empties the host on roughly half the
 * transitions; an `isConnected` guard inverts that, because React runs a ref cleanup **before**
 * detaching, so on a real teardown it keeps a node that is leaving the document and the facts
 * portal into somewhere present in no accessibility tree. Only the departing node's identity tells
 * those two apart.
 */
const PlanFactsContext = createContext<{
  element: HTMLElement | null;
  register: (element: HTMLElement) => void;
  unregister: (element: HTMLElement) => void;
}>({ element: null, register: () => undefined, unregister: () => undefined });

/** Wrap the workspace and its facts outlet, so the two can find each other. */
export function PlanFactsProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [element, setElement] = useState<HTMLElement | null>(null);
  const register = useCallback((next: HTMLElement) => setElement(next), []);
  const unregister = useCallback((gone: HTMLElement) => {
    setElement((prev) => (prev === gone ? null : prev));
  }, []);
  const value = useMemo(() => ({ element, register, unregister }), [element, register, unregister]);
  return <PlanFactsContext.Provider value={value}>{children}</PlanFactsContext.Provider>;
}

/**
 * Where the facts land inside the activities handle row.
 *
 * `shrink-0`, unlike the dock outlet's `flex-1`: when the row runs out of width the **strips** are
 * the thing that should wrap onto a second line, because a strip is transient and the facts are
 * always there. Below the container-query threshold the facts collapse themselves (M2-T3) rather
 * than being squeezed — never to nothing, which is the rule this whole milestone turns on.
 */
export function PlanFactsOutlet(): React.ReactElement {
  const { register, unregister } = useContext(PlanFactsContext);
  // React 19's ref-cleanup form: it hands the cleanup the node it was given — the identity
  // `unregister` needs — and suppresses the legacy `ref(null)` call, which carries none.
  const ref = useCallback(
    (node: HTMLDivElement | null) => {
      // The legacy call, made only when the callback returns nothing. It cannot happen alongside
      // the cleanup below and carries no identity, so there is nothing safe to do with it.
      if (node === null) return undefined;
      register(node);
      return () => unregister(node);
    },
    [register, unregister],
  );
  return <div ref={ref} className="flex shrink-0 items-center" />;
}

/**
 * Render `children` into the facts outlet when one exists, and in place when it does not.
 *
 * `key` is deliberately absent from the portal call, for the dock's reason: re-keying on the outlet
 * unmounts and remounts a focused control every time the activities panel is expanded or collapsed,
 * and the Recalculate button inside these facts is focusable.
 */
export function PlanFactsHost({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  const { element } = useContext(PlanFactsContext);
  if (element === null) return <>{children}</>;
  return createPortal(children, element);
}
