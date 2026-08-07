import type { ActivitySummary } from '@repo/types';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

/**
 * Canvas status & feedback M1, US-2: the data date **stated in text**, so the marker a
 * screen-reader user cannot see is still a fact they have (WCAG 1.4.1). The sentence is linked to
 * the activities listbox with `aria-describedby` — a landmark-navigating reader lands INSIDE the
 * region and never passes a preceding paragraph (the ADR-0073 C2.5 finding) — and is deliberately
 * NOT a live region: it is a standing fact, and re-announcing it on every re-render is noise.
 * Today is named only when it differs from the data date, so absence is distinguishable from a
 * fact. Flag forced ON (default-off until M6); the flag-off parity is
 * `TsldPanel.data-date-off.test.tsx`.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_DATA_DATE_ENABLED: true,
}));

vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => vi.fn() }));

import { TsldPanel } from './TsldPanel';

import { anActivity } from '@/test/activity-fixture';

const ACTIVITIES: ActivitySummary[] = [
  anActivity({ id: 'a1', name: 'Survey', earlyStart: '2026-01-01', earlyFinish: '2026-01-03' }),
];

describe('TsldPanel — the spoken data-date statement (flag on)', () => {
  it('states the data date AND today when they differ, linked to the listbox via aria-describedby', () => {
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={[]}
        dataDate="2026-01-01"
        todayIso="2026-01-15"
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    const describedBy = listbox.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const sentence = document.getElementById(describedBy!);
    expect(sentence).not.toBeNull();
    expect(sentence).toHaveTextContent('Data date 01 Jan 2026. Today is 15 Jan 2026.');
  });

  it('names ONLY the data date when today is the same day — absence a reader can distinguish from a fact', () => {
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={[]}
        dataDate="2026-01-01"
        todayIso="2026-01-01"
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    const sentence = document.getElementById(listbox.getAttribute('aria-describedby')!);
    expect(sentence).toHaveTextContent('Data date 01 Jan 2026.');
    expect(sentence?.textContent).not.toContain('Today');
  });

  it('is NOT a live region — a standing fact, never re-announced', () => {
    render(
      <TsldPanel
        activities={ACTIVITIES}
        dependencies={[]}
        dataDate="2026-01-01"
        todayIso="2026-01-15"
      />,
    );
    const listbox = screen.getByRole('listbox', { name: 'Activities in the diagram' });
    const sentence = document.getElementById(listbox.getAttribute('aria-describedby')!);
    expect(sentence).not.toHaveAttribute('aria-live');
    expect(sentence).not.toHaveAttribute('role');
  });
});
