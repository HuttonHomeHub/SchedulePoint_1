import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import { SegmentedControl } from '@/components/ui/segmented-control';

const OPTIONS = [
  { value: 'a', label: 'Alpha' },
  { value: 'b', label: 'Beta' },
  { value: 'c', label: 'Gamma' },
] as const;

function Harness({ initial = 'a' }: { initial?: 'a' | 'b' | 'c' | null }): React.ReactElement {
  const [value, setValue] = useState<'a' | 'b' | 'c' | null>(initial);
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

  describe('with no selection yet (value={null})', () => {
    it('still has a tab stop — the first option, per the APG', () => {
      render(<Harness initial={null} />);
      const [first, ...rest] = screen.getAllByRole('radio');
      // Without this the tab stop is derived from `value === option` alone, every option gets
      // tabIndex -1, and an unanswered question is unreachable by keyboard (WCAG 2.1.1).
      expect(first).toHaveAttribute('tabindex', '0');
      expect(rest.every((el) => el.getAttribute('tabindex') === '-1')).toBe(true);
      expect(screen.queryByRole('radio', { checked: true })).toBeNull();
    });

    it('arrows into the set from both ends', () => {
      render(<Harness initial={null} />);
      fireEvent.keyDown(screen.getAllByRole('radio')[0]!, { key: 'ArrowRight' });
      expect(screen.getByRole('radio', { name: 'Alpha' })).toHaveAttribute('aria-checked', 'true');
    });

    it('ArrowLeft from no selection lands on the last option, not the second-to-last', () => {
      render(<Harness initial={null} />);
      fireEvent.keyDown(screen.getAllByRole('radio')[0]!, { key: 'ArrowLeft' });
      expect(screen.getByRole('radio', { name: 'Gamma' })).toHaveAttribute('aria-checked', 'true');
    });
  });
});
