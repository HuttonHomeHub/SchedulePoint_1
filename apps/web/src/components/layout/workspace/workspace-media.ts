import { useMemo, useSyncExternalStore } from 'react';

import { rootFontPx, type WorkspaceBox } from './workspace-scale';
import { useWorkspaceScale } from './workspace-scale-provider';

/**
 * **A layout question asked inside the plan workspace is answered by the workspace, not the window**
 * (ADR-0222 D5). A media query sees the real window, and under a scaled workspace the real window is the
 * wrong box: at 1024 x 600 it is "short" while the workspace is laid out 783 high. The CSS side of this is
 * `globals.css` (`ws-short`, `band-*`, container queries on the two wrappers); this is the JS side.
 *
 * {@link useWorkspaceMatches} reads every query it is given in one snapshot (so a resize that crosses two
 * thresholds is never half-applied, the reason `usePromotionStage` exists in that shape) and answers a
 * **size** query from the layout window `workspace-scale.tsx` publishes. It falls back to
 * `window.matchMedia`, query by query, where it cannot answer:
 *
 * - outside a plan workspace, before the workspace has been measured (the first frame, and every unit
 *   test), and **whenever the workspace is not scaled**, so the behaviour there is exactly the old one;
 * - a query that is not a width or a height (`(pointer: coarse)` is about the input, not the box).
 *
 * `workspace-scale.structural.test.ts` lists the files inside the workspace allowed to use a window
 * media query, so a new one is a decision.
 */

const canMatch = (): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function';

type Comparison = '>=' | '<=' | '>' | '<';

/**
 * The size queries the workspace asks: the legacy `(min-width: 64rem)` form and the range form
 * `(width >= 80rem)` that `DECK_TAIL_ROOM_QUERY` and `SQUAT_QUERY` use. Anything else is `null`.
 */
function parseSizeQuery(
  query: string,
): { axis: 'width' | 'height'; compare: Comparison; px: (rootPx: number) => number } | null {
  const legacy = /^\(\s*(min|max)-(width|height)\s*:\s*([\d.]+)(rem|px)\s*\)$/.exec(query.trim());
  const range = /^\(\s*(width|height)\s*(>=|<=|>|<)\s*([\d.]+)(rem|px)\s*\)$/.exec(query.trim());
  if (legacy) {
    const [, bound, axis, amount, unit] = legacy;
    return {
      axis: axis as 'width' | 'height',
      compare: bound === 'min' ? '>=' : '<=',
      px: (rootPx) => Number(amount) * (unit === 'rem' ? rootPx : 1),
    };
  }
  if (range) {
    const [, axis, compare, amount, unit] = range;
    return {
      axis: axis as 'width' | 'height',
      compare: compare as Comparison,
      px: (rootPx) => Number(amount) * (unit === 'rem' ? rootPx : 1),
    };
  }
  return null;
}

/** Whether the workspace's layout window satisfies `query`; `null` when it is not a size query. */
export function matchesLayoutWindow(
  query: string,
  layout: WorkspaceBox,
  rootPx: number,
): boolean | null {
  const parsed = parseSizeQuery(query);
  if (!parsed) return null;
  const value = layout[parsed.axis];
  const limit = parsed.px(rootPx);
  switch (parsed.compare) {
    case '>=':
      return value >= limit;
    case '<=':
      return value <= limit;
    case '>':
      return value > limit;
    case '<':
      return value < limit;
  }
}

/** The window's own answers as a bitmask, so `useSyncExternalStore` has a stable snapshot to compare. */
function useWindowMask(queries: readonly string[], fallback: boolean): number {
  const key = queries.join('\n');
  const subscribe = useMemo(
    () =>
      (onChange: () => void): (() => void) => {
        if (!canMatch()) return () => undefined;
        const lists = key.split('\n').map((query) => window.matchMedia(query));
        for (const list of lists) list.addEventListener('change', onChange);
        return () => {
          for (const list of lists) list.removeEventListener('change', onChange);
        };
      },
    [key],
  );
  const read = useMemo(
    () => (): number => {
      const all = key.split('\n');
      if (!canMatch()) return fallback ? (1 << all.length) - 1 : 0;
      let mask = 0;
      all.forEach((query, index) => {
        if (window.matchMedia(query).matches) mask |= 1 << index;
      });
      return mask;
    },
    [key, fallback],
  );
  return useSyncExternalStore(subscribe, read, () => (fallback ? (1 << queries.length) - 1 : 0));
}

/**
 * Every query's answer, in order, from one snapshot. `fallback` is what a query answers where there is
 * no `matchMedia` at all (jsdom), as for `useMediaQuery`.
 */
export function useWorkspaceMatches(
  queries: readonly string[],
  fallback = false,
): readonly boolean[] {
  const state = useWorkspaceScale();
  // **Only while scaled.** At scale 1 the workspace is laid out in the window's own pixels, so the window
  // already answers exactly (the band spans it) and keeps answering as it always did: that is what SC-8 asks
  // ("nothing changes at 1280 x 800"), and it is what the measurement harnesses that stub `matchMedia` by
  // exact string (`measure-toolbar/toolbar-redesign-m5.spec.ts`, `M5_UNPROMOTED`) rely on at the widths
  // they run at.
  const layout = state.scale < 1 ? state.window : null;
  const windowMask = useWindowMask(queries, fallback);
  const rootPx = layout ? rootFontPx() : 16;
  return queries.map((query, index) => {
    const own = layout ? matchesLayoutWindow(query, layout, rootPx) : null;
    return own ?? (windowMask & (1 << index)) !== 0;
  });
}

/** One query, answered as {@link useWorkspaceMatches} does. */
export function useWorkspaceMedia(query: string, fallback = false): boolean {
  return useWorkspaceMatches([query], fallback)[0] ?? fallback;
}
