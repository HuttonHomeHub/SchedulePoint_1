import { fireEvent, render, screen } from '@testing-library/react';
import { useCallback, useRef } from 'react';
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { PlanNotesSection } from './PlanNotesSection';

/**
 * The **Comments** reveal seam (toolbar quick-wins F2): `PlanNotesSection` exposes its heading via
 * `headingRef` (made programmatically focusable), and the workspace's `revealComments` guard scrolls +
 * focuses it — a safe no-op when the section is unmounted (the responsive single-pane toggle). The
 * notes data layer is irrelevant here, so its children + session are stubbed.
 */
vi.mock('./NoteThread', () => ({ NoteThread: () => <div data-testid="thread" /> }));
vi.mock('./NoteComposer', () => ({ NoteComposer: () => <div data-testid="composer" /> }));
vi.mock('@/features/auth', () => ({ useSession: () => ({ data: { user: { id: 'u1' } } }) }));

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView; the reveal guard calls it, so stub it as a no-op.
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = function scrollIntoView(): void {};
  }
});

/** A harness mirroring the workspace's F2 seam: a ref on the notes heading + the guarded reveal. */
function Harness({ mounted }: { mounted: boolean }): React.ReactElement {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const revealComments = useCallback(() => {
    const el = headingRef.current;
    el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el?.focus();
  }, []);
  return (
    <div>
      <button type="button" onClick={revealComments}>
        Comments
      </button>
      {mounted ? (
        <PlanNotesSection orgSlug="acme" planId="p1" canWrite headingRef={headingRef} />
      ) : null}
    </div>
  );
}

describe('PlanNotesSection reveal seam (toolbar quick-wins F2)', () => {
  it('makes the heading programmatically focusable and moves focus to it on reveal', () => {
    render(<Harness mounted />);
    const heading = screen.getByRole('heading', { name: 'Notes' });
    // Focusable out of the tab order (WCAG 2.4.3) — not a Tab stop, but scriptable focus.
    expect(heading).toHaveAttribute('tabindex', '-1');
    fireEvent.click(screen.getByRole('button', { name: 'Comments' }));
    expect(heading).toHaveFocus();
  });

  it('is a safe no-op when the notes section is not in the DOM', () => {
    render(<Harness mounted={false} />);
    expect(screen.queryByRole('heading', { name: 'Notes' })).not.toBeInTheDocument();
    // The guard short-circuits on the null ref — clicking must not throw.
    expect(() => fireEvent.click(screen.getByRole('button', { name: 'Comments' }))).not.toThrow();
  });
});
