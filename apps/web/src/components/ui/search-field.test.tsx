import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { SearchField } from '@/components/ui/search-field';

/**
 * The house Search control (`docs/DESIGN_SYSTEM.md` → Search). The clear button is the reason this
 * primitive exists: `type="search"`'s native ✕ is Chromium-only and never keyboard-reachable, so a
 * bare `<Input type="search">` leaves keyboard and screen-reader users with no way to clear a term
 * except selecting and deleting it (WCAG 2.1.1 / 4.1.2).
 */
function Harness({ initial = '' }: { initial?: string }): React.ReactElement {
  const [value, setValue] = useState(initial);
  return (
    <SearchField
      label="Search calendars"
      placeholder="Search by name"
      clearLabel="Clear calendar search"
      value={value}
      onChange={setValue}
    />
  );
}

describe('SearchField', () => {
  it('is a labelled search input', () => {
    render(<Harness />);
    const field = screen.getByLabelText('Search calendars');
    expect(field).toHaveAttribute('type', 'search');
    expect(field).toHaveAttribute('placeholder', 'Search by name');
  });

  it('offers no clear button until there is something to clear', () => {
    render(<Harness />);
    expect(screen.queryByRole('button', { name: 'Clear calendar search' })).not.toBeInTheDocument();
  });

  it('clears the term from a real, named button (keyboard-operable)', () => {
    render(<Harness initial="excav" />);
    const clear = screen.getByRole('button', { name: 'Clear calendar search' });
    fireEvent.click(clear);
    expect(screen.getByLabelText('Search calendars')).toHaveValue('');
    // Nothing left to clear, so the affordance goes away again.
    expect(screen.queryByRole('button', { name: 'Clear calendar search' })).not.toBeInTheDocument();
  });

  it('reports every keystroke to its owner (controlled)', () => {
    const onChange = vi.fn();
    render(<SearchField label="Search resources" value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText('Search resources'), { target: { value: 'cr' } });
    expect(onChange).toHaveBeenCalledWith('cr');
  });

  it('has no axe violations, empty or filled', async () => {
    const { container, rerender } = render(<Harness />);
    expect((await axe(container)).violations).toEqual([]);
    rerender(<Harness initial="excav" />);
    expect((await axe(container)).violations).toEqual([]);
  });
});
