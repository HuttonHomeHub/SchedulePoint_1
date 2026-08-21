import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * **The a11y-layer invariant, pinned for the minimap** (ADR-0100 AC-6.1, M2-T5): the set —
 * count AND identity — of AT-reachable activities is unchanged with the minimap open.
 *
 * Set equality, not a count (`TsldPanel.wbs-band.test.tsx` is the shipped precedent): the
 * parallel listbox is built from `activities`, never from what the canvas paints
 * (`render/a11y.ts`), and the minimap must not mirror activities into minimap-scoped DOM —
 * the exact draft ADR-0063 rejected for the WBS band. Verified RED against a deliberate
 * violation (a per-activity element rendered inside the panel picked up `option` semantics
 * and the set grew).
 */
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES: ActivitySummary[] = [
  anActivity({
    id: 'a1',
    name: 'Piling',
    laneIndex: 0,
    earlyStart: '2026-01-02',
    earlyFinish: '2026-01-20',
  }),
  anActivity({
    id: 'a2',
    name: 'Pile caps',
    laneIndex: 1,
    earlyStart: '2026-01-21',
    earlyFinish: '2026-02-10',
  }),
];

function Harness({ minimap }: { minimap: boolean }): React.ReactElement {
  return (
    <TsldPanel
      activities={ACTIVITIES}
      dependencies={[]}
      dataDate="2026-01-01"
      minimapActive={minimap}
      onMinimapClose={() => {}}
    />
  );
}

const optionIds = (): string[] =>
  screen
    .getAllByRole('option')
    .map((o) => o.getAttribute('data-activity-id') ?? o.textContent ?? '');

describe('TsldPanel — navigating is a read (M3-T5c)', () => {
  it('a read-only reader (Viewer / External Guest shape) gets a working minimap', () => {
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={[]}
        dataDate="2026-01-01"
        canEdit={false}
        minimapActive
        onMinimapClose={() => {}}
      />,
    );
    // The panel mounts, and its primary gesture surface (the drag pad) is present — not
    // pen-gated, no recalculation hold: the minimap writes nothing (ADR-0063 M4b/ADR-0080).
    expect(screen.getByRole('group', { name: 'Diagram overview' })).toBeInTheDocument();
    expect(screen.getByTestId('tsld-minimap-rect-pad')).toBeInTheDocument();
  });
});

describe('TsldPanel — the minimap does not touch the a11y layer', () => {
  it('keeps the AT-reachable activity set identical across the minimap toggle (set equality)', () => {
    const { rerender } = render(<Harness minimap={false} />);
    const before = optionIds();
    expect(before.length).toBeGreaterThan(0);

    rerender(<Harness minimap />);
    expect(screen.getByRole('group', { name: 'Diagram overview' })).toBeInTheDocument();
    expect(optionIds()).toEqual(before);
  });
});
