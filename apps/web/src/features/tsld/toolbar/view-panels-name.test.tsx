import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Deck, splitByRow } from '@/components/ui/toolbar';

/**
 * **One group called "Panels", with `View ▾` open** (toolbar-redesign M2-T2).
 *
 * The deck's own group is named "Panels" now (Legend, Resource view, Comments). `View ▾` used to
 * carry a fieldset of the same name for the Minimap, and the popover is non-modal, so both sit in
 * the accessibility tree at once: two groups of one name is a screen-reader collision and a locator
 * trap (`getByRole('group', { name: 'Panels' })` throws on two matches). The fieldset is "Navigation"
 * until M4 moves the Minimap to the diagram's corner and deletes it.
 *
 * Verified red by restoring the fieldset's old label: the lookup then returns two elements.
 */
describe('the deck group "Panels" is the only group of that name', () => {
  it('resolves to exactly one element with View ▾ open', () => {
    const rows = splitByRow(buildTsldToolbarItems());
    render(<Deck items={rows.strip} context={makeTsldToolbarContext()} label="Plan commands" />);
    fireEvent.click(screen.getByRole('button', { name: /^View/ }));
    expect(screen.getByRole('dialog', { name: 'View' })).toBeInTheDocument();
    expect(screen.getAllByRole('group', { name: 'Panels' })).toHaveLength(1);
    // And it is the deck's: it holds the panel toggles, not the Minimap.
    expect(screen.getByRole('button', { name: 'Legend' })).toBeInTheDocument();
  });
});
