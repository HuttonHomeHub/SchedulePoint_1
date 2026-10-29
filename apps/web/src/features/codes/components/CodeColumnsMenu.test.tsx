import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { CodeColumnsMenu, NO_CODE_TYPES_REASON } from './CodeColumnsMenu';

import type { CodeColumnsChoice } from '@/lib/code-columns';

const TYPES = [
  { id: 'area', name: 'Area' },
  { id: 'trade', name: 'Trade' },
  { id: 'phase', name: 'Phase' },
];

const choice = (over: Partial<CodeColumnsChoice> = {}): CodeColumnsChoice => ({
  status: 'ready',
  types: TYPES,
  shownIds: [],
  setShown: vi.fn(),
  ...over,
});

const open = (): void => {
  fireEvent.click(screen.getByRole('button', { name: 'Code columns' }));
};

describe('CodeColumnsMenu — the table’s chooser', () => {
  it('lists one checkbox item per live type in type order, unchecked by default', () => {
    render(<CodeColumnsMenu choice={choice()} />);
    open();
    const menu = screen.getByRole('menu', { name: 'Code columns' });
    const items = within(menu).getAllByRole('menuitemcheckbox');
    expect(items.map((i) => i.textContent)).toEqual(['Area', 'Trade', 'Phase']);
    for (const item of items) expect(item).toHaveAttribute('aria-checked', 'false');
  });

  it('marks the shown types as checked', () => {
    render(<CodeColumnsMenu choice={choice({ shownIds: ['trade'] })} />);
    open();
    expect(screen.getByRole('menuitemcheckbox', { name: 'Trade' })).toHaveAttribute(
      'aria-checked',
      'true',
    );
  });

  it('shows a type by adding it to the shown list, and hides one by removing it', () => {
    const setShown = vi.fn();
    const { rerender } = render(<CodeColumnsMenu choice={choice({ setShown })} />);
    open();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Area' }));
    expect(setShown).toHaveBeenLastCalledWith(['area']);

    rerender(<CodeColumnsMenu choice={choice({ setShown, shownIds: ['area', 'trade'] })} />);
    open();
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: 'Area' }));
    expect(setShown).toHaveBeenLastCalledWith(['trade']);
  });

  it('is shaded, not hidden, when the plan has no codes, and says how to add them', () => {
    render(<CodeColumnsMenu choice={choice({ types: [] })} />);
    const button = screen.getByRole('button', { name: 'Code columns' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).not.toBeDisabled();
    expect(button).toHaveAccessibleDescription(NO_CODE_TYPES_REASON);
    fireEvent.click(button);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    ['loading', 'Codes are loading.'],
    ['error', 'Codes could not be loaded.'],
  ] as const)('is shaded with its reason while the types are %s', (status, reason) => {
    render(<CodeColumnsMenu choice={choice({ status, types: [] })} />);
    const button = screen.getByRole('button', { name: 'Code columns' });
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveAccessibleDescription(reason);
  });

  it('shades the unchecked items at the cap with their reason, still focusable, and not the checked ones', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({
      id: `t${String(i)}`,
      name: `Type ${String(i)}`,
    }));
    const setShown = vi.fn();
    render(
      <CodeColumnsMenu
        choice={choice({ types: many, shownIds: many.slice(0, 10).map((t) => t.id), setShown })}
      />,
    );
    open();
    const eleventh = screen.getByRole('menuitemcheckbox', { name: /Type 10/ });
    expect(eleventh).toHaveAttribute('aria-disabled', 'true');
    expect(eleventh).toHaveAccessibleDescription(
      'Up to 10 code columns at a time. Turn one off to show another.',
    );
    eleventh.focus();
    expect(eleventh).toHaveFocus();
    fireEvent.click(eleventh);
    expect(setShown).not.toHaveBeenCalled();

    const ticked = screen.getByRole('menuitemcheckbox', { name: 'Type 0' });
    expect(ticked).not.toHaveAttribute('aria-disabled');
  });

  it('has no accessibility violations, closed or open', async () => {
    const { container } = render(
      <main>
        <CodeColumnsMenu choice={choice()} />
      </main>,
    );
    expect((await axe(container)).violations).toEqual([]);
    open();
    expect(
      (await axe(document.body, { rules: { region: { enabled: false } } })).violations,
    ).toEqual([]);
  });
});
