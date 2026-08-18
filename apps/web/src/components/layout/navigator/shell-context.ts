import { createContext, useContext } from 'react';

/**
 * Shell services the {@link AppShell} exposes to chrome rendered inside it (notably
 * the header's drawer toggle below `lg`). `null` when there is no persistent shell, so consumers
 * render nothing extra. Since `VITE_NAV_TREE` retired that means one case rather than two: chrome
 * rendered outside {@link AppShell}, which today is the `DESIGNED_CHROME`-off header.
 */
export interface ShellContextValue {
  /** Open the navigator rail as an off-canvas drawer (small screens). */
  openDrawer: () => void;
}

export const ShellContext = createContext<ShellContextValue | null>(null);

/** The shell services, or `null` outside a persistent shell (flag-off path). */
export function useShell(): ShellContextValue | null {
  return useContext(ShellContext);
}
