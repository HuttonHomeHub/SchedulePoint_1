import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  EmptyState,
  ListRow,
  ListRowSkeleton,
  PageContainer,
  PageHeader,
  RowSubject,
  SectionCard,
  Skeleton,
  StatGrid,
} from './index';

/**
 * The page archetypes (ADR-0097 Landing A).
 *
 * **Deliberately not a count.** This said "six" over a barrel exporting nine — stale before the
 * change that noticed it, and the third such drift in this directory. A number here is a claim
 * about a file one import away and nothing checks it, so `index.ts` holds the one count that is
 * maintained and this docblock names the set instead.
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
    expect(container.firstElementChild?.className).toContain('max-w-screen-2xl');
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

  /**
   * **The `aside`/`actions` composition, which the plan promised coverage for and nobody wrote.**
   *
   * M5-T1's own testing line reads "unit at two widths", and no test touched `aside` at all — so
   * the slot shipped pushing the screen's primary action onto a third line below `md`, left-aligned,
   * on both of its consumers. jsdom has no layout, so these assert the **composition** that decides
   * it and the browser assertion lives in `apps/web/e2e-page-composition/composition.spec.ts`. That
   * split is the honest one: a class string is checkable here, a rendered line is not.
   *
   * Verified red against the two-sibling version: `basis-full` sat on the aside itself, so there
   * was no shared wrapper to find and the actions carried no `justify-*` at any width.
   */
  describe('the aside and the actions share one wrapping line', () => {
    const wrapperOf = (label: string) =>
      screen.getByText(label).parentElement?.parentElement?.className ?? '';

    it('gives the pair a full line below md and puts the actions at its far end', () => {
      render(
        <PageHeader
          title="Riverside"
          aside={<span>4 projects</span>}
          actions={<button>New</button>}
        />,
      );
      const wrapper = wrapperOf('4 projects');
      expect(wrapper).toMatch(/\bbasis-full\b/);
      expect(wrapper).toMatch(/\bmd:basis-auto\b/);
      expect(wrapper).toMatch(/\bjustify-between\b/);
      expect(wrapper).toMatch(/\bmd:justify-end\b/);
      // Reading order is the visual order at every width, so no `order-*` is in play (WCAG 1.3.2).
      expect(wrapper).not.toMatch(/\border-\d/);
    });

    it('leaves actions ALONE shrink-wrapped beside the title, taking no line of their own', () => {
      // The shape every other screen in the product uses. `basis-full` here would push the primary
      // action onto its own line on sixteen screens to fix two.
      render(<PageHeader title="Clients" actions={<button>New client</button>} />);
      const wrapper = screen.getByRole('button', { name: 'New client' }).parentElement
        ?.parentElement;
      expect(wrapper?.className).not.toMatch(/\bbasis-full\b/);
      expect(wrapper?.className).not.toMatch(/\bjustify-between\b/);
    });

    it('still gives an aside ALONE its own line below md', () => {
      render(<PageHeader title="Riverside" aside={<span>4 projects</span>} />);
      const wrapper = wrapperOf('4 projects');
      expect(wrapper).toMatch(/\bbasis-full\b/);
      expect(wrapper).toMatch(/\bmd:basis-auto\b/);
    });
  });
});

describe('SectionCard', () => {
  /**
   * **A focus destination has to be visible when focus lands on it** (WCAG 2.2 §2.4.7, AA).
   *
   * `id` exists to make a section a place focus can be SENT — the staff console's status summary
   * links every check to the section that answers it. It shipped applying
   * `focus-visible:outline-none` with no replacement, so a keyboard reader who followed such a link
   * arrived with no visible sign that they had. Every assertion that existed checked `tabindex="-1"`
   * was present; none checked that focus could be seen. Found by the M6 component review.
   *
   * The second half matters too: the classes were unconditional, so three overview sections that
   * pass no `id` — and are therefore not focusable at all — carried focus styling for a behaviour
   * they do not have.
   */
  it('gives a focus destination a visible ring, and gives a plain section no focus styling at all', () => {
    const { rerender, container } = render(
      <SectionCard id="somewhere" title="Destination">
        body
      </SectionCard>,
    );

    const destination = container.querySelector('section');
    expect(destination).toHaveAttribute('tabindex', '-1');
    expect(destination?.className, 'the focus destination has no visible indicator').toMatch(
      /focus-visible:ring-2/,
    );

    rerender(<SectionCard title="Ordinary">body</SectionCard>);
    const ordinary = container.querySelector('section');
    expect(ordinary).not.toHaveAttribute('tabindex');
    expect(ordinary?.className, 'a section nobody can focus is carrying focus styling').not.toMatch(
      /focus-visible:/,
    );
  });

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

  it('is a region named by its own heading, so sections are navigable', () => {
    // A `<section>` with an accessible name IS a landmark, which is how a screen-reader user jumps
    // between "Recently changed" and "Needs your attention" instead of walking the page. It is safe
    // here for the reason the APG puts on `region` at all: each one is distinctly named. The
    // overview journey found the same gap from the other side — the page had no way to say which
    // section a row belonged to, so a plan appearing in both matched twice.
    render(
      <>
        <SectionCard title="Recently changed">rows</SectionCard>
        <SectionCard title="Needs your attention">items</SectionCard>
      </>,
    );
    expect(screen.getByRole('region', { name: 'Recently changed' })).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Needs your attention' })).toBeInTheDocument();
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

/**
 * **`StatGrid`'s two axes, both of which shipped with no test at all.**
 *
 * `tone` exists because the console's job is *is anything wrong*, and until it was added a failure
 * count and "API version 0.64.0" rendered identically — so the two most alarming numbers on the
 * screen carried no signal (spec §8.15). A regression in the wiring or in the class map would have
 * gone undetected by everything in the suite. `columns` shipped **inert**: `@container` and its own
 * `@md:` variant were on the same element, so the rule could never match and the grid was two
 * columns at every width in both modes. Both found by the M6 component review.
 */
describe('StatGrid', () => {
  it('renders a toned figure with the alarm treatment, and an untoned one without it', () => {
    render(
      <StatGrid
        items={[
          { label: 'Failures, last 24 hours', value: '5', tone: 'alarm' },
          { label: 'API version', value: '0.64.0' },
        ]}
      />,
    );

    expect(screen.getByText('5').className).toMatch(/text-destructive-text/);
    expect(
      screen.getByText('0.64.0').className,
      'an ordinary fact is being painted as a problem',
    ).not.toMatch(/text-destructive-text/);
  });

  /**
   * The `@container` must be on a WRAPPER, never on the grid itself — an element is not its own
   * query container, so the variant would query an ancestor that does not exist and the base class
   * would win silently, at every width. That is exactly what shipped.
   */
  it('declares its container on a wrapper, so the column rule can match at all', () => {
    const { container } = render(<StatGrid columns={3} items={[{ label: 'A', value: '1' }]} />);

    const wrapper = container.querySelector('.\\@container');
    expect(wrapper, 'nothing declares a query container').not.toBeNull();
    const list = container.querySelector('dl');
    expect(
      list?.className,
      'the grid is its own query container, so its rule cannot fire',
    ).not.toMatch(/@container/);
    expect(list?.className).toMatch(/@md:grid-cols-3/);
  });
});

describe('RowSubject', () => {
  it('puts the subject and its context in ONE line box', () => {
    // The whole reason this exists: the two used to be separate block elements, at a measured cost
    // of 20 px on every row of the organisation landing.
    const { container } = render(<RowSubject name="Tower B" context="Riverside · Acme" />);

    const paragraphs = container.querySelectorAll('p');
    expect(paragraphs).toHaveLength(1);
    expect(paragraphs[0]?.textContent).toContain('Tower B');
    expect(paragraphs[0]?.textContent).toContain('Riverside · Acme');
  });

  it('renders nothing for the context when there is none', () => {
    const { container } = render(<RowSubject name="Tower B" />);

    expect(container.textContent).toBe('Tower B');
  });

  it('lets the context give way before the name does', () => {
    // The truncation rule is the decision this component owns. A call site must not be able to
    // answer it differently, and a name clipped in favour of its project is the wrong sacrifice.
    const { container } = render(<RowSubject name="Tower B" context="Riverside · Acme" />);

    const spans = [...container.querySelectorAll('span')];
    const nameSpan = spans.find((el) => el.textContent === 'Tower B');
    const contextSpan = spans.find((el) => el.textContent === 'Riverside · Acme');

    expect(nameSpan?.className).toMatch(/\btruncate\b/);
    expect(contextSpan?.className).toMatch(/\btruncate\b/);
    // Three times faster, so the name survives a long project and client.
    expect(contextSpan?.className).toMatch(/shrink-\[3\]/);
    expect(nameSpan?.className).not.toMatch(/shrink-\[3\]/);
  });
});

describe('SectionCard fill', () => {
  it('makes the body a keyboard-operable scroll region', () => {
    // WCAG 2.2 §2.1.1: a scroll container that cannot take focus cannot be scrolled without a
    // pointer. Browsers have been inconsistent about focusing them implicitly.
    const { container } = render(
      <SectionCard title="Recently changed" fill>
        <p>row</p>
      </SectionCard>,
    );

    const body = container.querySelector('[tabindex="0"]');
    expect(body, 'the scrollable body is not reachable from the keyboard').not.toBeNull();
    expect(body?.className).toMatch(/overflow-y-auto/);
  });

  it('leaves the body alone when it is not filling', () => {
    // The rollback contract: every other screen in the product passes no `fill` and must be
    // byte-identical. A card that acquired a focus stop by default would put an unnamed tab
    // stop into sixteen screens.
    const { container } = render(
      <SectionCard title="Recently changed">
        <p>row</p>
      </SectionCard>,
    );

    expect(container.querySelector('[tabindex="0"]')).toBeNull();
    expect(container.innerHTML).not.toMatch(/overflow-y-auto/);
  });

  it('keeps the heading out of the scroll, because it names what you scrolled into', () => {
    const { container } = render(
      <SectionCard title="Recently changed" fill>
        <p>row</p>
      </SectionCard>,
    );

    const heading = screen.getByRole('heading', { name: 'Recently changed' });
    // The card's header row is the section's first element child. **Not
    // `heading.closest('div')?.parentElement`**, which this was: that walked h2 → the title
    // wrapper → the header, and broke the moment the header gained a legitimate extra
    // element (the `count` slot). It was asserting on a DOM depth rather than on the header.
    const header = heading.closest('section')?.firstElementChild;
    expect(header?.className).toMatch(/shrink-0/);
    expect(container.querySelector('[tabindex="0"]')?.contains(heading)).toBe(false);
  });

  it('puts the action beside the title rather than under it', () => {
    /*
      `CardHeader`'s own base is `flex flex-col`, and `flex` does not displace it — different
      utility groups, so `tailwind-merge` keeps both and the column wins. `SectionCard` declared
      `items-start justify-between` describing a row that did not exist, and no consumer passed an
      action until the landing's counts, so nothing ever showed it. Verified red against the
      version without `flex-row`.
    */
    render(
      <SectionCard title="Recently changed" action={<span>8 plans</span>}>
        <p>row</p>
      </SectionCard>,
    );

    const heading = screen.getByRole('heading', { name: 'Recently changed' });
    // The card's header row is the section's first element child. **Not
    // `heading.closest('div')?.parentElement`**, which this was: that walked h2 → the title
    // wrapper → the header, and broke the moment the header gained a legitimate extra
    // element (the `count` slot). It was asserting on a DOM depth rather than on the header.
    const header = heading.closest('section')?.firstElementChild;
    expect(header?.className).toMatch(/\bflex-row\b/);
  });
});

/**
 * **`SectionCard`'s `count`, which shipped with no unit coverage at all.**
 *
 * The only thing exercising it was one text-content check in a journey — and that gap is exactly
 * what let it ship `aria-hidden` on a premise none of its four consumers met. `Column.width` got a
 * dedicated test file in this same epic after a reviewer noticed it had none; `count` did not, and
 * the M8 component review said so.
 */
describe('SectionCard count', () => {
  it('exposes the number to assistive technology, not to sighted readers alone', () => {
    // Verified red against `aria-hidden` on the span: `getByText` still finds an `aria-hidden`
    // node, so the assertion is on the accessible name of the region's own header row — which is
    // what an AT user actually reaches. Parity, not a second announcement: nothing here is a live
    // region, so the number is read once, when the reader arrives at the heading.
    render(
      <SectionCard title="Clients" count={124}>
        <p>row</p>
      </SectionCard>,
    );
    const number = screen.getByText('124');
    expect(number).not.toHaveAttribute('aria-hidden');
    expect(number.closest('[aria-hidden="true"]')).toBeNull();
  });

  it('omits the slot entirely when the count is undefined, rather than printing a zero', () => {
    // `undefined` is "the caller could not take this count", which is not the same fact as 0 and
    // must not render as one (ADR-0126's rule, one primitive along).
    render(
      <SectionCard title="Clients">
        <p>row</p>
      </SectionCard>,
    );
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('renders a real zero, because "none" is a fact the reader came for', () => {
    render(
      <SectionCard title="Clients" count={0}>
        <p>row</p>
      </SectionCard>,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
  });

  it('keeps the section named by its title alone, so a count cannot creep into the name', () => {
    render(
      <SectionCard title="Clients" count={124}>
        <p>row</p>
      </SectionCard>,
    );
    expect(screen.getByRole('region', { name: 'Clients' })).toBeInTheDocument();
  });
});
