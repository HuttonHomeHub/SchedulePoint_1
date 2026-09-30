import { render, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useLateOverlayAnnouncement } from './use-late-overlay-announcement';

const announceSpy = vi.fn();
vi.mock('@/components/ui/announcer', () => ({ useAnnounce: () => announceSpy }));

/**
 * The host owns the overlay toggle, so the announcement is independent of which view (diagram or
 * Gantt) is mounted beneath it (#417). The two hosts below model exactly that: the same hook in the
 * same component, with a different child mounted.
 */
function Host({ late, view }: { late: boolean; view: 'diagram' | 'gantt' }) {
  useLateOverlayAnnouncement(late);
  return <div data-testid={view} />;
}

beforeEach(() => announceSpy.mockClear());

describe('switching the Late overlay is announced by the host', () => {
  it.each(['diagram', 'gantt'] as const)('speaks each switch in the %s view', (view) => {
    const { rerender } = render(<Host late={false} view={view} />);
    expect(announceSpy).not.toHaveBeenCalled();
    rerender(<Host late view={view} />);
    expect(announceSpy.mock.calls).toEqual([['Late dates shown.']]);
    rerender(<Host late={false} view={view} />);
    expect(announceSpy.mock.calls).toEqual([['Late dates shown.'], ['Placed dates shown.']]);
  });

  it('says nothing when only the view changes', () => {
    const { rerender } = render(<Host late view="diagram" />);
    rerender(<Host late view="gantt" />);
    expect(announceSpy).not.toHaveBeenCalled();
  });

  it('says nothing on mount, whichever way the overlay starts', () => {
    renderHook(() => useLateOverlayAnnouncement(true));
    renderHook(() => useLateOverlayAnnouncement(false));
    expect(announceSpy).not.toHaveBeenCalled();
  });
});
