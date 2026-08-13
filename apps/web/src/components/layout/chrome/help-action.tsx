import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

/**
 * **A seam for the one help action the shell can offer but never owns** (ADR-0091 M7-S5).
 *
 * The keyboard-shortcuts sheet moved off the TSLD toolbar and into the account menu. That menu lives
 * in the app header, which ADR-0029 keeps **plan-unaware**: it mounts once, knows nothing about
 * plans, and must not remount when one opens. The sheet, meanwhile, is a *diagram* reference
 * (`TsldShortcutsHelp`, "Diagram keyboard shortcuts") whose open/closed state belongs to
 * `use-tsld-canvas-ui-state`.
 *
 * So nothing about the dialog moves. The workspace registers a **callback**; the shell renders a
 * menu item that calls it. This is the `ChromeSlot` argument one layer smaller — there the workspace
 * hands the shell a DOM subtree, here it hands it a function — and it keeps the same property: the
 * shell learns that *something* can be opened, never what a plan is.
 *
 * **Nothing registered ⇒ no menu item at all.** That is ADR-0082's discriminator applied honestly:
 * outside a plan there is no diagram to describe shortcuts for, so the action does not apply to the
 * object and is omitted rather than shaded. A shaded "Keyboard shortcuts" on the Clients screen
 * would be a refusal with no state the reader could change.
 */
interface HelpActions {
  /** Open the diagram keyboard-shortcuts sheet, or `null` where no surface offers one. */
  openShortcuts: (() => void) | null;
  register: (open: (() => void) | null) => void;
}

const HelpActionContext = createContext<HelpActions | null>(null);

export function HelpActionProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [openShortcuts, setOpenShortcuts] = useState<(() => void) | null>(null);
  // `setState` treats a function argument as an updater, so a callback being *stored* has to be
  // wrapped — `setOpenShortcuts(fn)` would call `fn` with the previous value and store its return.
  const register = useCallback((open: (() => void) | null) => setOpenShortcuts(() => open), []);
  const value = useMemo(() => ({ openShortcuts, register }), [openShortcuts, register]);
  return <HelpActionContext value={value}>{children}</HelpActionContext>;
}

/**
 * Offer this surface's shortcuts sheet to the shell for as long as the caller is mounted.
 *
 * Unregisters on unmount, which is what stops the menu item outliving the plan that offered it and
 * calling into an unmounted workspace.
 */
export function useRegisterShortcutsAction(open: () => void): void {
  const ctx = useContext(HelpActionContext);
  const register = ctx?.register;
  useEffect(() => {
    if (!register) return;
    register(open);
    return () => register(null);
  }, [register, open]);
}

/** The registered shortcuts action, or `null` when no surface offers one. */
export function useShortcutsAction(): (() => void) | null {
  return useContext(HelpActionContext)?.openShortcuts ?? null;
}
