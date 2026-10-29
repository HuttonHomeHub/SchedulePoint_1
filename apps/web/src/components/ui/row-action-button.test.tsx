import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { RowActionButton } from './row-action-button';

const mount = (props: Partial<React.ComponentProps<typeof RowActionButton>> = {}) => {
  const onPress = vi.fn();
  render(
    <main>
      <p id="pen">Start editing to change codes.</p>
      <RowActionButton
        label="Move L1 up"
        action="v1:up"
        icon={<span aria-hidden="true">^</span>}
        shut={false}
        describedBy={undefined}
        onPress={onPress}
        {...props}
      />
    </main>,
  );
  return { onPress, button: screen.getByRole('button', { name: 'Move L1 up' }) };
};

describe('RowActionButton', () => {
  it('is an icon button named for its row, carrying a marker a host can find it by', async () => {
    const { button, onPress } = mount();
    expect(button).toHaveAttribute('data-row-action', 'v1:up');
    fireEvent.click(button);
    expect(onPress).toHaveBeenCalledTimes(1);
    expect((await axe(document.body)).violations).toEqual([]);
  });

  it('when shut is shaded with aria-disabled, never natively disabled, stays focusable and presses nothing', () => {
    const { button, onPress } = mount({ shut: true, describedBy: 'pen' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    button.focus();
    expect(button).toHaveFocus();
    fireEvent.click(button);
    expect(onPress).not.toHaveBeenCalled();
    expect(button).toHaveAccessibleDescription('Start editing to change codes.');
  });

  it('adds its own end-of-list sentence to the description beside the pen sentence', () => {
    const { button } = mount({
      shut: true,
      describedBy: 'pen',
      endReason: 'L1 is already first.',
    });
    expect(button).toHaveAccessibleDescription(
      'Start editing to change codes. L1 is already first.',
    );
  });
});
