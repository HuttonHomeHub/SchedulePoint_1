import { fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';

import { Toolbar } from './Toolbar';
import { defineToolbar, type ToolbarItem } from './toolbar-registry';

interface Ctx {
  count: number;
}

interface Handlers {
  fit?: () => void;
  grid?: () => void;
  add?: () => void;
}

/**
 * A registry exercising groups 1/2/4/5, a pen-gated item, a toggle, and a render escape-hatch.
 * Its buttons pin `showLabel: 'always'` so these tests exercise the labelled chrome regardless of
 * the container width jsdom reports (0) — the width-responsive `'auto'` policy has its own tests.
 */
function makeItems(handlers: Handlers = {}): ToolbarItem<Ctx>[] {
  return defineToolbar<Ctx>([
    {
      id: 'fit',
      group: 'frame',
      tier: 1,
      showLabel: 'always',
      order: 0,
      label: 'fit',
      onActivate: handlers.fit ?? (() => {}),
    },
    {
      id: 'grid',
      group: 'lens',
      tier: 1,
      showLabel: 'always',
      order: 0,
      label: 'grid',
      isActive: (c) => c.count % 2 === 0,
      onActivate: handlers.grid ?? (() => {}),
    },
    {
      id: 'add',
      group: 'tools',
      tier: 1,
      showLabel: 'always',
      order: 0,
      label: 'add',
      penGated: true,
      disabledReason: () => 'Start editing to add activities',
      onActivate: handlers.add ?? (() => {}),
    },
    {
      id: 'finish-chip',
      group: 'object',
      tier: 1,
      order: 0,
      label: 'finish',
      render: (c, api) => (
        <span {...api.itemProps} role="button" aria-label={`Project finish ${c.count}`}>
          Finish {c.count}
        </span>
      ),
    },
  ]);
}

describe('Toolbar (APG primitive)', () => {
  it('renders a labelled toolbar with per-group regions', () => {
    render(<Toolbar items={makeItems()} context={{ count: 2 }} label="Plan toolbar" />);
    const tb = screen.getByRole('toolbar', { name: 'Plan toolbar' });
    expect(tb).toHaveAttribute('aria-orientation', 'horizontal');
    expect(within(tb).getByRole('group', { name: 'Navigate' })).toBeInTheDocument();
    expect(within(tb).getByRole('group', { name: 'Author' })).toBeInTheDocument();
  });

  it('a labelled button with a description keeps its label in the title', () => {
    // Regression: the tooltip helper used to drop the label for a labelled item with a description,
    // showing just the bare description. It must read "<label> — <description>".
    // `showLabel` is declared, not inferred from `tier` — the two are separate concerns
    // (TECH_DEBT #61), so a test about labelling says so rather than leaning on the tier.
    const items = defineToolbar<Ctx>([
      {
        id: 'fit',
        group: 'frame',
        tier: 1,
        showLabel: 'always',
        order: 0,
        label: 'Fit',
        description: 'Fit the diagram to the window',
        onActivate: () => {},
      },
      {
        id: 'plain',
        group: 'frame',
        tier: 1,
        showLabel: 'always',
        order: 1,
        label: 'Plain',
        onActivate: () => {},
      },
    ]);
    render(<Toolbar items={items} context={{ count: 1 }} label="T" />);
    expect(screen.getByRole('button', { name: 'Fit' })).toHaveAttribute(
      'title',
      'Fit — Fit the diagram to the window',
    );
    // A labelled button with no description gets no redundant title (its name is already visible).
    expect(screen.getByRole('button', { name: 'Plain' })).not.toHaveAttribute('title');
  });

  it('an icon-only button names itself with the Tooltip primitive, never title (fix-slice M-B)', () => {
    // The `title` attribute is hover-only — invisible to keyboard focus and to touch — so the
    // icon-only branch now speaks through `useTooltip` (#131). The accessible name stays exactly
    // `label`, and no `title` remains on the branch (verified red against the pre-M-B button,
    // which carried `title="Fit"`).
    const items = defineToolbar<Ctx>([
      {
        id: 'fit',
        group: 'frame',
        tier: 1,
        showLabel: 'never',
        order: 0,
        label: 'Fit',
        onActivate: () => {},
      },
      {
        id: 'undo',
        group: 'frame',
        tier: 1,
        showLabel: 'never',
        order: 1,
        label: 'Undo',
        isEnabled: () => false,
        disabledReason: () => 'Nothing to undo',
        onActivate: () => {},
      },
    ]);
    render(<Toolbar items={items} context={{ count: 1 }} label="T" />);
    const fit = screen.getByRole('button', { name: 'Fit' });
    expect(fit).not.toHaveAttribute('title');
    fireEvent.focus(fit);
    const tip = document.querySelector('[data-tooltip]');
    expect(tip).toHaveTextContent('Fit');
    expect(tip).toHaveAttribute('aria-hidden', 'true'); // name-echo: AT hears nothing twice
    // The disabled icon-only string is CHARACTER-IDENTICAL to the title it replaces, or copy has
    // silently changed — and the reason stays AT-reachable through aria-describedby as before.
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).not.toHaveAttribute('title');
    fireEvent.focus(undo);
    expect(document.querySelector('[data-tooltip]')).toHaveTextContent('Undo — Nothing to undo');
    expect(undo).toHaveAccessibleDescription(/Nothing to undo/);
  });

  it("an icon-only control WITH a description derives purpose 'description' — AT keeps the channel", () => {
    // The M-B accessibility review's finding 2: pre-M-B, an icon-only control's
    // `title="label — description"` reached AT as the accessible description (title maps there
    // when no aria-describedby is set). A hardcoded 'name-echo' would have stranded that text
    // from AT the day an ICON_ONLY item gained a description; deriving the purpose keeps parity.
    const items = defineToolbar<Ctx>([
      {
        id: 'fit',
        group: 'frame',
        tier: 1,
        showLabel: 'never',
        order: 0,
        label: 'Fit',
        description: 'Fit the diagram to the window',
        onActivate: () => {},
      },
    ]);
    render(<Toolbar items={items} context={{ count: 1 }} label="T" />);
    const fit = screen.getByRole('button', { name: 'Fit' });
    fireEvent.focus(fit);
    const tip = document.querySelector('[data-tooltip]');
    expect(tip).toHaveAttribute('role', 'tooltip');
    expect(tip).toHaveTextContent('Fit — Fit the diagram to the window');
    expect(fit).toHaveAccessibleDescription(/Fit the diagram to the window/);
    expect(fit).toHaveAccessibleName('Fit'); // the name is still exactly the label
  });

  describe('label policy — `showLabel` is presentation, `tier` is priority (TECH_DEBT #61)', () => {
    /**
     * Render with a stubbed container width; jsdom lays nothing out, so this is the only input.
     *
     * **The spy is restored in `afterEach`, not by the caller.** It used to be the caller's job, and
     * when the case below started failing its `restore()` never ran — so a 20 px width leaked into
     * the next six tests, which demoted every command and failed with "unable to find button 'fit'".
     * One real defect arrived as eight, none of them pointing at it.
     */
    let widthSpy: { mockRestore: () => void } | null = null;
    afterEach(() => {
      widthSpy?.mockRestore();
      widthSpy = null;
    });
    function renderAtWidth(width: number, items: ToolbarItem<Ctx>[]) {
      widthSpy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
      return render(<Toolbar items={items} context={{ count: 1 }} label="T" />);
    }

    const autoItems = defineToolbar<Ctx>([
      { id: 'a', group: 'frame', tier: 1, order: 0, label: 'Alpha', onActivate: () => {} },
      { id: 'b', group: 'frame', tier: 2, order: 1, label: 'Beta', onActivate: () => {} },
    ]);

    it('labels `auto` items when the row measurably has room', () => {
      renderAtWidth(1200, autoItems);
      // A labelled button carries its name as text, so it needs no `aria-label` to be reachable.
      expect(screen.getByRole('button', { name: 'Alpha' })).not.toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-label');
    });

    // `auto` USED to mean "label this if the row can afford it", and the ladder decided. A deck
    // that wraps can always afford it, so `auto` now means labelled and only an explicit
    // `'never'` suppresses. The case is inverted rather than deleted, because what it guards —
    // that the policy is honoured at all — still matters.
    it('labels `auto` items, because a wrapping surface can always afford one', () => {
      render(<Toolbar items={autoItems} context={{ count: 1 }} label="T" />);
      // Labelled: the visible text IS the accessible name, so no `aria-label` overrides it.
      const alpha = screen.getByRole('button', { name: 'Alpha' });
      expect(alpha).not.toHaveAttribute('aria-label');
      expect(alpha).toHaveTextContent('Alpha');
    });

    it('honours `always` / `never` regardless of width — tier never decides', () => {
      // Both items are tier 1. Under the old `showLabel={tier === 1}` rule they were forced to
      // agree; the policy is what separates them now.
      const pinned = defineToolbar<Ctx>([
        {
          id: 'shown',
          group: 'frame',
          tier: 1,
          showLabel: 'always',
          order: 0,
          label: 'Shown',
          onActivate: () => {},
        },
        {
          id: 'hidden',
          group: 'frame',
          tier: 1,
          showLabel: 'never',
          order: 1,
          label: 'Hidden',
          onActivate: () => {},
        },
      ]);
      // 110 px, not 20. Since M7 a plain button's width is derived, so at 20 px the row cannot hold
      // these two at all and demotes both — which says nothing about how they would have been
      // labelled. 110 px is narrow enough that an `'auto'` item would stay icon-only (the point of
      // the case) and wide enough that policy is what is being read rather than the overflow.
      renderAtWidth(110, pinned);
      expect(screen.getByRole('button', { name: 'Shown' })).not.toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: 'Hidden' })).toHaveAttribute(
        'aria-label',
        'Hidden',
      );
    });
  });

  it('gives exactly one control tabindex 0 (roving), the rest -1', () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" />);
    const focusables = screen.getByRole('toolbar').querySelectorAll('[data-toolbar-focusable]');
    const zeros = [...focusables].filter((el) => el.getAttribute('tabindex') === '0');
    expect(zeros).toHaveLength(1);
    expect(focusables.length).toBeGreaterThan(1);
  });

  it('moves focus with ArrowRight / ArrowLeft / Home / End (roving)', () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" />);
    const fit = screen.getByRole('button', { name: 'fit' });
    const grid = screen.getByRole('button', { name: 'grid' });
    const chip = screen.getByRole('button', { name: /Project finish/i });
    fit.focus();
    fireEvent.keyDown(fit, { key: 'ArrowRight' });
    expect(grid).toHaveFocus();
    expect(grid).toHaveAttribute('tabindex', '0');
    expect(fit).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(grid, { key: 'End' });
    expect(chip).toHaveFocus();
    fireEvent.keyDown(chip, { key: 'Home' });
    expect(fit).toHaveFocus();
    fireEvent.keyDown(fit, { key: 'ArrowLeft' }); // wraps to the last control
    expect(chip).toHaveFocus();
  });

  it('does not hijack arrow / Home / End keys from a form field inside a render item', () => {
    // A native date input (e.g. the "Go to date" / "Project start" controls) owns these keys for
    // segment editing; the toolbar must not steal them and move roving focus (WCAG 2.1.1, a11y review).
    const items = defineToolbar<Ctx>([
      { id: 'fit', group: 'frame', tier: 1, order: 0, label: 'fit', onActivate: () => {} },
      {
        id: 'date',
        group: 'frame',
        tier: 1,
        order: 1,
        label: 'date',
        render: (_c, api) => <input {...api.itemProps} type="date" aria-label="date field" />,
      },
    ]);
    render(<Toolbar items={items} context={{ count: 1 }} label="T" />);
    const field = screen.getByLabelText('date field');
    const fit = screen.getByRole('button', { name: 'fit' });
    field.focus();
    fireEvent.keyDown(field, { key: 'ArrowLeft' });
    fireEvent.keyDown(field, { key: 'ArrowRight' });
    fireEvent.keyDown(field, { key: 'Home' });
    // Focus stayed on the input; roving never grabbed a sibling control.
    expect(field).toHaveFocus();
    expect(fit).not.toHaveFocus();
  });

  it('activates an enabled item on click', () => {
    const fit = vi.fn();
    render(<Toolbar items={makeItems({ fit })} context={{ count: 1 }} label="T" />);
    fireEvent.click(screen.getByRole('button', { name: 'fit' }));
    expect(fit).toHaveBeenCalledOnce();
  });

  it('reflects a toggle item with aria-pressed', () => {
    const { rerender } = render(<Toolbar items={makeItems()} context={{ count: 2 }} label="T" />);
    expect(screen.getByRole('button', { name: 'grid' })).toHaveAttribute('aria-pressed', 'true');
    rerender(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" />);
    expect(screen.getByRole('button', { name: 'grid' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('disables the pen-gated group as a set when authoring is off, reason reachable, click is a no-op', () => {
    const add = vi.fn();
    render(
      <Toolbar
        items={makeItems({ add })}
        context={{ count: 1 }}
        label="T"
        authoringEnabled={false}
      />,
    );
    const addBtn = screen.getByRole('button', { name: 'add' });
    expect(addBtn).toHaveAttribute('aria-disabled', 'true');
    expect(addBtn).toHaveAttribute('title', 'Start editing to add activities');
    fireEvent.click(addBtn);
    expect(add).not.toHaveBeenCalled();
  });

  it('enables the pen-gated group when authoring is on', () => {
    const add = vi.fn();
    render(
      <Toolbar items={makeItems({ add })} context={{ count: 1 }} label="T" authoringEnabled />,
    );
    const addBtn = screen.getByRole('button', { name: 'add' });
    expect(addBtn).not.toHaveAttribute('aria-disabled');
    fireEvent.click(addBtn);
    expect(add).toHaveBeenCalledOnce();
  });

  it('renders a render-item via the escape hatch, wired to roving focus', () => {
    render(<Toolbar items={makeItems()} context={{ count: 7 }} label="T" />);
    const chip = screen.getByRole('button', { name: 'Project finish 7' });
    expect(chip).toHaveAttribute('data-toolbar-focusable');
    const fit = screen.getByRole('button', { name: 'fit' });
    fit.focus();
    fireEvent.keyDown(fit, { key: 'End' });
    expect(chip).toHaveFocus();
  });

  it('renders a presentational read-out inline but never as a roving stop', () => {
    const items = defineToolbar<Ctx>([
      { id: 'fit', group: 'frame', tier: 1, order: 0, label: 'fit', onActivate: () => {} },
      {
        id: 'finish',
        group: 'object',
        tier: 1,
        order: 0,
        label: 'Project finish',
        presentational: true,
        render: (c, api) => <span {...api.itemProps}>Finish {c.count}</span>,
      },
    ]);
    render(<Toolbar items={items} context={{ count: 3 }} label="T" />);
    const readout = screen.getByText(/Finish 3/);
    // Inline (rendered), but not focusable: no marker, pinned tabindex -1.
    expect(readout).toBeInTheDocument();
    expect(readout).toHaveAttribute('tabindex', '-1');
    expect(readout).not.toHaveAttribute('data-toolbar-focusable');
    // End jumps to the *last operable* control — the sole button, skipping the read-out.
    const fit = screen.getByRole('button', { name: 'fit' });
    fit.focus();
    fireEvent.keyDown(fit, { key: 'End' });
    expect(fit).toHaveFocus();
  });

  /**
   * **Both icon forms reach the DOM through the same path** (M5 T5.1). The registry widened `icon`
   * to `ReactNode | ((ctx) => ReactNode)`; the primitive must render each identically, and must
   * never render the raw field (a function passed to React is a component reference, which renders
   * as nothing — a silently icon-less button).
   */
  it('renders a plain icon and a ctx-resolved icon the same way, and carries aria-busy', () => {
    const items = defineToolbar<Ctx>([
      {
        id: 'plain',
        group: 'frame',
        tier: 1,
        showLabel: 'always',
        order: 0,
        label: 'plain',
        icon: <span data-testid="plain-icon" />,
        onActivate: () => {},
      },
      {
        id: 'ctx',
        group: 'frame',
        tier: 1,
        showLabel: 'always',
        order: 1,
        label: 'ctx',
        icon: (c) => <span data-testid={c.count > 0 ? 'busy-icon' : 'idle-icon'} />,
        isBusy: (c) => c.count > 0,
        onActivate: () => {},
      },
    ]);
    const { rerender } = render(<Toolbar items={items} context={{ count: 1 }} label="T" />);
    expect(screen.getByTestId('plain-icon')).toBeInTheDocument();
    expect(screen.getByTestId('busy-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ctx' })).toHaveAttribute('aria-busy', 'true');
    // Both icons sit inside the same aria-hidden decorative wrapper — the ctx form is not a
    // second rendering path with its own chrome.
    expect(screen.getByTestId('plain-icon').parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByTestId('busy-icon').parentElement).toHaveAttribute('aria-hidden', 'true');

    rerender(<Toolbar items={items} context={{ count: 0 }} label="T" />);
    expect(screen.getByTestId('idle-icon')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ctx' })).not.toHaveAttribute('aria-busy');
  });

  it('has no axe violations', async () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="Plan toolbar" />);
    expect((await axe(screen.getByRole('toolbar'))).violations).toEqual([]);
  });
});

/**
 * **The measure pass's cost, asserted in call-count shape** (ADR-0090 M5, performance gate).
 *
 * ADR-0026 §16 and `docs/TECH_DEBT.md` #75 set the doctrine for this surface: it shares a frame with
 * a canvas painter already measured at 4–6× its budget, so a claim about cost here should be a gate
 * rather than a paragraph. M3 added `setLayout(...)` inside `measure()`, which changes `resolved` →
 * `bar` → `measure`'s identity → the layout effect, i.e. an **extra synchronous pass**. The
 * performance review traced that by hand as bounded and self-terminating and then said the honest
 * next step is to assert it, because "verified by reading the code" goes stale.
 *
 * **Counting, not timing** — the ADR-0054 rule. A CI runner's milliseconds are noise; the number of
 * layout reads per settle is the thing that changes when someone adds a `getBoundingClientRect` to
 * the wrong place.
 *
 * jsdom reports zero for every box, so `measure()` takes its early-out and the absolute counts are
 * not the browser's. What the assertion pins is the **shape**: that a mount settles in a bounded
 * number of passes rather than a chain, and that a context change that alters no width does not
 * multiply them. Both are properties the code has independently of layout.
 */
