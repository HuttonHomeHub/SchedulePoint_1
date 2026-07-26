import { useEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * Announce a list's result count whenever a search/filter change settles — WCAG 4.1.3 **Status
 * Messages**. A table that silently shrinks under a debounced search is invisible to a screen-reader
 * user: they type, nothing is spoken, and the only way to learn the outcome is to walk the whole
 * table. The shared `Combobox` already does this for its listbox; this is the same contract for the
 * library **tables**.
 *
 * Deliberate behaviours:
 * - **Silent on first paint.** The initial load is not a "result changed" event; announcing it would
 *   talk over the screen the user just navigated to.
 * - **Silent while fetching.** Only the settled count is announced, so one announcement follows a
 *   typing burst rather than one per keystroke (the caller debounces the request; this waits for it).
 * - **Idempotent.** The same message is never repeated back-to-back — re-rendering for an unrelated
 *   reason must not re-announce.
 */
export function useResultCountAnnouncement({
  enabled = true,
  pending,
  count,
  /** Changes whenever the query/filters change — the trigger for a new announcement. */
  filterKey,
  /** Singular noun, e.g. "calendar". Pluralised with a trailing "s". */
  noun,
  /** Message when nothing matched; defaults to a generic one. */
  emptyMessage,
}: {
  enabled?: boolean;
  pending: boolean;
  count: number;
  filterKey: string;
  noun: string;
  emptyMessage?: string;
}): void {
  const announce = useAnnounce();
  const lastKey = useRef<string | null>(null);
  const lastMessage = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled || pending) return;
    const key = `${filterKey}|${count}`;
    // First settled render establishes the baseline without speaking.
    if (lastKey.current === null) {
      lastKey.current = key;
      return;
    }
    if (lastKey.current === key) return;
    lastKey.current = key;
    const message =
      count === 0
        ? (emptyMessage ?? `No ${noun}s match your filters.`)
        : `${count} ${noun}${count === 1 ? '' : 's'} found.`;
    if (message === lastMessage.current) return;
    lastMessage.current = message;
    announce(message);
  }, [enabled, pending, count, filterKey, noun, emptyMessage, announce]);
}
