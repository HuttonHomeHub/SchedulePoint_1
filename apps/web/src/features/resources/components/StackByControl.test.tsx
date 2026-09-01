import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { StackByControl } from './StackByControl';

/**
 * **The `Stack by` picker's own contract**, which nothing asserted before 2026-09-01.
 *
 * The control shipped with `Group` gated on the library holding a group, and no test said so —
 * so when a third mode arrived and the old rule started withholding it too, nothing failed. That
 * is why these cases exist and why the first of them is about the mode the change is FOR rather
 * than about the mode it adds.
 */
function renderControl(props: Partial<React.ComponentProps<typeof StackByControl>> = {}) {
  return render(<StackByControl id="stack-by" value="resource" onChange={vi.fn()} {...props} />);
}

describe('StackByControl', () => {
  it('offers all three stacking modes', () => {
    renderControl();
    const select = screen.getByRole('combobox', { name: 'Stack by' });
    expect([...select.querySelectorAll('option')].map((o) => o.value)).toEqual([
      'resource',
      'group',
      'kind',
    ]);
  });

  it('shades only Group when the library holds no group, and says why in its label', () => {
    // The whole select was disabled here until `Kind` existed — which withheld the one mode that
    // needs no groups from exactly the readers who have none. Verified red against that rule.
    renderControl({ groupsAvailable: false });
    const select = screen.getByRole('combobox', { name: 'Stack by' });
    expect(select).toBeEnabled();
    expect(
      screen.getByRole('option', { name: /^Group — none in the library yet$/ }),
    ).toBeDisabled();
    expect(screen.getByRole('option', { name: 'Kind' })).toBeEnabled();
    expect(screen.getByRole('option', { name: 'Resource' })).toBeEnabled();
  });

  it('drops the explanation once a group exists', () => {
    renderControl({ groupsAvailable: true });
    expect(screen.getByRole('option', { name: 'Group' })).toBeEnabled();
  });
});
