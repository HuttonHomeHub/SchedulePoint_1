import { useEffect, useRef } from 'react';

import { useAnnounce } from '@/components/ui/announcer';

/**
 * Announce a section's result count **once**, when a list that was loading settles.
 *
 * **Why this is not `useResultCountAnnouncement`** (`hooks/use-result-count-announcement.ts`).
 * That hook is deliberately *silent on first settle* — it exists for a filtered table, where the
 * first paint is the screen the reader has just navigated to and announcing it would talk over
 * them. On this screen the first settle is the only settle there will ever be: nothing here is
 * filtered, so using the shared hook would mean the sections never announce at all.
 *
 * The distinction that makes an announcement correct here is **whether a skeleton was on screen**.
 * A reader who arrives to settled content has the headings and rows statically available and needs
 * no live region; a reader who was sitting on `aria-busy` skeletons when the data arrived gets
 * nothing otherwise — that is the WCAG 4.1.3 Status Messages case, and it is the one this fires on.
 * A cached instant render therefore announces nothing, which is the behaviour a reader wants and
 * the reason the flag is `sawPending` rather than "first settle".
 */
export function useSettledCountAnnouncement({
  pending,
  message,
}: {
  pending: boolean;
  /** The sentence to speak, or `null` to speak nothing for this state. */
  message: string | null;
}): void {
  const announce = useAnnounce();
  const sawPending = useRef(false);
  const spoken = useRef(false);

  useEffect(() => {
    if (pending) {
      sawPending.current = true;
      return;
    }
    if (!sawPending.current || spoken.current || message === null) return;
    spoken.current = true;
    announce(message);
  }, [pending, message, announce]);
}
