import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { AuthShell } from './auth-shell';
import { BRAND_TAGLINE, BrandPanel } from './brand-panel';

/** ADR-0077 M4 — the brand panel, and the two traps that make it worth a suite of its own. */
describe('BrandPanel', () => {
  it('renders the lockup exactly once', () => {
    // **The jsdom trap.** The obvious responsive shape is two copies behind `hidden md:flex` and
    // `md:hidden`. jsdom has no CSS, so BOTH would land in the accessibility tree: every
    // `getByText` on a public screen would go ambiguous, and every `getAllBy*` assertion would
    // keep passing while asserting nothing. One `<aside>` always renders; only its proportion
    // changes. This counts, so a later "quick responsive fix" fails here rather than silently
    // weakening thirty other suites.
    const { container } = render(<BrandPanel />);

    expect(container.querySelectorAll('aside')).toHaveLength(1);
    expect(screen.getAllByText('SchedulePoint')).toHaveLength(1);
  });

  it('carries the tagline verbatim', () => {
    // A product-owner decision, reused from the previous product. Pinned by equality because a
    // copy pass is exactly how a line like this gets "improved".
    expect(BRAND_TAGLINE).toBe('A future reimagined by intelligent visual planning');
    render(<BrandPanel />);
    expect(screen.getByText(BRAND_TAGLINE)).toBeInTheDocument();
  });

  it('renders the wordmark as plain text, never as a link (ADR-0098 M4)', () => {
    // **The link belongs to the header call site, and this is the assertion that keeps it there.**
    // `BrandMark` is rendered by both `app-header.tsx` and this panel; the tempting one-line
    // version of "the wordmark is the route home" wraps the primitive itself, which passes every
    // header test and puts a link on the sign-in door — where there is no session and the route it
    // points at bounces the visitor straight back.
    //
    // It is asserted against the DOM rather than by role, because this panel is `aria-hidden`: a
    // link inside it is invisible to `getByRole` and still focusable, which is a WCAG 4.1.2 defect
    // in its own right and precisely the shape a role query cannot see. The first version of this
    // gate lived in `public-screens.landmarks.test.tsx` and passed against a real injected link,
    // because those tests mount the screen components and never this panel — the "SchedulePoint"
    // it matched was sign-in's own description copy.
    const { container } = render(<BrandPanel />);
    const panel = container.querySelector('aside');

    expect(panel?.querySelectorAll('a')).toHaveLength(0);
    expect(panel?.querySelectorAll('button')).toHaveLength(0);
    expect(screen.getByText('SchedulePoint').closest('a')).toBeNull();
  });

  it('is hidden from assistive technology, and loses nothing by it', () => {
    const { container } = render(<BrandPanel />);
    const panel = container.querySelector('aside');

    expect(panel).toHaveAttribute('aria-hidden', 'true');
    // It carries the surface scope rather than colours of its own — the whole mechanism.
    expect(panel).toHaveAttribute('data-surface', 'brand');
  });
});

describe('AuthShell with the panel', () => {
  it('still has one main, one card and one lockup', () => {
    const { container } = render(
      <AuthShell title="Sign in" description="Welcome back.">
        <p>form</p>
      </AuthShell>,
    );

    expect(screen.getAllByRole('main')).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(container.querySelectorAll('aside')).toHaveLength(1);
  });

  it('fills the viewport with the ground and floats the card on it', () => {
    // Not decoration: centring a tall card in a 360px-high landscape viewport is where content
    // gets clipped, and a layout rewrite is exactly the kind of edit that drops it.
    //
    // M7 moved which element carries this. The card became the `main` landmark and the viewport
    // height moved out to the ground behind it — so the assertion follows the invariant rather
    // than the element it used to sit on. `min-h-*`, never `h-*`: a card taller than a short
    // landscape viewport must be able to push the ground past one screen and scroll, and a fixed
    // ground height would clip it instead.
    const { container } = render(<AuthShell title="Sign in">form</AuthShell>);

    const main = screen.getByRole('main');
    const ground = main.parentElement;
    expect(ground).toBeInstanceOf(HTMLElement);
    expect(ground?.className).toContain('min-h-dvh');
    // Anchored on whitespace, not `\b`: a hyphen IS a word boundary, so `\bh-dvh\b` matches
    // inside `min-h-dvh` and this assertion would fail against the correct code.
    expect(ground?.className).not.toMatch(/(?:^|\s)h-dvh(?:\s|$)/);
    expect(container.firstElementChild).toBe(ground);
  });

  it('fixes the card height only from `md` up', () => {
    // The product owner's one keeper from the current design: the box does not resize as you move
    // between screens. It is deliberately `md:`-only — a fixed height on a 320px phone clips the
    // tallest state instead, which is the defect `e2e-public` was built to measure.
    render(<AuthShell title="Sign in">form</AuthShell>);

    const card = screen.getByRole('main').className;
    expect(card).toContain('md:h-[40rem]');
    // No unprefixed height: that would take the phone with it.
    expect(card).not.toMatch(/(?:^|\s)h-\[/);
  });
});
