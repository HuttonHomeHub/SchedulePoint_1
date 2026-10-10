import { useMediaQuery } from '@/components/ui/use-media-query';
import { DESIGNED_MIN_WIDTH_QUERY } from '@/lib/breakpoints';

/**
 * **Which of the deck's two rows leads** (product-owner decision, 2026-10-10, after toolbar-redesign
 * M4). At the 1024 px floor and wider the rows stack LOOK above DO, as they always have. Below it the
 * deck is one line that scrolls sideways, and there **the editing row leads**: the pen, Add, Link,
 * Select and Undo are what a planner on a small screen reaches for, and the viewing tools follow.
 *
 * **The DOM order changes, not the CSS order.** `order` on a flex child would put the rows in one
 * sequence on screen and another in the Tab and arrow-key sequence, which WCAG 1.3.2 and 2.4.3
 * forbid; and the roving walk is read from the document (`[data-toolbar-focusable]`), so the rows
 * must be rendered in the order they are to be read. A viewport width therefore decides which
 * order `Deck` renders — the one media-query read the deck has, kept in this file so `Deck.tsx`
 * itself still contains none (`deck-no-measurement.structural.test.ts`). It decides an order, never
 * a size, and `DESIGNED_MIN_WIDTH_QUERY` is the same query Tailwind's `lg` and the shell use.
 *
 * Unmeasured (jsdom, the first frame) is the wide order, which is every existing test's.
 */
export function useDeckRowOrder<Row extends string>(rows: readonly Row[]): readonly Row[] {
  const wide = useMediaQuery(DESIGNED_MIN_WIDTH_QUERY, true);
  return wide ? rows : [...rows].reverse();
}
