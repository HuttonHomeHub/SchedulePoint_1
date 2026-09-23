import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { RadioCardGroup, type RadioCardOption } from './radio-card-group';

type V = 'tidy' | 'relayout';

const OPTIONS: RadioCardOption<V>[] = [
  {
    value: 'tidy',
    title: 'Tidy',
    description: 'Improve the rows you have.',
    figures: [
      { label: 'Activities moved', value: '12' },
      { label: 'Crossings', value: '360 → 204' },
    ],
  },
  {
    value: 'relayout',
    title: 'Re-layout',
    description: 'Start again from packed rows.',
    figures: null,
  },
];

function Harness({
  options = OPTIONS,
  onChange = () => undefined,
}: {
  options?: RadioCardOption<V>[];
  onChange?: (v: V) => void;
}): React.ReactElement {
  const [value, setValue] = useState<V | null>('tidy');
  return (
    <RadioCardGroup
      label="How to arrange"
      value={value}
      onChange={(v) => {
        setValue(v);
        onChange(v);
      }}
      options={options}
    />
  );
}

describe('RadioCardGroup', () => {
  it('is a named radio group whose radios are named by their title alone', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: 'How to arrange' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Tidy' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('radio', { name: 'Re-layout' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('ties the description and the figures to their option', () => {
    render(<Harness />);
    const tidy = screen.getByRole('radio', { name: 'Tidy' });
    expect(tidy).toHaveAccessibleDescription(/Improve the rows you have\./);
    expect(tidy).toHaveAccessibleDescription(/Activities moved\s*12/);
    expect(tidy).toHaveAccessibleDescription(/Crossings\s*360 → 204/);
    // An option with no figures yet describes itself by its sentence only.
    expect(screen.getByRole('radio', { name: 'Re-layout' })).toHaveAccessibleDescription(
      'Start again from packed rows.',
    );
  });

  it('keeps one tab stop, and the arrow keys move the selection with focus', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const tidy = screen.getByRole('radio', { name: 'Tidy' });
    const relayout = screen.getByRole('radio', { name: 'Re-layout' });
    expect(tidy).toHaveAttribute('tabindex', '0');
    expect(relayout).toHaveAttribute('tabindex', '-1');
    tidy.focus();
    fireEvent.keyDown(tidy, { key: 'ArrowDown' });
    expect(relayout).toHaveFocus();
    expect(onChange).toHaveBeenLastCalledWith('relayout');
    expect(relayout).toHaveAttribute('tabindex', '0');
    fireEvent.keyDown(relayout, { key: 'ArrowDown' });
    expect(tidy).toHaveFocus();
    fireEvent.keyDown(tidy, { key: 'End' });
    expect(relayout).toHaveFocus();
  });

  it('keeps a disabled option reachable, shows its reason, and never selects it', () => {
    const onChange = vi.fn();
    const shaded: RadioCardOption<V>[] = [
      { ...OPTIONS[0]!, disabled: true, disabledReason: 'Too large to tidy.' },
      OPTIONS[1]!,
    ];
    render(<Harness options={shaded} onChange={onChange} />);
    const tidy = screen.getByRole('radio', { name: 'Tidy' });
    expect(tidy).toHaveAttribute('aria-disabled', 'true');
    expect(tidy).not.toHaveAttribute('disabled');
    // The reason replaces the figures, so the figures of a run that will not happen are not read.
    expect(tidy).toHaveAccessibleDescription('Too large to tidy.');
    const relayout = screen.getByRole('radio', { name: 'Re-layout' });
    relayout.focus();
    fireEvent.keyDown(relayout, { key: 'ArrowUp' });
    expect(tidy).toHaveFocus();
    fireEvent.click(tidy);
    fireEvent.keyDown(tidy, { key: ' ' });
    expect(onChange).not.toHaveBeenCalledWith('tidy');
  });
});
