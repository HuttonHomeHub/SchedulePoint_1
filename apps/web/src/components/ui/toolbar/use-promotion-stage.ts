import { useMemo, useSyncExternalStore } from 'react';

import type { PromotionPointer, PromotionStage, PromotionState } from './toolbar-promotion';

import { useCoarsePointer } from '@/components/ui/use-coarse-pointer';
import { PROMOTION_STAGE_REMS, promotionStageQuery } from '@/lib/breakpoints';

const QUERIES = PROMOTION_STAGE_REMS.map(promotionStageQuery);

/** Whether this environment can answer a media query at all (jsdom cannot). */
function canMatch(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

function subscribe(onChange: () => void): () => void {
  if (!canMatch()) return () => undefined;
  const lists = QUERIES.map((query) => window.matchMedia(query));
  for (const list of lists) list.addEventListener('change', onChange);
  return () => {
    for (const list of lists) list.removeEventListener('change', onChange);
  };
}

/** Every threshold is read in the same call, so a snapshot is never a half-applied resize. */
function readStage(): PromotionStage {
  if (!canMatch()) return 0;
  let reached = 0;
  for (const query of QUERIES) if (window.matchMedia(query).matches) reached += 1;
  return reached as PromotionStage;
}

/**
 * **Which promotion stage this viewport has reached, and which pointer set applies at it**
 * (toolbar-redesign M5, spec §4.11). Media-query listeners only: no observer, no measurement of the
 * deck, so the ladder cannot become the width mechanism ADR-0109 D1 deleted. The stage is derived
 * from the *viewport*, which is honest for the deck because the band spans both grid columns whatever
 * the Explorer does (`app-shell.tsx`).
 *
 * **One subscription over every threshold, not one `useMediaQuery` per threshold.** Each query's
 * listener fires on its own, and per-query state rendered the intermediate stage of a resize that
 * crosses two thresholds at once (1280 → 1912 painted stage 2 before stage 3, measured in the
 * browser). That intermediate frame closed an open menu and moved focus for a stage the reader never
 * reached, and meant a row promoted at the final stage was seen to leave in two steps. A snapshot
 * that reads every query together cannot be half-applied.
 *
 * Where there is no `matchMedia` at all (jsdom) the answer is stage `0` — the unpromoted deck — which
 * is every existing test's. In a browser it is read synchronously, so a wide window never paints the
 * unpromoted bar first.
 *
 * The pointer is `useCoarsePointer` and nothing else (ADR-0183 D3, `input-axis.structural.test.ts`):
 * a finger-sized control is wider, so the same command is promoted at a different stage, and the
 * stylesheet's `pointer-coarse:` and this hook cannot then disagree about which set applies.
 */
export function usePromotionStage(): PromotionState {
  const stage = useSyncExternalStore(subscribe, readStage, (): PromotionStage => 0);
  const coarse = useCoarsePointer();
  const pointer: PromotionPointer = coarse ? 'coarse' : 'fine';
  return useMemo(() => ({ stage, pointer }), [stage, pointer]);
}
