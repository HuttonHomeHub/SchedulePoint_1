import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './card';

/**
 * **This suite exists because of a finding, not for coverage.**
 *
 * ADR-0097's plan gives `CardTitle` a `level` prop so a card's title can be something other than
 * the page's `<h1>` — which is right, and is what lets a `SectionCard` sit under a `PageHeader`.
 * The spec proposed defaulting it to **2**. The component review found what that costs: `CardTitle`
 * renders `<h1>` today and **eleven** call sites depend on it, including `auth-shell.tsx` — the
 * sign-in, sign-up and password-reset screens, the front door of the product (ADR-0077) — and
 * every branch of `AcceptInvitationCard`.
 *
 * Defaulting to 2 would turn all of them into an `<h2>` on a page with **no `<h1>` at all**: a
 * WCAG 1.3.1 / 2.4.6 regression, on the screens where a stranger meets the product, that nothing
 * would fail to compile and no existing test would notice. It is the "latent, one move from live,
 * and nothing would report it" shape this epic keeps finding, arriving through the epic's own door.
 *
 * So the default is pinned HERE, before the prop is added, rather than asserted in the plan that
 * proposes it. When `level` lands, this suite is what makes it additive.
 */
describe('CardTitle', () => {
  it('renders an <h1> with no level given', () => {
    render(<CardTitle>Sign in</CardTitle>);
    // Level 1 explicitly, not "a heading". The whole finding is about WHICH rank.
    expect(screen.getByRole('heading', { level: 1, name: 'Sign in' })).toBeInTheDocument();
  });

  it('is the only heading a bare card contributes', () => {
    // Guards the other half: a card that grew a second heading internally would give a page two
    // `<h1>`s just as silently as the default change would give it none.
    render(
      <Card>
        <CardHeader>
          <CardTitle>Create your organisation</CardTitle>
          <CardDescription>Name it after the business, not the project.</CardDescription>
        </CardHeader>
        <CardContent>body</CardContent>
      </Card>,
    );
    expect(screen.getAllByRole('heading')).toHaveLength(1);
  });

  it('renders the description as text rather than a heading', () => {
    // `CardDescription` sits directly under the title and is the obvious candidate for someone to
    // "improve" into a subheading. It must not be one: a description is not a document section.
    render(<CardDescription>Name it after the business.</CardDescription>);
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
    expect(screen.getByText('Name it after the business.')).toBeInTheDocument();
  });
});
