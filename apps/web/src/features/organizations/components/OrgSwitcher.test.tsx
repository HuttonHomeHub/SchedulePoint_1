import type * as ReactRouter from '@tanstack/react-router';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { OrgSwitcher } from './OrgSwitcher';

/**
 * **The organisation switcher reads the FIELD family, not the surface** (console epic M2-T2).
 *
 * It carried `bg-background` — the surface family — so it painted whatever ground it sat on, which
 * inside `[data-surface='chrome']` is the band's own navy while every other control taking typed or
 * chosen input reads `--field`. S4's rebind of the field family could not have reached it, which is
 * why this is its own task and its own test: the brief proposed that rebind as the whole fix.
 *
 * **Verified red** against `bg-background`, which is the class this replaces. The assertion is on
 * the class rather than the computed colour deliberately: jsdom compiles no Tailwind, so a
 * `getComputedStyle` here would read an empty string and pass against anything. What proves the
 * PAINT is the token matrix (four gated pairs over this family) and the M0 harness, which read this
 * control's resolved cascade in a real browser through CDP.
 */
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useParams: () => ({ orgSlug: 'northgate' }),
  useNavigate: () => vi.fn(),
}));

vi.mock('../api/use-organizations', () => ({
  useOrganizations: () => ({
    data: [
      { id: '1', slug: 'northgate', name: 'Northgate Developments' },
      { id: '2', slug: 'riverside', name: 'Riverside Quarter' },
    ],
  }),
}));

describe('OrgSwitcher', () => {
  it('paints as a field of its surface, never as the surface itself', () => {
    render(<OrgSwitcher />);

    const select = screen.getByLabelText('Active organisation');

    // The pinned positive: a control that rendered nothing would satisfy "does not carry
    // `bg-background`" trivially (the ADR-0093 rule this estate's gates keep re-learning).
    expect(select.tagName).toBe('SELECT');
    expect(select).toHaveClass('bg-field');
    expect(select).toHaveClass('text-field-foreground');
    expect(select).not.toHaveClass('bg-background');
    // The outline is what identifies a field whose fill matches its surface — the rule
    // `token-contrast.test.ts` states beside the `--field`/`--input` pair, gated at 3:1.
    expect(select).toHaveClass('border-input');
  });
});
