import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';

/**
 * A **registered drawer subject** — how a route offers the context drawer something to show
 * without the shell learning what that something is.
 *
 * ## Why this exists rather than a `DrawerSubject` union member
 *
 * `tool-rail.tsx` states the rule the shell has kept since Graphite M4: _"The drawer subjects the
 * shell itself owns. Plan-scoped subjects arrive with the plan."_ An activity is plan-scoped, so
 * adding an `'activity'` literal to `DrawerSubject` would be the shell knowing what a plan is —
 * precisely what ADR-0029 exists to prevent, and what three previous epics had to undo after
 * putting a plan concept into chrome.
 *
 * So the shell offers **one generic second subject** and never names it. A route registers a label
 * (the rail button's accessible name) and a title (the drawer's `<h2>`); its markup arrives
 * separately through the `drawer` {@link ChromeSlotName} portal, which keeps that subtree exactly
 * where it is in the React tree and therefore still able to read the plan's model, its gating and
 * its mutations.
 *
 * **Two channels rather than one, deliberately.** The obvious single API is a registration carrying
 * a `render()` the shell calls — tidier to read, and wrong: the returned element's hooks would run
 * inside the shell's tree, inverting the ownership the portal exists to preserve. Data the shell
 * must *render* travels here; markup it must only *host* travels by portal.
 */
export interface DrawerSubjectRegistration {
  /** The rail button's accessible name — what a reader is choosing. Stable, not per-selection. */
  label: string;
  /**
   * The drawer's heading — the **subject**, which changes with the selection ("Excavate"), unlike
   * {@link label}. Absent means registered-but-nothing-selected, and the drawer says so explicitly
   * rather than keeping the previous subject's heading over the new one's empty body.
   */
  title?: string | undefined;
  /** The icon for the rail button. */
  icon: React.ReactNode;
}

interface DrawerSubjectValue {
  registration: DrawerSubjectRegistration | null;
  register: (registration: DrawerSubjectRegistration | null) => void;
}

const DrawerSubjectContext = createContext<DrawerSubjectValue>({
  registration: null,
  register: () => {},
});

/** Owns the registration. Rendered by the shell, above both the rail and the drawer. */
export function DrawerSubjectProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [registration, setRegistration] = useState<DrawerSubjectRegistration | null>(null);
  const value = useMemo(
    () => ({ registration, register: setRegistration }),
    [registration, setRegistration],
  );
  return <DrawerSubjectContext value={value}>{children}</DrawerSubjectContext>;
}

/** What the shell reads: the current registration, or `null` when no route offers one. */
export function useDrawerSubjectRegistration(): DrawerSubjectRegistration | null {
  return useContext(DrawerSubjectContext).registration;
}

/**
 * Whether the drawer is **currently showing** the registered subject.
 *
 * A second context rather than a field on the first, because the two flow in opposite directions:
 * the registration goes up from the route, and this comes down from the shell, which is the only
 * thing that knows whether the drawer is open and which subject it is pointed at. Merging them
 * would mean the shell writing into the context the route writes into — a setState-in-effect and a
 * frame of the wrong answer.
 *
 * The route needs it because the editor renders **once**, and this decides its chrome: showing ⇒ a
 * drawer portal, not showing ⇒ the modal dialog. Mounting one of each would give a single activity
 * two independent sets of scope forms and two independent dirty states, which is exactly the drift
 * the M6-T1 extraction exists to make impossible.
 */
const DrawerSubjectShowingContext = createContext(false);

export function DrawerSubjectShowingProvider({
  showing,
  children,
}: {
  showing: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  return <DrawerSubjectShowingContext value={showing}>{children}</DrawerSubjectShowingContext>;
}

export function useDrawerSubjectShowing(): boolean {
  return useContext(DrawerSubjectShowingContext);
}

/**
 * A route offers the drawer a subject for as long as it is mounted.
 *
 * **Unregisters on unmount**, which is the whole reason it is an effect rather than a render-time
 * call: navigating away from a plan must take its rail button with it, or the shell offers a
 * subject whose content has gone and the drawer shows an empty panel with a live-looking button
 * beside it. The dependency list is the registration's fields rather than the object, so a caller
 * need not memoise one to avoid a re-registration loop.
 */
export function useDrawerSubject(registration: DrawerSubjectRegistration | null): void {
  const { register } = useContext(DrawerSubjectContext);
  const label = registration?.label;
  const title = registration?.title;
  const icon = registration?.icon;

  /**
   * The icon is held rather than depended on, and this is not defensive tidying.
   *
   * A caller writes `icon: <Info className="size-4" />`, which is a **new element every render**.
   * In the dependency array that is a changed dependency every render: register → setState →
   * re-render → new element → register… An icon is static per subject, so a ref is the honest
   * model of it, and the loop cannot form.
   *
   * **Reasoned, not observed** — the one call site hoists its icon to a module constant, so the
   * loop was never reachable. This makes it unreachable for the next caller too, which is the point
   * of putting it in the hook rather than in a comment at the call site.
   */
  const iconRef = useRef(icon);
  // Written in an effect, never during render — `react-hooks`' "Cannot access refs during render"
  // is right, and it fires on the write as well as the read. Declared BEFORE the registering effect
  // so it has already run when that one reads it: effects run in declaration order.
  useEffect(() => {
    iconRef.current = icon;
  });

  useEffect(() => {
    if (label === undefined || iconRef.current === undefined) {
      register(null);
      return;
    }
    register({ label, icon: iconRef.current, ...(title === undefined ? {} : { title }) });
  }, [register, label, title]);

  /**
   * **Unregistering belongs to unmount alone** — a latent correctness issue, not an observed defect,
   * and the distinction is recorded because I got it wrong first.
   *
   * A cleanup returned from the effect above runs on every dependency change, so changing `title`
   * would unregister and immediately re-register. I diagnosed a browser symptom as that, wrote it
   * up as a found defect, and then **could not make a test fail against it**: React batches the
   * cleanup's `register(null)` and the effect's `register({…})` into one commit, so no render ever
   * observes the `null`. The symptom had a different cause entirely (a probe clicking the activities
   * table's editor rather than the workspace's).
   *
   * The split is kept because it is what the code *means* — this hook unregisters when its route
   * goes away, and expressing that as a dependency-change cleanup is relying on a batching detail
   * to make a wrong statement harmless. It is not kept on the strength of a defect it did not fix.
   */
  useEffect(() => () => register(null), [register]);
}
