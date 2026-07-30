import type { ActivitySummary } from '@repo/types';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * The **rollback contract** for the printed programme: with `VITE_WBS_IMPROVEMENTS` off there is no
 * derived bucket on paper, exactly as there is none on screen. Pinned by mocking the flag rather
 * than relying on its default, so this suite still describes the flag-off document on the day the
 * flag flips default-on.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  WBS_IMPROVEMENTS_ENABLED: false,
}));

import { GanttPrintSurface } from './GanttPrintSurface';

import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES: ActivitySummary[] = [
  anActivity({
    id: 'sum',
    code: 'S1',
    name: 'Substructure',
    type: 'WBS_SUMMARY',
    earlyStart: '2026-01-01',
    earlyFinish: '2026-03-31',
  }),
  anActivity({
    id: 'l1',
    code: 'A2',
    name: 'Loose end',
    earlyStart: '2026-02-02',
    earlyFinish: '2026-02-06',
  }),
];

describe('GanttPrintSurface — VITE_WBS_IMPROVEMENTS off (print parity)', () => {
  it('prints no bucket row, but still prints the unfiled work', () => {
    const { container } = render(
      <GanttPrintSurface title="North Tower" subtitle="As of 2026-01-01" activities={ACTIVITIES} />,
    );
    expect(container.textContent).not.toContain('Unassigned');
    // The work itself never depends on the flag — only where it is filed.
    expect(container.textContent).toContain('Loose end');
  });
});
