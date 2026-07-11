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
  return { onCommit, onCancel, input: screen.getByLabelText('New activity name') };
}

describe('CreateActivityPopover', () => {
  it('focuses the name input on open', () => {
    const { input } = setup();
    expect(input).toHaveFocus();
  });

  it('commits the trimmed name on submit', () => {
    const { onCommit, input } = setup();
    fireEvent.change(input, { target: { value: '  Excavate  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    expect(onCommit).toHaveBeenCalledWith('Excavate');
  });

  it('disables Add for an empty name', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
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

  it('disables the field and shows Saving… while saving', () => {
    setup({ saving: true });
    expect(screen.getByLabelText('New activity name')).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Saving…' })).toBeDisabled();
  });
});
