import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { ToggleChip } from '@/components/ui/toggle-chip';

function Harness({ initial = false }: { initial?: boolean }): React.ReactElement {
  const [pressed, setPressed] = useState(initial);
  return (
    <ToggleChip pressed={pressed} onPressedChange={setPressed}>
      Critical
    </ToggleChip>
  );
}

describe('ToggleChip', () => {
  it('reports its state through aria-pressed, not through colour alone', () => {
    render(<Harness />);
    expect(screen.getByRole('button', { name: 'Critical' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('toggles on activation', () => {
    render(<Harness />);
    const chip = screen.getByRole('button', { name: 'Critical' });
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(chip);
    expect(chip).toHaveAttribute('aria-pressed', 'false');
  });

  it('is a native button, so Space/Enter come for free', () => {
    render(<Harness />);
    // Asserted structurally rather than by synthesising key events: the reason to use a real
    // <button> instead of a styled <div role="button"> is precisely that the platform supplies
    // keyboard activation, and a jsdom keyDown would not exercise that path anyway.
    expect(screen.getByRole('button', { name: 'Critical' }).tagName).toBe('BUTTON');
  });

  it('carries a fill AND a border in the pressed state', () => {
    render(<Harness initial />);
    const chip = screen.getByRole('button', { name: 'Critical' });
    // Pressed must not be signalled by hue alone (WCAG 1.4.1): the fill changes and so does
    // the border, so the chip reads as "on" without relying on colour discrimination.
    expect(chip.className).toMatch(/bg-primary/);
    expect(chip.className).toMatch(/border-primary/);
  });

  it('does not toggle when disabled', () => {
    const onPressedChange = vi.fn();
    render(
      <ToggleChip pressed={false} onPressedChange={onPressedChange} disabled>
        Chain
      </ToggleChip>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chain' }));
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('lets a consumer suppress the toggle by preventing the click', () => {
    const onPressedChange = vi.fn();
    render(
      <ToggleChip
        pressed={false}
        onPressedChange={onPressedChange}
        onClick={(event) => event.preventDefault()}
      >
        Chain
      </ToggleChip>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Chain' }));
    expect(onPressedChange).not.toHaveBeenCalled();
  });

  it('styles itself from tokens only', () => {
    render(<Harness />);
    // The rule the ESLint colour-literal check enforces at the call site, asserted here for
    // the primitive itself: no raw colour ever reaches a class name.
    expect(screen.getByRole('button').className).not.toMatch(/#[0-9a-f]{3,8}|rgb\(|oklch\(/i);
  });
});
