import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { CreateActivityPopover } from './CreateActivityPopover';

function setup(overrides: Partial<React.ComponentProps<typeof CreateActivityPopover>> = {}) {
  const onCommit = vi.fn();
  const onCancel = vi.fn();
  render(
    <CreateActivityPopover
      x={10}
      y={10}
      saving={false}
      error={null}
      onCommit={onCommit}
      onCancel={onCancel}
      {...overrides}
    />,
  );
  return { onCommit, onCancel, input: screen.getByLabelText('Name') };
}

describe('CreateActivityPopover', () => {
  it('focuses the name input on open', () => {
    const { input } = setup();
    expect(input).toHaveFocus();
  });

  it('commits the trimmed name on submit', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: '  Excavate  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add to plan' }));
    expect(onCommit).toHaveBeenCalledWith('Excavate');
  });

  /**
   * Shaded with a reason, not natively disabled (ADR-0064 T8, the `ScopeSaveBar` precedent). The
   * submit flips on the first keystroke; a natively disabled button under focus is blurred to
   * `<body>`, which is SC 2.4.3 on the happy path. It stays in the tab order and inert instead —
   * and it says WHY, linked by `aria-describedby` rather than merely sitting next to the sentence.
   */
  it('shades Add activity with its reason for an empty name, without leaving the tab order', () => {
    const { onCommit } = setup();
    const submit = screen.getByRole('button', { name: 'Add to plan' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).not.toBeDisabled();
    const reason = document.getElementById(submit.getAttribute('aria-describedby') ?? '');
    expect(reason).toHaveTextContent('Enter a name to add this activity.');
    fireEvent.click(submit);
    expect(onCommit).not.toHaveBeenCalled();
  });

  it('names the submit apart from every Add control on the same screen', () => {
    setup();
    // Two on-screen controls sharing an accessible name is ambiguous by voice and in a screen
    // reader's controls list. The canvas toolbar's split-button is "Add"; the flag-off legacy
    // toolbar's is "Add activity". This one must be neither, which is why it names the destination.
    expect(screen.queryByRole('button', { name: 'Add' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Add activity' })).not.toBeInTheDocument();
  });

  it('cancels on Escape from the input', () => {
    const { onCancel, input } = setup();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('links the error to the field and re-focuses it (aria-describedby + role=alert)', () => {
    const { input } = setup({ error: 'That name is taken' });
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('That name is taken');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAttribute('aria-describedby', alert.id);
    expect(input).toHaveFocus();
  });

  it('keeps the field and the submit focusable while saving, and says so', () => {
    setup({ saving: true });
    // `readOnly`, not `disabled`: a disabled input is removed from the tab order mid-save, taking
    // the user's focus with it — the same defect as a natively disabled Save.
    expect(screen.getByLabelText('Name')).toHaveAttribute('readonly');
    const submit = screen.getByRole('button', { name: 'Saving…' });
    expect(submit).toHaveAttribute('aria-disabled', 'true');
    expect(submit).toHaveAttribute('aria-busy', 'true');
    expect(submit).not.toBeDisabled();
  });

  it('gives the name field a VISIBLE label, not only an accessible one', () => {
    setup();
    // The field always had an `aria-label`, so axe was clean and the gap was invisible to tooling —
    // a sighted planner met a bare box whose only clue vanished on the first keystroke (WCAG 3.3.2).
    const label = screen.getByText('Name');
    expect(label.tagName).toBe('LABEL');
    expect(label).toHaveAttribute('for', screen.getByLabelText('Name').id);
  });
});

/**
 * **Cancel must not lie while a create is in flight** (ADR-0064 enablement review, ux + component
 * both raised it). The submit was correctly moved off the native `disabled` attribute with a click
 * guard and shading; Cancel got the `aria-disabled` attribute alone — announcing "unavailable" to a
 * screen-reader user while staying fully lit and fully clickable for everyone else.
 *
 * The consequence was not cosmetic. `onCancel` closes the popover but cannot abort the in-flight
 * `onCreate` promise, so a Cancel that "worked" would close the popover and then let the activity
 * appear anyway.
 */
describe('CreateActivityPopover — Cancel during a save', () => {
  it('does not cancel on click while saving', () => {
    const onCancel = vi.fn();
    setup({ saving: true, onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('does not cancel on Escape while saving', () => {
    // The input is `readOnly` rather than `disabled` (to keep focus), which re-opened this route:
    // a natively disabled input dispatches no keydown at all.
    const onCancel = vi.fn();
    setup({ saving: true, onCancel });
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('still cancels both ways when nothing is in flight', () => {
    const onCancel = vi.fn();
    setup({ saving: false, onCancel });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledOnce();
    fireEvent.keyDown(screen.getByLabelText('Name'), { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(2);
  });
});
