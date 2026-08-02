import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { GANTT_ROW_HEIGHT, GanttPanel } from './GanttPanel';

import { anActivity } from '@/test/activity-fixture';

/**
 * **Float-path emphasis in the Gantt** (audit F4, M3) — the peer of the canvas half, so this is not
 * a TSLD-only feature.
 *
 * The Gantt had **no de-emphasis idiom at all** before this: `GanttRowView`'s only state
 * distinction was selected-or-not. So this is a genuinely new visual treatment, and the constraints
 * that matter are the ones this repository has already learnt the expensive way — a de-emphasised
 * row keeps its tab stop, its `aria-rowindex` and its activation (the ADR-0063 M6 / ADR-0060 M6
 * findings), and the meaning is carried in **words** and not by opacity alone (WCAG 1.4.1).
 */

const scrollToIndex = vi.fn();

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: { count: number }) => ({
    getTotalSize: () => count * GANTT_ROW_HEIGHT,
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * GANTT_ROW_HEIGHT,
        size: GANTT_ROW_HEIGHT,
      })),
    scrollToIndex,
  }),
}));

const THREE = [
  anActivity({
    id: 'a',
    code: 'A10',
    name: 'Excavate',
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
  anActivity({
    id: 'b',
    code: 'B20',
    name: 'Piling',
    earlyStart: '2026-02-09',
    earlyFinish: '2026-02-20',
  }),
  anActivity({
    id: 'c',
    code: 'C30',
    name: 'Handover',
    earlyStart: '2026-02-23',
    earlyFinish: '2026-02-23',
  }),
];

function rowFor(name: string): HTMLElement {
  const row = screen.getAllByRole('row').find((candidate) => candidate.textContent?.includes(name));
  if (row === undefined) throw new Error(`no row for ${name}`);
  return row;
}

describe('GanttPanel — float-path emphasis', () => {
  it('de-emphasises rows that are not on the selected path', () => {
    render(<GanttPanel activities={THREE} emphasisIds={new Set(['a', 'b'])} />);
    expect(rowFor('Excavate').className).not.toContain('opacity-45');
    expect(rowFor('Piling').className).not.toContain('opacity-45');
    expect(rowFor('Handover').className).toContain('opacity-45');
  });

  it('names the de-emphasis in words, not by opacity alone', () => {
    // Opacity is emphasis; emphasis alone is the WCAG 1.4.1 defect ADR-0055 exists about. The
    // canvas's parallel listbox carries the same wording for the same reason.
    render(<GanttPanel activities={THREE} emphasisIds={new Set(['a'])} />);
    expect(within(rowFor('Handover')).getByText('(off the float path)')).toBeInTheDocument();
    expect(within(rowFor('Excavate')).queryByText('(off the float path)')).not.toBeInTheDocument();
  });

  it('keeps a de-emphasised row focusable, activatable and correctly indexed', () => {
    // Never `visibility: hidden`, never native `disabled` — both take the row out of the tab order,
    // which is exactly the ADR-0063 M6 finding.
    const onSelect = vi.fn();
    render(
      <GanttPanel activities={THREE} emphasisIds={new Set(['a'])} onSelectActivity={onSelect} />,
    );
    const row = rowFor('Handover');
    expect(row).toHaveAttribute('tabindex');
    expect(row).not.toHaveAttribute('aria-disabled');
    expect(row).toHaveAttribute('aria-rowindex', '4');
    row.click();
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: 'c' }));
  });

  it('changes nothing at all when no path is selected', () => {
    render(<GanttPanel activities={THREE} />);
    for (const name of ['Excavate', 'Piling', 'Handover']) {
      expect(rowFor(name).className).not.toContain('opacity-45');
      expect(within(rowFor(name)).queryByText('(off the float path)')).not.toBeInTheDocument();
    }
  });

  it('changes nothing for an EMPTY emphasis set — the everyday flag-on state', () => {
    render(<GanttPanel activities={THREE} emphasisIds={new Set()} />);
    expect(rowFor('Handover').className).not.toContain('opacity-45');
  });

  it('scrolls a chosen activity into view without taking focus', () => {
    // `focusRowAt` would also set `pendingFocus` and pull focus out of the panel the planner is
    // reading, mid-chain. Scroll only.
    scrollToIndex.mockClear();
    render(<GanttPanel activities={THREE} bringIntoViewActivityId="c" />);
    expect(scrollToIndex).toHaveBeenCalledWith(2, { align: 'center' });
    expect(document.activeElement).toBe(document.body);
  });

  it('expands a collapsed WBS parent rather than silently doing nothing', () => {
    // `rowRefs` holds RENDERED rows and `rows` excludes anything under a collapsed summary, so a
    // naive `scrollIntoView` on a hidden target is a no-op that looks like a broken control.
    const summary = anActivity({
      id: 'w',
      code: 'W',
      name: 'Substructure',
      type: 'WBS_SUMMARY',
      earlyStart: '2026-02-02',
      earlyFinish: '2026-02-20',
    });
    const child = anActivity({
      id: 'k',
      code: 'K',
      name: 'Blinding',
      parentId: 'w',
      earlyStart: '2026-02-02',
      earlyFinish: '2026-02-06',
    });
    const { rerender } = render(<GanttPanel activities={[summary, child]} />);
    // Collapse the summary through its own control, then ask for the hidden child.
    // The collapse affordance is the row's chevron (aria-hidden by design — the row itself carries
    // `aria-expanded`), so it is queried out of the DOM rather than by role.
    const chevron = rowFor('Substructure').querySelector('button');
    if (chevron === null) throw new Error('no collapse control on the summary row');
    fireEvent.click(chevron);
    expect(screen.queryAllByRole('row').some((r) => r.textContent?.includes('Blinding'))).toBe(
      false,
    );
    scrollToIndex.mockClear();
    rerender(<GanttPanel activities={[summary, child]} bringIntoViewActivityId="k" />);
    expect(screen.queryAllByRole('row').some((r) => r.textContent?.includes('Blinding'))).toBe(
      true,
    );
  });
});
