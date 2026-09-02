import type { ActivitySummary } from '@repo/types';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * **The WBS band's text equivalent** (`docs/TECH_DEBT.md` #232), with `VITE_WBS_IMPROVEMENTS`
 * forced on.
 *
 * The band canvas is `aria-hidden`, so a screen-reader user reaches it through this or not at all.
 * There was no text equivalent, and **two places in the repository said there was** — a comment in
 * `TsldCanvas.tsx` and ADR-0063 §7. Both were right about a real `WBS_SUMMARY`, which is an
 * ordinary activity and therefore already a listbox row, and wrong about the derived bucket, which
 * has no activity id and structurally cannot be one. Being right about half its subject is why
 * nobody reading either noticed.
 *
 * A sibling suite (`TsldPanel.wbs-band.test.tsx`) pins ADR-0063 §4's invariant — that the count of
 * AT-reachable activities does not change across the toggle — and is deliberately **not edited by
 * this change**: an invariant you have to touch to make room for your feature was never an
 * invariant. It still passes, which is the strongest thing this file can say about safety.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: true,
}));

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { TsldPanel } from './TsldPanel';

import { DEFAULT_VIEW_TOGGLES } from '@/features/tsld/render/paint';
import { useTsldCanvasUiState } from '@/features/tsld/toolbar/use-tsld-canvas-ui-state';
import { anActivity } from '@/test/activity-fixture';

const dated = (over: Partial<ActivitySummary> & { id: string }): ActivitySummary =>
  anActivity({ earlyStart: '2026-01-05', earlyFinish: '2026-01-09', ...over });

/** Two levels, two branches, and something unfiled — the shape a flat list gets wrong. */
const NESTED: ActivitySummary[] = [
  dated({ id: 'structure', name: 'Structure', type: 'WBS_SUMMARY', laneIndex: 0 }),
  dated({
    id: 'sub',
    name: 'Substructure',
    type: 'WBS_SUMMARY',
    parentId: 'structure',
    laneIndex: 1,
  }),
  dated({ id: 'a', name: 'Excavate', parentId: 'sub', laneIndex: 2 }),
  dated({ id: 'b', name: 'Pour slab', parentId: 'sub', laneIndex: 3 }),
  dated({ id: 'fitout', name: 'Fit-out', type: 'WBS_SUMMARY', laneIndex: 4 }),
  dated({ id: 'c', name: 'Second fix', parentId: 'fitout', laneIndex: 5 }),
  dated({ id: 'loose', name: 'Site setup', laneIndex: 6 }),
];

function Harness({ band }: { band: boolean }): React.ReactElement {
  const ui = useTsldCanvasUiState();
  return (
    <TsldPanel
      activities={NESTED}
      dependencies={[]}
      dataDate="2026-01-01"
      canvasUi={{ ...ui, viewToggles: { ...DEFAULT_VIEW_TOGGLES, wbsBand: band } }}
    />
  );
}

const bands = (): HTMLElement => screen.getByRole('list', { name: 'Work breakdown bands' });

describe('TsldPanel — the WBS band’s text equivalent', () => {
  it('exists only while the band does', () => {
    const { rerender } = render(<Harness band={false} />);
    expect(screen.queryByRole('list', { name: 'Work breakdown bands' })).toBeNull();

    rerender(<Harness band />);
    expect(bands()).toBeInTheDocument();
  });

  it('names every group and the bucket, with its count', () => {
    render(<Harness band />);
    const items = within(bands())
      .getAllByRole('listitem')
      .map((li) => li.textContent);
    expect(items).toEqual([
      // Structure holds the whole subtree: Substructure + its two members.
      'Structure, 3 activities',
      'Substructure, 2 activities',
      'Fit-out, 1 activity',
      'Unassigned, 1 activity',
    ]);
  });

  /**
   * **Depth-first, not by depth.** `wbsBandGroups` sorts by depth and `Array.sort` is stable, so
   * its order is every depth-0 row then every depth-1 row — which would put `Fit-out` between
   * `Structure` and `Substructure` and make `aria-level`'s "the nearest preceding item one level
   * up contains this" a lie. The description re-orders a copy; the canvas array is untouched.
   */
  it('lists a parent immediately before its own subtree', () => {
    render(<Harness band />);
    const items = within(bands())
      .getAllByRole('listitem')
      .map((li) => li.textContent ?? '');
    expect(items.findIndex((t) => t.startsWith('Substructure'))).toBe(
      items.findIndex((t) => t.startsWith('Structure')) + 1,
    );
  });

  /**
   * The nesting cue. Without it a reader hears two counts and adds them — and because the counts
   * are subtree totals, a nested group's is already inside its ancestor's, so the sum is wrong by
   * construction rather than by rounding.
   */
  it('states each group’s level, and puts the bucket at the top level', () => {
    render(<Harness band />);
    const levels = within(bands())
      .getAllByRole('listitem')
      .map((li) => li.getAttribute('aria-level'));
    expect(levels).toEqual(['1', '2', '1', '1']);
  });

  /**
   * `role="list"`/`role="listitem"` are explicit, and this asserts the ROLE rather than the tag:
   * Tailwind v4's Preflight sets `list-style: none` on every `ul`, which is a documented cause of
   * WebKit/VoiceOver dropping the implicit roles. A DOM-shape assertion would pass in a browser
   * where the semantics had gone.
   */
  it('declares its roles rather than relying on the implicit ones', () => {
    render(<Harness band />);
    expect(bands()).toHaveAttribute('role', 'list');
    for (const li of within(bands()).getAllByRole('listitem')) {
      expect(li).toHaveAttribute('role', 'listitem');
    }
  });

  /**
   * Nothing here is operable: a band group is not a bar, and ADR-0063 §7 refuses selection for the
   * derived bucket. So it adds no tab stop and no `option`, which is what makes the §4 invariant
   * structurally safe rather than merely observed to hold.
   */
  it('adds nothing focusable and no listbox option', () => {
    render(<Harness band />);
    const list = bands();
    expect(list.querySelector('[tabindex]')).toBeNull();
    expect(within(list).queryAllByRole('option')).toHaveLength(0);
  });
});
