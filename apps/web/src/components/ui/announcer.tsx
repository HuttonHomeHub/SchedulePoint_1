import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

/**
 * A single polite `aria-live` region for the app. Feature code calls
 * `useAnnounce()` to announce the result of an async action (create/save/
 * delete) so screen-reader users get confirmation that a mutation succeeded —
 * WCAG 4.1.3 Status Messages (DESIGN_SYSTEM.md → live regions).
 */
/** Options for one announcement. */
export interface AnnounceOptions {
  /**
   * A **standing count or status** that is stale the moment anything else is said (a combobox's "5
   * results available"). In the same frame as a non-transient message it is dropped, and it never
   * prefixes one; on its own it is spoken as usual. Default: not transient.
   */
  transient?: boolean;
}
type Announce = (message: string, options?: AnnounceOptions) => void;

const AnnouncerContext = createContext<Announce>(() => {});

interface Entry {
  text: string;
  transient: boolean;
}

export function AnnouncerProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [message, setMessage] = useState('');

  // **Announcements in one frame are kept together.** The region is written once per frame and a later
  // write replaces the earlier text, so the second of two announcements in the same frame was the only
  // one spoken: Follow logic's outcome and the focus hand-off's "no longer available" sentence land
  // together, and the first was never painted. Messages asked for before the write, or in the frame that
  // makes it, are joined in the order asked and each is spoken once, **except a transient one, which
  // never rides with a message that matters** (see {@link AnnounceOptions}). One in a later frame
  // replaces the text, as before.
  // The same sentence asked for twice in one join is spoken once: a double-fired handler must not be
  // heard twice (found by the accessibility review of this change, 2026-11-14).
  const pending = useRef<Entry[]>([]);
  const settling = useRef<Entry[]>([]);
  const announce = useCallback<Announce>((next, options) => {
    const entry: Entry = { text: next, transient: options?.transient === true };
    const spoken = settling.current;
    if (spoken.length > 0) {
      if (spoken.some((e) => e.text === next)) return;
      const heardMatters = spoken.some((e) => !e.transient);
      if (entry.transient && heardMatters) return;
      // A transient write is replaced, not prefixed, by a message that matters.
      settling.current = !entry.transient && !heardMatters ? [entry] : [...spoken, entry];
      setMessage(settling.current.map((e) => e.text).join(' '));
      return;
    }
    if (pending.current.some((e) => e.text === next)) return;
    // Clear first so re-announcing the same text still fires the live region.
    setMessage('');
    pending.current.push(entry);
    if (pending.current.length > 1) return;
    requestAnimationFrame(() => {
      const all = pending.current;
      pending.current = [];
      const mattering = all.filter((e) => !e.transient);
      const kept = mattering.length > 0 ? mattering : all;
      settling.current = kept;
      setMessage(kept.map((e) => e.text).join(' '));
      // The frame after the write closes the join: anything later is a new announcement.
      requestAnimationFrame(() => {
        settling.current = [];
      });
    });
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
export function useAnnounce(): Announce {
  return useContext(AnnouncerContext);
}
