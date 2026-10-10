import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrgSwitcher } from './OrgSwitcher';

/**
 * **The organisation switcher is a ghost button that opens a menu of radio rows** (toolbar-redesign
 * M6 V5, CQ-4), with five states the native `<select>` it replaced never had to tell apart: none, one
 * and current, one and not current, several, and a name too long to show.
 *
 * Verified red against the `<select>`: every case below asks for a `button` or a `menuitemradio`,
 * and a select offers neither.
 */
const state = vi.hoisted(
  (): {
    slug: string | undefined;
    organizations: { id: string; slug: string; name: string }[];
    navigate: ReturnType<typeof vi.fn>;
  } => ({ slug: 'northgate', organizations: [], navigate: vi.fn() }),
);

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => (state.slug === undefined ? {} : { orgSlug: state.slug }),
  useNavigate: () => state.navigate,
}));

vi.mock('../api/use-organizations', () => ({
  useOrganizations: () => ({ data: state.organizations }),
}));

const NORTHGATE = { id: '1', slug: 'northgate', name: 'Northgate Developments' };
const RIVERSIDE = { id: '2', slug: 'riverside', name: 'Riverside Quarter' };

beforeEach(() => {
  state.slug = 'northgate';
  state.organizations = [NORTHGATE, RIVERSIDE];
  state.navigate.mockReset();
});

describe('OrgSwitcher', () => {
  it('shows the current organisation by name and carries it in the accessible name (2.5.3)', () => {
    render(<OrgSwitcher />);

    const trigger = screen.getByRole('button', {
      name: 'Active organisation: Northgate Developments',
    });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // The visible text is inside the accessible name, which is what label-in-name asks.
    expect(trigger).toHaveTextContent('Northgate Developments');
  });

  it('caps the control at a named sizing token and truncates the name inside it', () => {
    render(<OrgSwitcher />);

    const trigger = screen.getByRole('button', { name: /Active organisation/ });
    expect(trigger).toHaveClass('max-w-org-switcher');
    expect(trigger.className).not.toMatch(/\[/);
    // The name truncates inside the cap. A cap on the name alone left the glyph, the chevron and the
    // padding on top of it and wrapped the header at 1024 (M6 §5).
    expect(screen.getByText('Northgate Developments')).toHaveClass('min-w-0', 'truncate');
  });

  it('opens a menu of radio rows with the current organisation checked', () => {
    render(<OrgSwitcher />);

    fireEvent.click(screen.getByRole('button', { name: /Active organisation/ }));

    const menu = screen.getByRole('menu', { name: 'Organisations' });
    const rows = within(menu).getAllByRole('menuitemradio');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Northgate Developments',
      'Riverside Quarter',
    ]);
    expect(rows.map((row) => row.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    // Focus moves into the menu on open (APG), onto the first row.
    expect(rows[0]).toHaveFocus();
  });

  it('navigates to the chosen organisation and returns focus to the trigger', () => {
    render(<OrgSwitcher />);
    const trigger = screen.getByRole('button', { name: /Active organisation/ });

    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Riverside Quarter' }));

    expect(state.navigate).toHaveBeenCalledWith({
      to: '/orgs/$orgSlug',
      params: { orgSlug: 'riverside' },
    });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('closes on Escape with focus on the trigger, and walks the rows with the arrows', () => {
    render(<OrgSwitcher />);
    const trigger = screen.getByRole('button', { name: /Active organisation/ });

    fireEvent.click(trigger);
    fireEvent.keyDown(screen.getByRole('menu'), { key: 'ArrowDown' });
    expect(screen.getByRole('menuitemradio', { name: 'Riverside Quarter' })).toHaveFocus();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });

    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();
  });

  it('is a plain label, not a menu, for a single organisation that is current (ADR-0104)', () => {
    state.organizations = [NORTHGATE];
    render(<OrgSwitcher />);

    // The pinned positive: nothing rendered would satisfy "no button" trivially.
    expect(screen.getByText('Northgate Developments')).toBeInTheDocument();
    expect(screen.getByText(/Active organisation:/)).toHaveClass('sr-only');
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('stays a menu on a route with no organisation, because choosing one is the way back', () => {
    state.organizations = [NORTHGATE];
    state.slug = undefined;
    render(<OrgSwitcher />);

    const trigger = screen.getByRole('button', {
      name: 'Select organisation (active organisation: none)',
    });
    expect(trigger).toHaveTextContent('Select organisation');
    fireEvent.click(trigger);
    expect(screen.getByRole('menuitemradio', { name: 'Northgate Developments' })).toHaveAttribute(
      'aria-checked',
      'false',
    );
  });

  it('renders nothing until the reader has an organisation', () => {
    state.organizations = [];
    const { container } = render(<OrgSwitcher />);

    expect(container).toBeEmptyDOMElement();
  });
});
