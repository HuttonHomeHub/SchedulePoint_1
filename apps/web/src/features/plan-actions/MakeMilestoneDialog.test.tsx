import { act, fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import {
  FINISH_DESCRIPTION,
  MakeMilestoneDialog,
  PROJECT_FINISH_NOTE,
  type MakeMilestoneDialogProps,
} from './MakeMilestoneDialog';

/**
 * **The Make milestone dialog** (ADR-0162 decision 4, M4-T3): its options, its preselection, its
 * three states (default, pending, error) and axe over each. Focus is the caller's and is asserted in
 * the journey, because jsdom has neither a top layer nor native focus restoration.
 */
function renderDialog(over: Partial<MakeMilestoneDialogProps> = {}) {
  const props: MakeMilestoneDialogProps = {
    open: true,
    onClose: vi.fn(),
    activityName: 'Pour slab',
    reportedDate: '2026-01-12',
    defaultType: 'FINISH_MILESTONE',
    carriesProjectFinish: false,
    onConfirm: vi.fn(() => Promise.resolve()),
    ...over,
  };
  return { props, ...render(<MakeMilestoneDialog {...props} />) };
}

const confirmButton = () => screen.getByRole('button', { name: /Make milestone|Converting/ });

describe('MakeMilestoneDialog', () => {
  it('says how each option is dated, and Start names the date it keeps', () => {
    renderDialog();
    expect(screen.getByRole('radio', { name: 'Finish milestone' })).toHaveAccessibleDescription(
      FINISH_DESCRIPTION,
    );
    expect(screen.getByRole('radio', { name: 'Start milestone' })).toHaveAccessibleDescription(
      'Keeps its date, Mon 12 Jan.',
    );
  });

  it('preselects the option it is given (spec D5)', () => {
    renderDialog({ defaultType: 'START_MILESTONE' });
    expect(screen.getByRole('radio', { name: 'Start milestone' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('confirms the picked option', () => {
    const { props } = renderDialog();
    fireEvent.click(screen.getByRole('radio', { name: 'Start milestone' }));
    fireEvent.click(confirmButton());
    expect(props.onConfirm).toHaveBeenCalledExactlyOnceWith('START_MILESTONE');
  });

  it('warns about the plan’s finish only when Finish would move that label', () => {
    renderDialog({ carriesProjectFinish: true });
    expect(screen.getByText(PROJECT_FINISH_NOTE)).toBeInTheDocument();
    expect(confirmButton()).toHaveAccessibleDescription(PROJECT_FINISH_NOTE);
    fireEvent.click(screen.getByRole('radio', { name: 'Start milestone' }));
    expect(screen.queryByText(PROJECT_FINISH_NOTE)).toBeNull();
  });

  it('is pending while the save is in flight — aria-disabled, never native disabled', async () => {
    let resolve: () => void = () => {};
    const onConfirm = vi.fn(() => new Promise<void>((r) => (resolve = r)));
    renderDialog({ onConfirm });
    fireEvent.click(confirmButton());
    const button = confirmButton();
    expect(button).toHaveTextContent('Converting…');
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onConfirm).toHaveBeenCalledOnce();
    await act(async () => {
      resolve();
      await Promise.resolve();
    });
  });

  it('stays open with the error as an alert when the save fails', async () => {
    renderDialog({ onConfirm: vi.fn(() => Promise.reject(new Error('Nothing was changed.'))) });
    await act(async () => {
      fireEvent.click(confirmButton());
      await Promise.resolve();
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Nothing was changed.');
    expect(confirmButton()).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('has no axe violations in its default, pending and error states', async () => {
    const { container, unmount } = renderDialog({ carriesProjectFinish: true });
    expect((await axe(container)).violations).toEqual([]);
    unmount();

    const pending = renderDialog({ onConfirm: () => new Promise<void>(() => {}) });
    fireEvent.click(confirmButton());
    expect((await axe(pending.container)).violations).toEqual([]);
    pending.unmount();

    const failed = renderDialog({ onConfirm: () => Promise.reject(new Error('No.')) });
    await act(async () => {
      fireEvent.click(confirmButton());
      await Promise.resolve();
    });
    expect((await axe(failed.container)).violations).toEqual([]);
  });
});
