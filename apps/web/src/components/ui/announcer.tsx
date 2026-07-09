import { createContext, useCallback, useContext, useMemo, useState } from 'react';

/**
 * A single polite `aria-live` region for the app. Feature code calls
 * `useAnnounce()` to announce the result of an async action (create/save/
 * delete) so screen-reader users get confirmation that a mutation succeeded —
 * WCAG 4.1.3 Status Messages (DESIGN_SYSTEM.md → live regions).
 */
const AnnouncerContext = createContext<(message: string) => void>(() => {});

export function AnnouncerProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [message, setMessage] = useState('');

  const announce = useCallback((next: string) => {
    // Clear first so re-announcing the same text still fires the live region.
    setMessage('');
    requestAnimationFrame(() => setMessage(next));
  }, []);

  const value = useMemo(() => announce, [announce]);

  return (
    <AnnouncerContext.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="true" className="sr-only" data-testid="announcer">
        {message}
      </div>
    </AnnouncerContext.Provider>
  );
}

/** Returns `announce(message)` — writes to the app's shared polite live region. */
export function useAnnounce(): (message: string) => void {
  return useContext(AnnouncerContext);
}
