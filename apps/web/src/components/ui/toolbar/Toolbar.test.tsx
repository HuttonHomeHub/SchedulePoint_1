import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
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
 * Its buttons pin `labelVisibility: 'always'` so these tests exercise the labelled chrome; the
 * policy itself has its own cases under "label policy" below.
 */
function makeItems(handlers: Handlers = {}): ToolbarItem<Ctx>[] {
  return defineToolbar<Ctx>([
    {
      id: 'fit',
      group: 'frame',
      labelVisibility: 'always',
      order: 0,
      label: 'fit',
      onActivate: handlers.fit ?? (() => {}),
    },
    {
      id: 'grid',
      group: 'lens',
      labelVisibility: 'always',
      order: 0,
      label: 'grid',
      isActive: (c) => c.count % 2 === 0,
      onActivate: handlers.grid ?? (() => {}),
    },
    {
      id: 'add',
      group: 'tools',
      labelVisibility: 'always',
      order: 0,
      label: 'add',
      penGated: true,
      disabledReason: () => 'Start editing to add activities',
      onActivate: handlers.add ?? (() => {}),
    },
    {
      id: 'finish-chip',
      group: 'object',
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

  it('ungrouped: renders the same controls with no group role or name (red: prop ignored)', () => {
    render(<Toolbar items={makeItems()} context={{ count: 2 }} label="Plan toolbar" ungrouped />);
    const tb = screen.getByRole('toolbar', { name: 'Plan toolbar' });
    expect(within(tb).queryAllByRole('group')).toHaveLength(0);
    expect(within(tb).getByRole('button', { name: 'fit' })).toBeInTheDocument();
    expect(within(tb).getByRole('button', { name: 'add' })).toBeInTheDocument();
  });

  it('a labelled button with a description keeps its label in the title', () => {
    // Regression: the tooltip helper used to drop the label for a labelled item with a description,
    // showing just the bare description. It must read "<label> — <description>".
    // `labelVisibility` is declared, not inferred (TECH_DEBT #61), so a test about labelling says so.
    const items = defineToolbar<Ctx>([
      {
        id: 'fit',
        group: 'frame',
        labelVisibility: 'always',
        order: 0,
        label: 'Fit',
        description: 'Fit the diagram to the window',
        onActivate: () => {},
      },
      {
        id: 'plain',
        group: 'frame',
        labelVisibility: 'always',
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
        labelVisibility: 'never',
        order: 0,
        label: 'Fit',
        onActivate: () => {},
      },
      {
        id: 'undo',
        group: 'frame',
        labelVisibility: 'never',
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
        labelVisibility: 'never',
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

  describe('label policy — `labelVisibility` is presentation and nothing else decides it (TECH_DEBT #61)', () => {
    const defaulted = defineToolbar<Ctx>([
      { id: 'a', group: 'frame', order: 0, label: 'Alpha', onActivate: () => {} },
      { id: 'b', group: 'frame', order: 1, label: 'Beta', onActivate: () => {} },
    ]);

    // The default is `'always'`, because a surface that wraps can always afford a label. It was
    // `'auto'`, which meant "if the row can afford it" under the ladder and "yes" after it.
    it('labels an item that declares nothing, whatever its group', () => {
      render(<Toolbar items={defaulted} context={{ count: 1 }} label="T" />);
      // Labelled: the visible text IS the accessible name, so no `aria-label` overrides it.
      const alpha = screen.getByRole('button', { name: 'Alpha' });
      expect(alpha).not.toHaveAttribute('aria-label');
      expect(alpha).toHaveTextContent('Alpha');
      expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-label');
    });

    it('honours `always` / `never`', () => {
      // Two items in one group disagree: the declared policy is what separates them.
      const pinned = defineToolbar<Ctx>([
        {
          id: 'shown',
          group: 'frame',
          labelVisibility: 'always',
          order: 0,
          label: 'Shown',
          onActivate: () => {},
        },
        {
          id: 'hidden',
          group: 'frame',
          labelVisibility: 'never',
          order: 1,
          label: 'Hidden',
          onActivate: () => {},
        },
      ]);
      render(<Toolbar items={pinned} context={{ count: 1 }} label="T" />);
      expect(screen.getByRole('button', { name: 'Shown' })).not.toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: 'Hidden' })).toHaveAttribute(
        'aria-label',
        'Hidden',
      );
    });

    // `Toolbar` is not a container, so there is no `@container/deck` for the `@max-roomy/deck:`
    // variant to ask. `resolveLabelVisibility` says so in JS rather than leaving it to the absence
    // of an ancestor: a `'roomy'` item here is painted exactly like an `'always'` one, with no
    // `sr-only` class and no tooltip to carry a name nothing hides.
    it("treats `roomy` as `always` — this surface is not the deck's container", () => {
      const roomy = defineToolbar<Ctx>([
        {
          id: 'r',
          group: 'frame',
          labelVisibility: 'roomy',
          order: 0,
          label: 'Roomy',
          description: 'Says what it does',
          onActivate: () => {},
        },
      ]);
      render(<Toolbar items={roomy} context={{ count: 1 }} label="T" />);
      const button = screen.getByRole('button', { name: 'Roomy' });
      expect(button).not.toHaveAttribute('aria-label');
      const label = within(button).getByText('Roomy');
      expect(label.className).not.toMatch(/sr-only/);
      fireEvent.focus(button);
      expect(document.querySelector('[data-tooltip]')).toBeNull();
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
      { id: 'fit', group: 'frame', order: 0, label: 'fit', onActivate: () => {} },
      {
        id: 'date',
        group: 'frame',
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
      { id: 'fit', group: 'frame', order: 0, label: 'fit', onActivate: () => {} },
      {
        id: 'finish',
        group: 'object',
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
        labelVisibility: 'always',
        order: 0,
        label: 'plain',
        icon: <span data-testid="plain-icon" />,
        onActivate: () => {},
      },
      {
        id: 'ctx',
        group: 'frame',
        labelVisibility: 'always',
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
 * ADR-0026 §9 and `docs/TECH_DEBT.md` #75 set the doctrine for this surface: it shares a frame with
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

describe('arrows from the container itself', () => {
  /**
   * The state the focus handoff creates: a peer's write removed the control a reader was standing
   * on, so focus is on the `role="toolbar"` container. Their next key press must reach the FIRST
   * command — before `rovingIndexFor` it reached the second, measured, because the clamp to `0`
   * was followed by an increment. Verified red against that arithmetic.
   */
  it('lands on the first item, not the second', () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" />);
    const bar = screen.getByRole('toolbar', { name: 'T' });
    const first = bar.querySelector<HTMLElement>('[data-toolbar-item]')!;
    bar.focus();

    fireEvent.keyDown(bar, { key: 'ArrowRight' });

    expect(document.activeElement).toBe(first);
  });

  it('lands on the last item going backwards', () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" />);
    const bar = screen.getByRole('toolbar', { name: 'T' });
    const stops = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')];
    bar.focus();

    fireEvent.keyDown(bar, { key: 'ArrowLeft' });

    expect(document.activeElement).toBe(stops.at(-1));
  });
});

describe('what the container is, once focus can be on it', () => {
  /**
   * **Tab from the container** — the accessibility gate's second nit, and the likeliest second
   * keystroke after the handoff lands a reader there. Neither tier asserted it.
   *
   * jsdom does not implement sequential focus navigation, so this cannot drive a real Tab press.
   * What it pins is the property that decides where a real Tab goes: the container is not in the
   * sequence (`tabIndex` is `-1`), the single roving stop inside it is (`tabIndex` is `0`), and it
   * follows the container in document order — so a browser's next tabbable from the container is
   * that stop.
   *
   * Stated rather than glossed: this is an argument from three facts, not an observation of a key
   * press, and it is recorded that way for the same reason the AT interleaving is
   * (`docs/TECH_DEBT.md` #154).
   */
  it('is not itself a Tab stop, and contains exactly one', () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" />);
    const bar = screen.getByRole('toolbar', { name: 'T' });
    expect(bar.getAttribute('tabindex')).toBe('-1');

    const stops = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')];
    expect(stops.filter((el) => el.getAttribute('tabindex') === '0')).toHaveLength(1);
    expect(bar.contains(stops[0]!)).toBe(true);
  });
});

/**
 * **`groupOrder` (ADR-0187): the rendered order, the roving sequence and the first Tab stop are one
 * order.** The risk the prop carries is exactly a surface that SHOWS one order and WALKS another
 * (ADR-0111), so these read the DOM order and the arrow sequence from the same render.
 */
describe('groupOrder', () => {
  const ids = (bar: HTMLElement): string[] =>
    [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')].map(
      (el) => el.getAttribute('data-toolbar-item') ?? '',
    );
  const REVERSED = ['object', 'tools', 'lens', 'frame'] as const;

  it('leaves the markup byte-identical when the order is the canonical one, or absent', () => {
    const plain = render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" />);
    const absent = plain.container.innerHTML;
    plain.unmount();
    const canonical = render(
      <Toolbar
        items={makeItems()}
        context={{ count: 1 }}
        label="T"
        groupOrder={['frame', 'lens', 'tools', 'object']}
      />,
    );
    expect(canonical.container.innerHTML).toBe(absent);
  });

  it('renders the groups in the order given, and the first Tab stop is the first control shown', () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" groupOrder={REVERSED} />);
    const bar = screen.getByRole('toolbar', { name: 'T' });
    expect(ids(bar)).toEqual(['finish-chip', 'add', 'grid', 'fit']);
    const stops = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')];
    expect(stops.filter((el) => el.getAttribute('tabindex') === '0')).toEqual([stops[0]]);
  });

  it('walks ArrowRight in the order shown, and Home and End land on the ends of it', () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="T" groupOrder={REVERSED} />);
    const bar = screen.getByRole('toolbar', { name: 'T' });
    const shown = [...bar.querySelectorAll<HTMLElement>('[data-toolbar-item]')];
    shown[0]!.focus();
    const walked: (string | null)[] = [
      document.activeElement?.getAttribute('data-toolbar-item') ?? null,
    ];
    for (let i = 1; i < shown.length; i += 1) {
      fireEvent.keyDown(document.activeElement!, { key: 'ArrowRight' });
      walked.push(document.activeElement?.getAttribute('data-toolbar-item') ?? null);
    }
    expect(walked).toEqual(ids(bar));
    fireEvent.keyDown(document.activeElement!, { key: 'Home' });
    expect(document.activeElement).toBe(shown[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'End' });
    expect(document.activeElement).toBe(shown.at(-1));
  });

  it('refuses a groupOrder that is not a permutation of the registry groups', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <Toolbar
            items={makeItems()}
            context={{ count: 1 }}
            label="T"
            groupOrder={['object', 'frame']}
          />,
        ),
      ).toThrow(/permutation/);
    } finally {
      quiet.mockRestore();
    }
  });

  it('falls back to the canonical order in production and reports the violation once', () => {
    vi.stubEnv('DEV', false);
    const report = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { rerender } = render(
        <Toolbar
          items={makeItems()}
          context={{ count: 1 }}
          label="T"
          groupOrder={['object', 'frame']}
        />,
      );
      const bar = screen.getByRole('toolbar', { name: 'T' });
      expect(ids(bar)).toEqual(['fit', 'grid', 'add', 'finish-chip']);
      // A re-render with the same bad order is not a second report.
      rerender(
        <Toolbar
          items={makeItems()}
          context={{ count: 2 }}
          label="T"
          groupOrder={['object', 'frame']}
        />,
      );
      expect(report).toHaveBeenCalledTimes(1);
      expect(String(report.mock.calls[0]?.[0])).toMatch(/permutation.*canonical order/);
    } finally {
      report.mockRestore();
      vi.unstubAllEnvs();
    }
  });
});

// The same defect as `Deck` (`docs/TECH_DEBT.md` #504): an unkeyed run is keyed by its position.
describe('Toolbar — a later item survives an earlier one appearing', () => {
  const lateItems: ToolbarItem<{ show: boolean }>[] = defineToolbar<{ show: boolean }>([
    { id: 'first', group: 'frame', order: 1, label: 'First', onActivate: () => {} },
    {
      id: 'early',
      group: 'frame',
      order: 2,
      label: 'Early',
      isVisible: (ctx) => ctx.show,
      onActivate: () => {},
    },
    { id: 'later', group: 'frame', order: 3, label: 'Later', onActivate: () => {} },
  ]);

  it('keeps the same node, and its focus', () => {
    const { rerender } = render(<Toolbar items={lateItems} context={{ show: false }} label="T" />);
    const later = screen.getByRole('button', { name: 'Later' });
    later.focus();
    for (const show of [true, false]) {
      rerender(<Toolbar items={lateItems} context={{ show }} label="T" />);
      expect(screen.getByRole('button', { name: 'Later' })).toBe(later);
      expect(document.activeElement).toBe(later);
    }
  });

  it('keeps a cluster member, and its focus, when the cluster loses its first member', () => {
    const cluster = { id: 'kinds', kind: 'joined' } as const;
    const clustered = defineToolbar<{ show: boolean }>([
      {
        id: 'kind-a',
        group: 'frame',
        order: 1,
        label: 'Kind A',
        cluster,
        isVisible: (ctx) => ctx.show,
        onActivate: () => {},
      },
      { id: 'kind-b', group: 'frame', order: 2, label: 'Kind B', cluster, onActivate: () => {} },
    ]);
    const { rerender } = render(<Toolbar items={clustered} context={{ show: true }} label="T" />);
    const kindB = screen.getByRole('button', { name: 'Kind B' });
    kindB.focus();
    for (const show of [false, true]) {
      rerender(<Toolbar items={clustered} context={{ show }} label="T" />);
      expect(screen.getByRole('button', { name: 'Kind B' })).toBe(kindB);
      expect(document.activeElement).toBe(kindB);
    }
  });
});
