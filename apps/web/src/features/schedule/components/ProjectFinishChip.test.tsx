import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const summary = vi.hoisted(() => ({ current: {} }));
// The component imports the hook from `../api/use-schedule`, so that is the module to intercept —
// mocking the feature barrel leaves the real hook in place and the render throws on a missing query
// client. Established by reading the import, after the first draft mocked the barrel and all three
// cases failed identically.
vi.mock('../api/use-schedule', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  useScheduleSummary: () => summary.current,
}));

import { ProjectFinishChip } from './ProjectFinishChip';

/**
 * **`ProjectFinishChip`'s three branches** (ADR-0090 M5, component gate). The component was
 * extracted in M2-T3 with no co-located test; only the rendered-value branch was covered, and only
 * indirectly, through `plan-workspace-toolbar.test.tsx`.
 *
 * The branch that most needs pinning is the **absent** one. This read-out moved off the toolbar into
 * the plan header precisely so it could withhold itself until the plan has been calculated — the
 * ADR-0061 `ContextStrip` rule, that a row of em dashes reads as breakage rather than as "not yet".
 * A regression there paints an empty chip on every fresh plan and looks like a broken header.
 */
describe('ProjectFinishChip', () => {
  it('holds the slot with a placeholder while the summary is loading', () => {
    // **Not** nothing, and the difference is deliberate: the component's own docblock says the slot
    // must not flicker in and out. The first draft of this test asserted an empty DOM, which is what
    // the *next* case does — written from an assumption about the component rather than from it.
    summary.current = { data: undefined, isPending: true };
    render(<ProjectFinishChip orgSlug="acme" planId="p1" />);
    expect(screen.getByText('Finish …')).toBeInTheDocument();
  });

  it('renders nothing when the plan has never been calculated', () => {
    // The load-bearing case: absent, not an em dash. A fresh plan's header shows no Finish at all.
    summary.current = { data: { projectFinish: null }, isPending: false };
    const { container } = render(<ProjectFinishChip orgSlug="acme" planId="p1" />);
    expect(container).toBeEmptyDOMElement();
  });

  it('names the figure once there is one', () => {
    summary.current = { data: { projectFinish: '2026-08-01' }, isPending: false };
    render(<ProjectFinishChip orgSlug="acme" planId="p1" />);
    // The label is what makes a bare date legible — it is the reason this is a chip and not a span.
    expect(screen.getByText('Finish')).toBeInTheDocument();
  });
});
