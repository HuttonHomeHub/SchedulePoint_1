import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ChainCandidate, ChainRefusal } from '../model/chain-order';

import { LinkChainDialog } from './LinkChainDialog';

/**
 * The Link in sequence preview, in the three states M7 distinguishes: a fresh chain, a half-made one
 * (only the missing links are written, and the preview says how many already exist) and one that is
 * already complete (the button stays pressable on the bar, and the preview says there is nothing to add).
 */
const ordered: ChainCandidate[] = [
  { id: 'a', name: 'Excavate', start: '2026-01-05' },
  { id: 'b', name: 'Pour slab', start: '2026-01-07' },
  { id: 'c', name: 'Cure', start: '2026-01-09' },
];

const onConfirm = vi.fn();

function renderDialog(over: { existingCount?: number; refusal?: ChainRefusal | null } = {}) {
  onConfirm.mockClear();
  return render(
    <LinkChainDialog
      open
      onClose={vi.fn()}
      ordered={ordered}
      existingCount={over.existingCount ?? 0}
      refusal={over.refusal ?? null}
      reversed={false}
      onToggleReverse={vi.fn()}
      onConfirm={onConfirm}
      pending={false}
      error={null}
    />,
  );
}

describe('a fresh chain', () => {
  it('says how many links it will create and creates them', () => {
    renderDialog();
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'This will create 2 finish-to-start links, in the order shown.',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create 2 links' }));
    expect(onConfirm).toHaveBeenCalledOnce();
  });
});

describe('a half-made chain', () => {
  it('says how many it will add and how many already exist, and offers only the missing', () => {
    renderDialog({ existingCount: 1 });
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription(
      'This will create 1 finish-to-start link, in the order shown. 1 pair is already linked and will be left as it is.',
    );
    expect(screen.getByRole('button', { name: 'Create 1 link' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('a chain that is already linked', () => {
  it('says so plainly, and shades Create with that reason', () => {
    renderDialog({ existingCount: 2, refusal: { kind: 'alreadyLinked' } });
    // A standing fact, not a failure (ADR-0132): the polite region, never an alert.
    expect(screen.queryByRole('alert')).toBeNull();
    const alert = screen.getByRole('status');
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('There is nothing to create.');
    expect(alert).toHaveTextContent(
      'These 3 activities are already linked in this order. Nothing to add.',
    );
    // Read whole: a truncated "Nothing…" was what the first journey run showed in a 1024 px dialog.
    expect(alert.querySelector('p')).not.toHaveClass('truncate');
    const create = screen.getByRole('button', { name: 'Create 0 links' });
    expect(create).toHaveAttribute('aria-disabled', 'true');
    expect(create).toHaveAttribute('aria-describedby', alert.id);
    fireEvent.click(create);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('keeps a real refusal an alert, with the review-the-order description', () => {
    renderDialog({ existingCount: 0, refusal: { kind: 'cycle' } });
    expect(screen.getByRole('alert')).toHaveTextContent(/circular dependency/);
    expect(screen.getByRole('dialog')).toHaveAccessibleDescription('Review the order below.');
  });

  it('keeps the order on screen, and Reverse and Cancel live', () => {
    renderDialog({ existingCount: 2, refusal: { kind: 'alreadyLinked' } });
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect(screen.getByRole('button', { name: /reverse the order/i })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeEnabled();
  });
});
