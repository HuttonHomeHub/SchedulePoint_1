import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EmptyState,
  ListRow,
  ListRowSkeleton,
  PageContainer,
  PageHeader,
  SectionCard,
  Skeleton,
} from './index';

/**
 * The six page archetypes (ADR-0097 Landing A).
 *
 * Each assertion here corresponds to a decision the archetype makes ON BEHALF of every screen —
 * which is what an archetype is for, and what makes getting one wrong expensive rather than
 * local. Four of them were corrections raised by the plan review before any of this was built.
 */
describe('PageContainer', () => {
  it('renders no landmark', () => {
    // **The correction that matters most here.** The obvious implementation of "the page frame" is
    // a `<main>`, and every screen this replaces already sits inside the app shell's own `<main>` —
    // so that would ship TWO `main` landmarks on every authenticated screen, and a reader
    // navigating by landmark would meet two with no way to tell which held the content. The
    // organisation landing page's own spec states it "sits inside the shell's existing `<main>`
    // and adds no landmark"; this is that, asserted rather than remembered.
    const { container } = render(<PageContainer>content</PageContainer>);
    expect(container.querySelector('main')).toBeNull();
    expect(screen.queryByRole('main')).not.toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('keeps one measure for every screen that uses it', () => {
    // The frame was hand-written fourteen times. The point of the archetype is that the measure
    // is now one decision, so the class that carries it is worth pinning.
    const { container } = render(<PageContainer>content</PageContainer>);
    expect(container.firstElementChild?.className).toContain('max-w-6xl');
  });
});

describe('PageHeader', () => {
  it('renders the title as the page h1', () => {
    render(<PageHeader title="Calendars" />);
    expect(screen.getByRole('heading', { level: 1, name: 'Calendars' })).toBeInTheDocument();
  });

  it('wires the description to the heading rather than leaving it a stray paragraph', () => {
    // A caveat reachable only by reading serially is not reachable — the ADR-0073 C2.5 finding.
    // A landmark-navigating reader lands on the heading, so the description has to travel with it.
    render(<PageHeader title="Audit log" description="What this records, and what it does not." />);
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveAccessibleDescription('What this records, and what it does not.');
  });

  it('omits the description wiring entirely when there is none', () => {
    // Not an empty `aria-describedby` pointing at nothing, which is worse than no attribute.
    render(<PageHeader title="Clients" />);
    expect(screen.getByRole('heading', { level: 1 })).not.toHaveAttribute('aria-describedby');
  });
});

describe('SectionCard', () => {
  it('renders its title as an h2, so a section never claims the page heading', () => {
    // The archetype owns the rank. `CardTitle` defaults to h1 because eleven call sites are a
    // page's only heading; a section inside a page is not one of those, and deciding that here
    // once is the difference between a correct heading tree and sixteen screens remembering.
    render(<SectionCard title="Recently changed">rows</SectionCard>);
    expect(screen.getByRole('heading', { level: 2, name: 'Recently changed' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('sits correctly beneath a page header', () => {
    render(
      <PageContainer>
        <PageHeader title="Overview" />
        <SectionCard title="Recently changed">rows</SectionCard>
      </PageContainer>,
    );
    // Exactly one h1, exactly one h2 — the composed tree, not the components in isolation, which
    // is where a rank decision actually goes wrong.
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getAllByRole('heading', { level: 2 })).toHaveLength(1);
  });
});

describe('EmptyState', () => {
  it('renders without an action at all', () => {
    // **The case a required `action` prop would have forced into a lie.** A Viewer is told nothing
    // needs their attention and to ask a Planner — they genuinely cannot act, and a button that
    // refuses them is worse than no button.
    render(
      <EmptyState
        size="section"
        title="Nothing needs your attention"
        description="Ask a Planner if you think something is missing."
      />,
    );
    expect(screen.getByText('Nothing needs your attention')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('renders an action when there is one', () => {
    render(
      <EmptyState title="No clients yet" action={<button type="button">Add a client</button>} />,
    );
    expect(screen.getByRole('button', { name: 'Add a client' })).toBeInTheDocument();
  });

  it('hides its icon from assistive readers', () => {
    // The icon restates the title. Announcing both is noise.
    const { container } = render(
      <EmptyState title="No clients yet" icon={<svg data-testid="icon" />} />,
    );
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });

  it('is a different size at section scale', () => {
    // Two axes, not one — "this organisation is new" and "this one section is empty" are different
    // questions and should not be answered at the same scale.
    const page = render(<EmptyState title="a" />).container.firstElementChild?.className;
    const section = render(<EmptyState title="a" size="section" />).container.firstElementChild
      ?.className;
    expect(page).not.toBe(section);
  });
});

describe('ListRow', () => {
  it('renders its primary and trailing content', () => {
    render(<ListRow primary={<span>Tower B</span>} trailing={<span>2 days ago</span>} />);
    expect(screen.getByText('Tower B')).toBeInTheDocument();
    expect(screen.getByText('2 days ago')).toBeInTheDocument();
  });

  it('owns its loading shape rather than leaving a generic rectangle to reflow', () => {
    // UX_STANDARDS requires the skeleton and the settled layout to be identical. A bare `Skeleton`
    // becomes whatever shape the real row turns out to be, so the shape lives with the component
    // that knows it.
    const { container } = render(<ListRowSkeleton rows={3} />);
    const busy = container.querySelector('[aria-busy="true"]');
    expect(busy).toBeInTheDocument();

    // Three rows, each with the row's real shape — two stacked lines and a trailing block — so the
    // settled content replaces it without reflow.
    expect(busy!.querySelectorAll('.animate-pulse')).toHaveLength(9);

    // Announced once as "loading", not as nine grey rectangles: EVERY skeleton is hidden, so the
    // `aria-busy` on the wrapper is the only thing an assistive reader is told.
    const shapes = [...busy!.querySelectorAll('.animate-pulse')];
    expect(shapes.every((node) => node.getAttribute('aria-hidden') === 'true')).toBe(true);
  });
});

describe('Skeleton', () => {
  it('is hidden from assistive readers', () => {
    // It carries no information; the region it sits in carries the `aria-busy`.
    const { container } = render(<Skeleton className="h-4 w-24" />);
    expect(container.firstElementChild).toHaveAttribute('aria-hidden', 'true');
  });
});
