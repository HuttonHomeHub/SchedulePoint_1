import { createContext, useContext } from 'react';

/**
 * **Whether the screen that owns a Refresh has asked every `StatusSection` below it to stay quiet
 * while that Refresh runs** (ADR-0178 D8).
 *
 * A Refresh re-reads six queries, and each `announce="change"` box whose sentence moved would speak
 * it politely: several interruptions of one reader, on top of the page's own single sentence
 * (`Refreshed. …`). While this is `true` a box writes its new sentence as plain text a reader can
 * still reach, keeps its live region empty, and takes that sentence as its new resting state — so
 * nothing it reached during the window is spoken later, when the mute lifts.
 *
 * **A context and not a prop, for the same reason `HeadingLevelContext` is one.** The fact belongs
 * to the screen that owns Refresh; the sections sit three levels below it in two features,
 * and `features/perf-probe` may not import `features/staff`, so a prop would have to be threaded
 * through panels that have no business knowing a Refresh exists. The default is `false`, which is
 * what every caller outside the staff console reads, so their markup is unchanged.
 *
 * It does not touch `QueryErrorState`'s `role="alert"`: a read that newly fails still interrupts,
 * by design — an error is not a standing condition.
 */
const StatusMuteContext = createContext(false);

/** Whether a section rendered here should keep its live region silent. */
export function useStatusMuted(): boolean {
  return useContext(StatusMuteContext);
}

export interface StatusMuteProviderProps {
  /** Whether every `StatusSection` below should keep its live region silent. */
  muted: boolean;
  children: React.ReactNode;
}

/** The screen's way to say "quiet, please" to every `StatusSection` it contains. */
export function StatusMuteProvider({
  muted,
  children,
}: StatusMuteProviderProps): React.ReactElement {
  return <StatusMuteContext.Provider value={muted}>{children}</StatusMuteContext.Provider>;
}
