import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ArrowKeysStayInPanel } from './ArrowKeysStayInPanel';
import { TOOLBAR_NAV_KEYS } from './toolbar-keyboard';

function setup() {
  const outer = vi.fn();
  render(
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions -- stands in for the roving toolbar
    <div onKeyDown={(event) => outer(event.key)}>
      <ArrowKeysStayInPanel>
        <select aria-label="Swimlane">
          <option>One</option>
        </select>
      </ArrowKeysStayInPanel>
    </div>,
  );
  return { outer, field: screen.getByRole('combobox', { name: 'Swimlane' }) };
}

describe('ArrowKeysStayInPanel', () => {
  it.each(TOOLBAR_NAV_KEYS)('keeps %s from reaching the toolbar above the panel', (key) => {
    const { outer, field } = setup();
    fireEvent.keyDown(field, { key });
    expect(outer).not.toHaveBeenCalled();
  });

  it.each(['Escape', 'Tab', 'Enter'])(
    'lets %s through, so the panel keeps its own contract',
    (key) => {
      const { outer, field } = setup();
      fireEvent.keyDown(field, { key });
      expect(outer).toHaveBeenCalledWith(key);
    },
  );
});
