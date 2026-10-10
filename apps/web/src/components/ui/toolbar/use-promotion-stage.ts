import { useMemo } from 'react';

import type { PromotionPointer, PromotionStage, PromotionState } from './toolbar-promotion';

import { useCoarsePointer } from '@/components/ui/use-coarse-pointer';
import { useMediaQuery } from '@/components/ui/use-media-query';
import {
  PROMOTE_119_5,
  PROMOTE_160,
  PROMOTE_80,
  PROMOTE_90,
  promotionStageQuery,
} from '@/lib/breakpoints';

/**
 * **Which promotion stage this viewport has reached, and which pointer set applies at it**
 * (toolbar-redesign M5, spec §4.11). Media-query listeners only: no observer, no measurement of the
 * deck, so the ladder cannot become the width mechanism ADR-0109 D1 deleted. The stage is derived
 * from the *viewport*, which is honest for the deck because the band spans both grid columns whatever
 * the Explorer does (`app-shell.tsx`).
 *
 * `useMediaQuery` seeds its state from `matchMedia` synchronously, so a wide window never paints the
 * unpromoted bar first. Where there is no `matchMedia` at all (jsdom) the answer is stage `0` — the
 * unpromoted deck — which is every existing test's.
 *
 * The pointer is `useCoarsePointer` and nothing else (ADR-0183 D3, `input-axis.structural.test.ts`):
 * a finger-sized control is wider, so the same command is promoted at a different stage, and the
 * stylesheet's `pointer-coarse:` and this hook cannot then disagree about which set applies.
 */
export function usePromotionStage(): PromotionState {
  const at80 = useMediaQuery(promotionStageQuery(PROMOTE_80));
  const at90 = useMediaQuery(promotionStageQuery(PROMOTE_90));
  const at119 = useMediaQuery(promotionStageQuery(PROMOTE_119_5));
  const at160 = useMediaQuery(promotionStageQuery(PROMOTE_160));
  const coarse = useCoarsePointer();
  const stage = (Number(at80) + Number(at90) + Number(at119) + Number(at160)) as PromotionStage;
  const pointer: PromotionPointer = coarse ? 'coarse' : 'fine';
  return useMemo(() => ({ stage, pointer }), [stage, pointer]);
}
