import type { AuditEvent } from '@repo/types';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuditEventList } from './AuditEventList';

/**
 * What the live region says (WCAG 4.1.3 Status Messages).
 *
 * This file exists because the announcement said **"Showing 0 events" for both empty states** — the
 * same six words whether the log is genuinely empty or a filter matched nothing. The visual copy
 * distinguished them, which is what made the gap invisible: the whole point of ADR-0073's two empty
 * states, honoured on screen and collapsed in the one channel a screen-reader user has.
 */
type SettledQuery = UseInfiniteQueryResult<{
  pages: { events: AuditEvent[]; nextCursor: string | null }[];
}>;

function settled(events: AuditEvent[]): SettledQuery {
  return {
    data: { pages: [{ events, nextCursor: null }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: () => undefined,
  } as unknown as SettledQuery;
}

/** One row, only as complete as the columns under test read. */
function event(overrides: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id: '1',
    occurredAt: '2026-08-04T10:00:00.000Z',
    action: 'plan.deleted',
    outcome: 'SUCCESS',
    actorType: 'USER',
    actorLabel: 'a@b.c',
    subjectType: 'PLAN',
    subjectLabel: 'P',
    ...overrides,
  } as AuditEvent;
}

const EMPTY = 'Nothing here yet.';
const EMPTY_FILTERED = 'No events match this filter.';

function liveRegionText(): string {
  // The polite region is the only sr-only live element this component renders.
  const region = document.querySelector('[aria-live="polite"]');
  return region?.textContent ?? '';
}

describe('AuditEventList announcements (ADR-0073 C1)', () => {
  it('announces the UNFILTERED empty sentence when the log is genuinely empty', () => {
    render(<AuditEventList query={settled([])} caption="Log" showActor emptyMessage={EMPTY} />);
    expect(liveRegionText()).toBe(EMPTY);
  });

  it('announces the FILTERED empty sentence when a filter matched nothing', () => {
    render(
      <AuditEventList
        query={settled([])}
        caption="Log"
        showActor
        emptyMessage={EMPTY}
        emptyFilteredMessage={EMPTY_FILTERED}
      />,
    );
    expect(liveRegionText()).toBe(EMPTY_FILTERED);
  });

  it('never announces the two empty states with the same words', () => {
    // The regression itself, stated directly rather than implied by the two tests above.
    const { unmount } = render(
      <AuditEventList query={settled([])} caption="Log" showActor emptyMessage={EMPTY} />,
    );
    const unfiltered = liveRegionText();
    unmount();

    render(
      <AuditEventList
        query={settled([])}
        caption="Log"
        showActor
        emptyMessage={EMPTY}
        emptyFilteredMessage={EMPTY_FILTERED}
      />,
    );
    expect(liveRegionText()).not.toBe(unfiltered);
  });

  it('offers the way out inside the filtered empty state, not only above the table', () => {
    render(
      <AuditEventList
        query={settled([])}
        caption="Log"
        showActor
        emptyMessage={EMPTY}
        emptyFilteredMessage={EMPTY_FILTERED}
        onClearFilter={() => undefined}
      />,
    );
    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('still announces the count when there are rows', () => {
    render(
      <AuditEventList
        query={settled([event(), event({ id: '2' })])}
        caption="Log"
        showActor
        emptyMessage={EMPTY}
      />,
    );
    expect(liveRegionText()).toBe('Showing 2 events');
  });

  it('counts a single row in the singular', () => {
    // "Showing 1 events" is what the region said, and a live region is read aloud — the one place
    // a grammatical slip is heard rather than skimmed past.
    render(
      <AuditEventList query={settled([event()])} caption="Log" showActor emptyMessage={EMPTY} />,
    );
    expect(liveRegionText()).toBe('Showing 1 event');
  });
});
