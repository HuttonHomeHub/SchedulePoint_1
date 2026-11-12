import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FollowLogicStrip } from './FollowLogicStrip';

const MESSAGE = '“Pour slab” stays where you placed it, before its logic allows.';

function setup(props: Partial<React.ComponentProps<typeof FollowLogicStrip>> = {}) {
  const calls: string[] = [];
  const onFollow = vi.fn(() => calls.push('follow'));
  const onKeep = vi.fn(() => calls.push('keep'));
  const onUndo = vi.fn(() => calls.push('undo'));
  const restoreTarget = vi.fn(() => {
    calls.push('focus');
    return null;
  });
  const view = render(
    <FollowLogicStrip
      message={MESSAGE}
      onFollow={onFollow}
      onKeep={onKeep}
      restoreTarget={restoreTarget}
      {...props}
      {...(props.onUndo === undefined ? {} : { onUndo })}
    />,
  );
  return { ...view, calls, onFollow, onKeep, onUndo, restoreTarget };
}

describe('FollowLogicStrip', () => {
  it('says the sentence and offers both choices, with no role: the workspace announced it once', () => {
    const { container } = setup();
    const strip = screen.getByTestId('canvas-follow-logic-offer');
    // **Verified red** by adding `role="status"`: the sentence is then spoken twice, once by the
    // workspace's polite region at the moment it was raised and once as the strip mounts (ADR-0132).
    expect(strip).not.toHaveAttribute('role');
    expect(container.querySelector('[role]')).toBeNull();
    expect(screen.getByText(MESSAGE).tagName).toBe('P');
    expect(screen.getByRole('button', { name: 'Follow logic' })).toBe(
      screen.getByTestId('canvas-follow-logic'),
    );
    expect(screen.getByRole('button', { name: 'Keep it here' })).toBeInTheDocument();
  });

  it('marks itself a dock row that wraps, so the sentence is never cut', () => {
    setup();
    const strip = screen.getByTestId('canvas-follow-logic-offer');
    expect(strip).toHaveAttribute('data-dock-row');
    expect(strip).toHaveClass('flex-wrap', 'min-w-0');
    expect(screen.getByText(MESSAGE)).not.toHaveClass('truncate');
  });

  it('has no timer: it is still there long after it was raised (WCAG 2.2.1)', () => {
    vi.useFakeTimers();
    try {
      setup();
      vi.advanceTimersByTime(10 * 60_000);
      expect(screen.getByTestId('canvas-follow-logic-offer')).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('moves focus to its stable target BEFORE Follow logic acts', () => {
    const { calls } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Follow logic' }));
    // Every button removes the strip that holds it, so focus must already be somewhere that survives.
    expect(calls).toEqual(['focus', 'follow']);
  });

  it('moves focus first for Keep it here too, and writes nothing', () => {
    const { calls, onFollow } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it here' }));
    expect(calls).toEqual(['focus', 'keep']);
    expect(onFollow).not.toHaveBeenCalled();
  });

  it('carries the link confirmation: its sentence leads, and the link’s Undo stays beside Follow logic', () => {
    const { calls } = setup({
      lead: 'Linked “Excavate” → “Pour slab” (FS).',
      onUndo: () => undefined,
    });
    expect(
      screen.getByText(`Linked “Excavate” → “Pour slab” (FS). ${MESSAGE}`),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Undo',
      'Follow logic',
      'Keep it here',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(calls).toEqual(['focus', 'undo']);
  });

  it('shows no Undo of its own when there is no confirmation to carry', () => {
    setup();
    expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
  });

  it('shades Follow logic with its reason printed and described, and a press does nothing', () => {
    const { calls, onFollow } = setup({
      followReason: 'Turn off the Late-start overlay to clear the placement',
    });
    const follow = screen.getByRole('button', { name: 'Follow logic' });
    expect(follow).toHaveAttribute('aria-disabled', 'true');
    // The reason is visible text in the strip (a finger has no hover) and the button's description.
    const reason = screen.getByText('Turn off the Late-start overlay to clear the placement');
    expect(follow).toHaveAttribute('aria-describedby', reason.id);
    fireEvent.click(follow);
    expect(onFollow).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
    // Keep it here is not shaded: declining is always available.
    expect(screen.getByRole('button', { name: 'Keep it here' })).not.toHaveAttribute(
      'aria-disabled',
    );
  });

  it('is not described, and not shaded, when nothing shuts it', () => {
    setup();
    const follow = screen.getByRole('button', { name: 'Follow logic' });
    expect(follow).not.toHaveAttribute('aria-describedby');
    expect(follow).toHaveAttribute('aria-disabled', 'false');
  });
});
