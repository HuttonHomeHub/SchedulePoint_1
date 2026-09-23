import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { LayoutObjective } from '../render/layout-objective';

import { ArrangeDialog } from './ArrangeDialog';
import type { ArrangeOutcome, ArrangeSearchState } from './use-arrange-search';

/**
 * **The Arrange dialog, one state at a time** (NetPoint-layout M5). The search is passed in, so every
 * state is set directly; that the real search produces these states is the journey's half.
 */
const obj = (over: Partial<LayoutObjective> = {}): LayoutObjective => ({
  overlaps: 0,
  occluded: 0,
  crossings: 0,
  contacts: 0,
  sameRow: 0,
  travel: 0,
  rows: 5,
  ...over,
});

const TIDY: ArrangeOutcome = {
  changes: [
    { id: 'a', laneIndex: 1 },
    { id: 'b', laneIndex: 0 },
  ],
  before: obj({ occluded: 58, crossings: 360, rows: 21 }),
  after: obj({ occluded: 17, crossings: 204, rows: 21 }),
};
const RELAYOUT: ArrangeOutcome = {
  changes: [{ id: 'c', laneIndex: 3 }],
  before: obj({ occluded: 58, crossings: 360, rows: 21 }),
  after: obj({ occluded: 30, crossings: 250, rows: 19 }),
};
const READY: ArrangeSearchState = { kind: 'ready', tidy: TIDY, relayout: RELAYOUT, bounded: null };

function renderDialog(search: ArrangeSearchState, onConfirm = vi.fn(), pending = false) {
  render(
    <ArrangeDialog
      open
      onClose={() => undefined}
      search={search}
      onConfirm={onConfirm}
      pending={pending}
      error={null}
    />,
  );
  return onConfirm;
}

const confirmButton = (): HTMLElement =>
  screen.getByRole('button', { name: /^(Tidy|Re-layout|Arranging)/ });

describe('ArrangeDialog', () => {
  it('while computing, says so politely and shades Confirm with the reason linked', () => {
    const onConfirm = renderDialog({ kind: 'computing', evaluations: 50 });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Working out the layouts… 50 layouts tried.',
    );
    const confirm = confirmButton();
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).not.toHaveAttribute('disabled');
    expect(confirm).toHaveAccessibleDescription('Working out the layouts.');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('when ready, preselects Tidy, shows each option’s figures, and confirms the selected one', () => {
    const onConfirm = renderDialog(READY);
    const tidy = screen.getByRole('radio', { name: 'Tidy' });
    expect(tidy).toHaveAttribute('aria-checked', 'true');
    expect(tidy).toHaveAccessibleDescription(/Links behind bars\s*58 → 17/);
    expect(tidy).toHaveAccessibleDescription(/Crossings\s*360 → 204/);
    expect(tidy).toHaveAccessibleDescription(/Rows\s*21/);
    expect(screen.getByRole('radio', { name: 'Re-layout' })).toHaveAccessibleDescription(
      /Rows\s*21 → 19/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tidy: move 2 activities' }));
    expect(onConfirm).toHaveBeenCalledWith('tidy', TIDY);
  });

  it('confirms Re-layout once it is chosen', () => {
    const onConfirm = renderDialog(READY);
    fireEvent.click(screen.getByRole('radio', { name: 'Re-layout' }));
    fireEvent.click(screen.getByRole('button', { name: 'Re-layout: move 1 activity' }));
    expect(onConfirm).toHaveBeenCalledWith('relayout', RELAYOUT);
  });

  it('shades Confirm with a reason when the chosen option would move nothing', () => {
    const onConfirm = renderDialog({
      ...READY,
      tidy: { ...TIDY, changes: [], after: TIDY.before },
    });
    const confirm = confirmButton();
    expect(confirm).toHaveAttribute('aria-disabled', 'true');
    expect(confirm).toHaveAccessibleDescription('Nothing would move.');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('says once that the diagram is already arranged when neither option would move anything', () => {
    renderDialog({
      kind: 'ready',
      tidy: { ...TIDY, changes: [], after: TIDY.before },
      relayout: { ...RELAYOUT, changes: [], after: RELAYOUT.before },
      bounded: null,
    });
    expect(screen.getByRole('status')).toHaveTextContent(
      'Already arranged: neither option would move anything.',
    );
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('when bounded, shades Tidy with the reason and preselects Re-layout', () => {
    renderDialog({
      kind: 'ready',
      tidy: null,
      relayout: RELAYOUT,
      bounded: { drawn: 450, limit: 300 },
    });
    const tidy = screen.getByRole('radio', { name: 'Tidy' });
    expect(tidy).toHaveAttribute('aria-disabled', 'true');
    expect(tidy).toHaveAttribute('aria-checked', 'false');
    expect(tidy).toHaveAccessibleDescription(/draws 450 activities.*up to 300/);
    expect(screen.getByRole('radio', { name: 'Re-layout' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Re-layout: move 1 activity' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('reports a failed search as an alert, with Confirm shaded', () => {
    renderDialog({ kind: 'error', message: 'The worker stopped.' });
    expect(screen.getByRole('alert')).toHaveTextContent('The worker stopped.');
    expect(confirmButton()).toHaveAttribute('aria-disabled', 'true');
  });

  it('says it is arranging while the write is in flight, and does not confirm twice', () => {
    const onConfirm = renderDialog(READY, vi.fn(), true);
    const confirm = screen.getByRole('button', { name: 'Arranging…' });
    expect(confirm).toHaveAttribute('aria-busy', 'true');
    fireEvent.click(confirm);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
