import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef } from 'react';
import { useSyncExternalStore } from 'react';

import type { UnsavedWorkReport } from '@/lib/unsaved-work/report';

/**
 * Who is holding unsaved work, right now.
 *
 * **The registry is a ref, not state.** Its primary reader is the navigation blocker, which is
 * *called* at the moment a navigation is attempted rather than rendered — so a `useState` registry
 * would re-render the whole authenticated shell on every keystroke that flips a form's dirty flag,
 * to serve a reader that never renders. A subscription is offered separately for consumers that
 * genuinely need to paint from it.
 *
 * **Registration is keyed by a token this hook mints itself** (`useId`), never by a caller-supplied
 * string. A caller-supplied key means two mounts of the same component share an entry, and then the
 * first to unmount deletes the survivor's registration — a guard that silently stops guarding,
 * which is the worst failure this feature has.
 *
 * **Release belongs to unmount alone**, following the precedent `drawer-subject.tsx` set before it
 * was deleted with the context drawer (`docs/TECH_DEBT.md` #156), and for the reason recorded here
 * rather than by pointer: a cleanup returned from the reporting effect runs on every dependency
 * change, which would unregister and re-register on every edit. That is harmless today only because
 * React batches the pair into one commit — i.e. it relies on a batching detail to make a wrong
 * statement look right.
 */
interface Registry {
  register: (token: string, report: UnsavedWorkReport | null) => void;
  release: (token: string) => void;
  /** Live read for the blocker. Not safe to call during render. */
  read: () => readonly UnsavedWorkReport[];
  subscribe: (fn: () => void) => () => void;
  version: () => number;
}

/** Scope-for-scope equality, so a re-rendered literal is not mistaken for a change. */
function sameReport(a: UnsavedWorkReport, b: UnsavedWorkReport): boolean {
  if (a.subject !== b.subject || a.scopes.length !== b.scopes.length) return false;
  return a.scopes.every((scope, i) => {
    const other = b.scopes[i];
    return (
      other !== undefined &&
      scope.key === other.key &&
      scope.label === other.label &&
      scope.savable === other.savable
    );
  });
}

const UnsavedWorkContext = createContext<Registry | null>(null);

export function UnsavedWorkProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const entries = useRef(new Map<string, UnsavedWorkReport>());
  const subscribers = useRef(new Set<() => void>());
  const version = useRef(0);

  const registry = useMemo<Registry>(() => {
    const bump = (): void => {
      version.current += 1;
      for (const fn of subscribers.current) fn();
    };
    return {
      register: (token, report) => {
        const held = entries.current.get(token);
        // Nothing to say, and nothing was being said: skip the notify entirely, or every render of
        // a clean form wakes every subscriber.
        if (report === null || report.scopes.length === 0) {
          if (held === undefined) return;
          entries.current.delete(token);
          bump();
          return;
        }
        // Skip the notify when nothing actually changed. Callers pass an object literal, so a
        // re-render produces a NEW report that is scope-for-scope identical — without this, every
        // keystroke in a registered form woke every subscriber. Fixing it here rather than asking
        // four call sites to memoise correctly: the component review found three of the four
        // already diverging from the one that got it right, which is the argument for making the
        // API robust instead of documenting a contract.
        if (held !== undefined && sameReport(held, report)) return;
        entries.current.set(token, report);
        bump();
      },
      // Deletes THIS token's entry and no other. A successor that mounted under a different token
      // is untouched, which is what makes remount-during-transition safe.
      release: (token) => {
        if (entries.current.delete(token)) bump();
      },
      read: () => [...entries.current.values()],
      subscribe: (fn) => {
        subscribers.current.add(fn);
        return () => {
          subscribers.current.delete(fn);
        };
      },
      version: () => version.current,
    };
  }, []);

  return <UnsavedWorkContext.Provider value={registry}>{children}</UnsavedWorkContext.Provider>;
}

/**
 * Read the registry live. For the blocker and for anything else called rather than rendered.
 * Returns an empty list outside a provider, so a surface can register unconditionally.
 */
export function useUnsavedWorkRegistry(): Registry | null {
  return useContext(UnsavedWorkContext);
}

/**
 * Re-render when the registry changes. Only for consumers that must paint from it.
 *
 * **Dormant: nothing in the application calls this** — only its own suite and
 * `ActivityEditor.registers-unsaved-work.test.tsx` do (`docs/TECH_DEBT.md` #184, re-verified
 * 2026-08-31 by `rg useUnsavedWorkReports apps/web/src`). Both current readers of the registry are
 * *called* rather than rendered — the navigation blocker asks `hasUnsavedWork` at the moment of
 * navigating, and the editor's confirmation reads its own report — so neither needs to repaint when
 * the registry changes.
 *
 * It is kept rather than deleted because a surface that PAINTS from the registry (a "you have
 * unsaved work" indicator in the chrome) needs exactly this, and the `useSyncExternalStore` +
 * version-counter shape below is the non-obvious part; but that is a reason, not a caller. Stated
 * here rather than left to be inferred, because a documented-as-future-facing export reads to the
 * next reader as one that is in use (ADR-0081, one register along).
 */
export function useUnsavedWorkReports(): readonly UnsavedWorkReport[] {
  const registry = useContext(UnsavedWorkContext);
  const subscribe = useCallback(
    (fn: () => void) => registry?.subscribe(fn) ?? (() => {}),
    [registry],
  );
  // Snapshot must be referentially stable between changes or useSyncExternalStore loops; the
  // version counter is what makes that cheap without copying the map on every check.
  const versionSnapshot = useSyncExternalStore(
    subscribe,
    () => registry?.version() ?? 0,
    () => 0,
  );
  return useMemo(
    () => registry?.read() ?? [],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read exactly when the registry says it changed
    [registry, versionSnapshot],
  );
}

/**
 * Declare this surface's unsaved work. Pass `null` (or a report with no scopes) when clean.
 *
 * The token is minted here and is stable for this component instance's lifetime, so two mounts of
 * the same component never share an entry.
 */
export function useRegisterUnsavedWork(report: UnsavedWorkReport | null): void {
  const token = useId();
  const registry = useContext(UnsavedWorkContext);

  useEffect(() => {
    registry?.register(token, report);
  }, [registry, token, report]);

  useEffect(
    () => () => {
      registry?.release(token);
    },
    [registry, token],
  );
}
