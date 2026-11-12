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

  it('does NOT move focus when Follow logic is pressed: the strip stays up while it works', () => {
    // A failed write leaves the planner where they pressed. When the strip is replaced by the
    // confirmation the container hand-off (ADR-0135) is what puts focus on the plan surface.
    const { calls } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Follow logic' }));
    expect(calls).toEqual(['follow']);
  });

  it('moves focus first for Keep it here, which removes the strip at once, and writes nothing', () => {
    const { calls, onFollow } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it here' }));
    expect(calls).toEqual(['focus', 'keep']);
    expect(onFollow).not.toHaveBeenCalled();
  });

  it('carries the link confirmation joined with “— but”, and the link’s Undo is labelled Undo link', () => {
    const { calls } = setup({
      lead: 'Linked “Excavate” → “Pour slab” (FS).',
      onUndo: () => undefined,
    });
    expect(
      screen.getByText(
        'Linked “Excavate” → “Pour slab” (FS) — but “Pour slab” stays where you placed it, before its logic allows.',
      ),
    ).toBeInTheDocument();
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual([
      'Undo link',
      'Follow logic',
      'Keep it here',
    ]);
    fireEvent.click(screen.getByRole('button', { name: 'Undo link' }));
    expect(calls).toEqual(['focus', 'undo']);
  });

  it('says it is on screen once, to the host that announces it', () => {
    const onShown = vi.fn();
    const { rerender } = setup({ onShown });
    expect(onShown).toHaveBeenCalledTimes(1);
    // A re-render with the same callback (a busy line, a failure) says nothing more.
    rerender(
      <FollowLogicStrip
        message="Moving “Pour slab”…"
        phase="busy"
        onShown={onShown}
        onFollow={vi.fn()}
        onKeep={vi.fn()}
        restoreTarget={() => null}
      />,
    );
    expect(onShown).toHaveBeenCalledTimes(1);
  });

  it('describes what each choice does, to a screen reader, and not by title alone', () => {
    setup();
    const follow = screen.getByRole('button', { name: 'Follow logic' });
    const keep = screen.getByRole('button', { name: 'Keep it here' });
    expect(follow).toHaveAccessibleDescription(
      'Removes the hand placement, so the bar moves to where its logic puts it and follows it from then on.',
    );
    expect(keep).toHaveAccessibleDescription(
      'Leaves the bar where you placed it. It stays flagged as placed before its logic allows.',
    );
    expect(follow).not.toHaveAttribute('title');
  });

  it('is BUSY while the write runs: says so, both buttons aria-disabled, presses ignored, nothing native-disabled', () => {
    // **Verified red** by dropping the busy guard: a second press starts a second write (B2).
    const { onFollow, onKeep, calls } = setup({ message: 'Moving “Pour slab”…', phase: 'busy' });
    expect(screen.getByText('Moving “Pour slab”…')).toBeInTheDocument();
    const follow = screen.getByRole('button', { name: 'Follow logic' });
    const keep = screen.getByRole('button', { name: 'Keep it here' });
    for (const button of [follow, keep]) {
      expect(button).toHaveAttribute('aria-disabled', 'true');
      expect(button).not.toBeDisabled();
      fireEvent.click(button);
    }
    expect(onFollow).not.toHaveBeenCalled();
    expect(onKeep).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('after a failure says why in the strip and offers Try again, which presses Follow logic again', () => {
    const { onFollow } = setup({
      message: 'Couldn’t move “Pour slab” just now. Nothing was changed.',
      phase: 'failed',
    });
    expect(
      screen.getByText('Couldn’t move “Pour slab” just now. Nothing was changed.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Follow logic' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onFollow).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Keep it here' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
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
      'true',
    );
  });

  it('is not shaded, and described by what it does rather than a reason, when nothing shuts it', () => {
    setup();
    const follow = screen.getByRole('button', { name: 'Follow logic' });
    expect(follow).toHaveAttribute('aria-disabled', 'false');
    expect(follow).not.toHaveAccessibleDescription(/Late-start/);
  });

  it('prints the shading reason and wires it in EVERY phase, including Try again after a failure', () => {
    // **Verified red** by restoring the idle-only condition: the failed strip then shades Try again
    // with the overlay and prints no reason to a mouse, a keyboard or a finger (ADR-0204).
    const { onFollow } = setup({
      message: 'Couldn’t move “Pour slab” just now. Nothing was changed.',
      phase: 'failed',
      followReason: 'Turn off the Late-start overlay to clear the placement',
    });
    const retry = screen.getByRole('button', { name: 'Try again' });
    expect(retry).toHaveAttribute('aria-disabled', 'true');
    const reason = screen.getByText('Turn off the Late-start overlay to clear the placement');
    expect(retry).toHaveAttribute('aria-describedby', reason.id);
    fireEvent.click(retry);
    expect(onFollow).not.toHaveBeenCalled();
  });
});

describe('FollowLogicStrip — the whole-plan variant', () => {
  const PLAN_MESSAGE = '3 bars stay where they were placed, before their logic allows.';

  function plan(props: Partial<React.ComponentProps<typeof FollowLogicStrip>> = {}) {
    const onFollow = vi.fn();
    const onKeep = vi.fn();
    const restoreTarget = vi.fn(() => null);
    const view = render(
      <FollowLogicStrip
        variant="plan"
        message={PLAN_MESSAGE}
        onFollow={onFollow}
        onKeep={onKeep}
        restoreTarget={restoreTarget}
        {...props}
      />,
    );
    return { ...view, onFollow, onKeep, restoreTarget };
  }

  it('is its own entry point: Follow logic and Dismiss, no role, a dashed standing offer', () => {
    const { container } = plan();
    const strip = screen.getByTestId('canvas-follow-logic-plan-offer');
    expect(strip).not.toHaveAttribute('role');
    expect(container.querySelector('[role]')).toBeNull();
    expect(strip).toHaveAttribute('data-dock-row');
    expect(strip).toHaveClass('border-dashed');
    expect(screen.getByRole('button', { name: 'Follow logic' })).toBe(
      screen.getByTestId('canvas-follow-logic-plan'),
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Keep it here' })).toBeNull();
    expect(screen.queryByTestId('canvas-follow-logic-offer')).toBeNull();
  });

  it('describes what each choice does for every bar the count names', () => {
    plan();
    expect(screen.getByRole('button', { name: 'Follow logic' })).toHaveAccessibleDescription(
      'Removes the hand placement from every bar counted here, so each moves to where its logic puts it and follows it from then on.',
    );
    expect(screen.getByRole('button', { name: 'Dismiss' })).toHaveAccessibleDescription(
      'Hides this offer for this plan until you reopen it. The bars stay flagged.',
    );
  });

  it('moves focus first for Dismiss, which removes the strip, and writes nothing', () => {
    const { onFollow, onKeep, restoreTarget } = plan();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(restoreTarget).toHaveBeenCalled();
    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onFollow).not.toHaveBeenCalled();
  });

  it('is busy, then offers Try again after a failure, as the edit variant does', () => {
    const { onFollow, rerender } = plan({ phase: 'busy', message: 'Moving “A” and 2 others…' });
    const follow = screen.getByTestId('canvas-follow-logic-plan');
    expect(follow).toHaveAttribute('aria-disabled', 'true');
    fireEvent.click(follow);
    expect(onFollow).not.toHaveBeenCalled();
    rerender(
      <FollowLogicStrip
        variant="plan"
        phase="failed"
        message="Couldn’t move “A” and 2 others just now. Nothing was changed."
        onFollow={onFollow}
        onKeep={vi.fn()}
        restoreTarget={() => null}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onFollow).toHaveBeenCalledTimes(1);
  });

  it('shades Follow logic with its reason printed and described, and Dismiss stays open', () => {
    const { onFollow } = plan({ followReason: 'Too many to follow at once.' });
    const follow = screen.getByTestId('canvas-follow-logic-plan');
    expect(follow).toHaveAttribute('aria-disabled', 'true');
    expect(follow).toHaveAttribute(
      'aria-describedby',
      screen.getByText('Too many to follow at once.').id,
    );
    fireEvent.click(follow);
    expect(onFollow).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Dismiss' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });
});
