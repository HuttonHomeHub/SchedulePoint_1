import { useMediaQuery } from './use-media-query';

/**
 * The one JS spelling of the input axis (ADR-0118 D2, dense-row-touch-targets). The CSS half is the
 * `pointer-coarse:` utility and the `@media (pointer: coarse)` token block in `globals.css`; code
 * that must change a *number* with the pointer (a virtualized row's height, which no class can
 * reach) asks here, so it cannot drift from the stylesheet's gate. `pointer`, not `any-pointer`: the
 * primary input decides the posture, and a touchscreen laptop with a mouse is a mouse.
 * `input-axis.structural.test.ts` refuses any other `(pointer: …)` literal in code.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

/** Whether the primary pointer is coarse, live: it flips when a keyboard cover is attached. */
export function useCoarsePointer(): boolean {
  return useMediaQuery(COARSE_POINTER_QUERY, false);
}
