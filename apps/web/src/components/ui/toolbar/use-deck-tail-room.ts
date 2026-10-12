import { useMediaQuery } from '@/components/ui/use-media-query';
import { DECK_TAIL_ROOM_QUERY } from '@/lib/breakpoints';

/**
 * **Whether the deck has room to send a `groupTail` item to the end of its group** (toolbar-grid M3,
 * owner decision 2026-10-12). From 80 rem, the width at which the deck's own container reaches
 * `--container-roomy`, and wider; below it the item stays in its section, because the move and its
 * rule cost the DO row 12 px that the 1024 floor does not have with Link armed
 * (`m0-measurement.md` §4).
 *
 * **The DOM order changes, not the CSS order**, for the reason `use-deck-row-order.ts` gives: an
 * `order` on a flex child would put the gear last on screen and in the middle of the Tab and arrow
 * sequence, which WCAG 1.3.2 and 2.4.3 forbid. A viewport width therefore decides which order `Deck`
 * renders: the second media-query read the deck has, kept in this file so `Deck.tsx` itself still
 * contains none (`deck-no-measurement.structural.test.ts`). It decides a placement, never a size, and
 * the query is the promotion ladder's first stage, so the move and the ladder agree on the width.
 *
 * The first frame is already correct in a browser (`useMediaQuery` seeds from `matchMedia`
 * synchronously). jsdom has no `matchMedia`, so the answer is `false` and the item stays put: every
 * existing test's order.
 */
export function useDeckTailRoom(): boolean {
  return useMediaQuery(DECK_TAIL_ROOM_QUERY, false);
}
