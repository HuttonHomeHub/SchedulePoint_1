import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';

/**
 * **Where a piece of plan chrome renders when its home is somewhere else** — a named registry with
 * an in-place fallback.
 *
 * This started life as `plan-facts-host.tsx`, serving one subject: the plan's facts, which have two
 * possible hosts (the activities handle row where one is mounted, the shell's status row where none
 * is). The one-row header needs a second subject — the pen's live-region sentence, which is
 * *rendered* by the identity row's component and *read* in the status bar — and the choice was a
 * third copy of that file or a **name**.
 *
 * It is a name, for `chrome-slot.tsx`'s reason stated in its own words: _"a third slot costs a
 * string. `ChromeIdentitySlotProvider` beside `ChromeSlotProvider` would be two of everything that
 * has to stay in step, which this register keeps recording as how things drift."_ A copy here would
 * have been the **third** implementation of one mechanism in this codebase — `CanvasDockProvider`,
 * the facts, and now the pen — and the two that exist already differ in their small print rather
 * than in the idea.
 *
 * **`plan-facts-host.tsx` survives as a re-export, and that is the acceptance condition rather than
 * a courtesy.** It had consumers and suites; if any of them needed editing, the generalisation
 * changed behaviour and is wrong (the ADR-0078 barrel-preserving argument, which this repository
 * has now used as a before/after oracle four times).
 *
 * ## Clear by identity, never by "an outlet went away"
 *
 * Carried over verbatim from the facts registry because the reasoning is identical and was learnt
 * the hard way in the canvas dock: a subject can have more than one outlet over time — the
 * collapsed activities handle's or the expanded panel header's — and React does not promise to
 * unmount the outgoing one before mounting the incoming one. A bare `null` empties the host on
 * roughly half the transitions; an `isConnected` guard inverts that, because React runs a ref
 * cleanup **before** detaching, so on a real teardown it keeps a node that is leaving the document
 * and the subject portals into somewhere present in no accessibility tree. Only the departing
 * node's identity tells those two apart.
 *
 * The pen's outlet is single and always mounted, so it cannot reach either failure today. It is held
 * to the same rule anyway: a registry with one correct clearing rule and one convenient one is a
 * registry whose next consumer picks the wrong half.
 */
export type PlanSlotName = 'facts' | 'pen';

type SlotMap = Partial<Record<PlanSlotName, HTMLElement | null>>;

const PlanSlotContext = createContext<{
  slots: SlotMap;
  register: (name: PlanSlotName, element: HTMLElement) => void;
  unregister: (name: PlanSlotName, element: HTMLElement) => void;
}>({ slots: {}, register: () => undefined, unregister: () => undefined });

/** Wrap the workspace and its outlets, so a subject and its host can find each other. */
export function PlanSlotProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [slots, setSlots] = useState<SlotMap>({});
  // Both updaters return the PREVIOUS object when nothing changed. A registry that minted a new
  // map on every registration would re-render every host on every commit that touches any slot,
  // and one of these subjects re-renders once a second (`usePenLockView`'s tick).
  const register = useCallback((name: PlanSlotName, element: HTMLElement) => {
    setSlots((prev) => (prev[name] === element ? prev : { ...prev, [name]: element }));
  }, []);
  const unregister = useCallback((name: PlanSlotName, gone: HTMLElement) => {
    setSlots((prev) => (prev[name] === gone ? { ...prev, [name]: null } : prev));
  }, []);
  const value = useMemo(() => ({ slots, register, unregister }), [slots, register, unregister]);
  return <PlanSlotContext.Provider value={value}>{children}</PlanSlotContext.Provider>;
}

/** The callback ref that registers an outlet node under `name` and clears it by identity. */
export function usePlanSlotRef(name: PlanSlotName): (node: HTMLDivElement | null) => void {
  const { register, unregister } = useContext(PlanSlotContext);
  // React 19's ref-cleanup form: it hands the cleanup the node it was given — the identity
  // `unregister` needs — and suppresses the legacy `ref(null)` call, which carries none.
  return useCallback(
    (node: HTMLDivElement | null) => {
      // The legacy call, made only when the callback returns nothing. It cannot happen alongside
      // the cleanup below and carries no identity, so there is nothing safe to do with it.
      if (node === null) return undefined;
      register(name, node);
      return () => unregister(name, node);
    },
    [name, register, unregister],
  );
}

/**
 * Render `children` into the named outlet when one exists, and in place when it does not.
 *
 * `key` is deliberately absent from the portal call, for the dock's reason: re-keying on the outlet
 * unmounts and remounts a focused control every time the host changes, and both subjects registered
 * here contain focusable controls — the facts' Recalculate button and the pen's hand-off controls.
 */
export function PlanSlotHost({
  name,
  children,
}: {
  name: PlanSlotName;
  children: React.ReactNode;
}): React.ReactElement | null {
  const element = useContext(PlanSlotContext).slots[name] ?? null;
  if (element === null) return <>{children}</>;
  return createPortal(children, element);
}

/* -------------------------------------------------------------------------------------------- */
/* The facts subject — the original three names, unchanged in behaviour.                          */
/* -------------------------------------------------------------------------------------------- */

/**
 * Wrap the workspace and its facts outlet, so the two can find each other.
 *
 * The same provider as {@link PlanSlotProvider}: one provider serves every named subject, which is
 * the point of the generalisation. Kept under this name because `plan-workspace-toolbar.tsx` and
 * its suites use it, and their being untouched is how this change is known to be behaviour-free.
 */
export const PlanFactsProvider = PlanSlotProvider;

/**
 * Where the facts land inside the activities handle row.
 *
 * `shrink-0`, unlike the dock outlet's `flex-1`: when the row runs out of width the **strips** are
 * the thing that should wrap onto a second line, because a strip is transient and the facts are
 * always there. Below the container-query threshold the facts collapse themselves rather than being
 * squeezed — never to nothing, which is the rule that milestone turned on.
 */
export function PlanFactsOutlet(): React.ReactElement {
  return <div ref={usePlanSlotRef('facts')} className="flex shrink-0 items-center" />;
}

/** Render the facts into the activities row's outlet when one exists, in place when none does. */
export function PlanFactsHost({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return <PlanSlotHost name="facts">{children}</PlanSlotHost>;
}

/* -------------------------------------------------------------------------------------------- */
/* The pen subject.                                                                               */
/* -------------------------------------------------------------------------------------------- */

/**
 * Where the pen's sentence lands inside the plan status bar.
 *
 * **Always mounted, unlike the facts outlet**, which is what makes the pen's fallback a genuine
 * fallback rather than a second layout: outside a plan workspace there is no status bar and no
 * provider, so `PlanSlotHost` renders the sentence in place beside the controls — exactly the markup
 * `CompactPenStatus` had before the split, which is why that component's own suite passes unedited.
 *
 * `min-w-0` because the widest of the ten lock sentences measures 432 px and the status row also
 * carries the plan's facts. The sentence truncates visually and stays whole in the live region,
 * which is the treatment it already had on the identity row.
 */
export function PenStatusOutlet(): React.ReactElement {
  return <div ref={usePlanSlotRef('pen')} className="flex min-w-0 items-center" />;
}

/** Render the pen's sentence into the status bar's outlet when one exists, in place when none does. */
export function PenStatusHost({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement | null {
  return <PlanSlotHost name="pen">{children}</PlanSlotHost>;
}
