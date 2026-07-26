import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SegmentedControl } from '@/components/ui/segmented-control';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const;

function Harness({ initial = 'a' }: { initial?: 'a' | 'b' | 'c' }): React.ReactElement {
  const [value, setValue] = useState<'a' | 'b' | 'c'>(initial);
  return (
    <SegmentedControl label="Example" value={value} onChange={setValue} options={[...OPTIONS]} />
  );
}

/** The checked option is the one tab stop, so it is where a keyboard user always starts. */
function checkedOption(): HTMLElement {
  const option = screen
    .getAllByRole('radio')
    .find((el) => el.getAttribute('aria-checked') === 'true');
  if (!option) throw new Error('no option is checked');
  return option;
}

describe('SegmentedControl', () => {
  it('is a named radiogroup with one checked radio', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'Example' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Beta' })).toHaveAttribute('aria-checked', 'false');
  });

  it('exposes exactly one tab stop — the checked option (roving tabindex)', () => {
    render(<Harness initial="b" />);
    const stops = screen
      .getAllByRole('radio')
      .filter((el) => (el as HTMLButtonElement).tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]).toHaveAccessibleName('Beta');
  });

  it.each([
    ['ArrowRight', 'Beta'],
    ['ArrowDown', 'Beta'],
    ['ArrowLeft', 'Gamma'],
    ['ArrowUp', 'Gamma'],
    ['End', 'Gamma'],
  ])('%s selects %s and moves focus with it', (key, expected) => {
    render(<Harness />);
    fireEvent.keyDown(checkedOption(), { key });
    const option = screen.getByRole('radio', { name: expected });
    expect(option).toHaveAttribute('aria-checked', 'true');
    // Focus follows selection: the user is acting on the control, so leaving focus behind would
    // strand them on an option that is no longer the current one.
    expect(option).toHaveFocus();
  });

  it('wraps at both ends and Home returns to the first option', () => {
    render(<Harness initial="c" />);
    fireEvent.keyDown(checkedOption(), { key: 'ArrowRight' });
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
    fireEvent.keyDown(checkedOption(), { key: 'End' });
    fireEvent.keyDown(checkedOption(), { key: 'Home' });
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
  });

  it('ignores keys it does not own, so the toolbar above can still handle them', () => {
    render(<Harness />);
    const event = fireEvent.keyDown(checkedOption(), { key: 'Tab' });
    expect(event).toBe(true); // not prevented
    expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
  });

  it('selects on click', () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole('radio', { name: 'Gamma' }));
    expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'true');
  });
});
