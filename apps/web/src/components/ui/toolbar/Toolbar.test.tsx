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

  describe('label policy — `showLabel` is presentation, `tier` is priority (TECH_DEBT #61)', () => {
    /** Render with a stubbed container width; jsdom lays nothing out, so this is the only input. */
    function renderAtWidth(width: number, items: ToolbarItem<Ctx>[]) {
      const spy = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(width);
      const utils = render(<Toolbar items={items} context={{ count: 1 }} label="T" />);
      return { ...utils, restore: () => spy.mockRestore() };
    }

    const autoItems = defineToolbar<Ctx>([
      { id: 'a', group: 'frame', tier: 1, order: 0, label: 'Alpha', onActivate: () => {} },
      { id: 'b', group: 'frame', tier: 2, order: 1, label: 'Beta', onActivate: () => {} },
    ]);

    it('labels `auto` items when the row measurably has room', () => {
      const { restore } = renderAtWidth(1200, autoItems);
      // A labelled button carries its name as text, so it needs no `aria-label` to be reachable.
      expect(screen.getByRole('button', { name: 'Alpha' })).not.toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: 'Beta' })).not.toHaveAttribute('aria-label');
      restore();
    });

    it('keeps `auto` items icon-only when the row does not', () => {
      const { restore } = renderAtWidth(40, autoItems);
      // Icon-only: the name reaches AT through `aria-label` + the hover `title` instead.
      expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('aria-label', 'Alpha');
      expect(screen.getByRole('button', { name: 'Alpha' })).toHaveAttribute('title', 'Alpha');
      restore();
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
      const { restore } = renderAtWidth(20, pinned);
      expect(screen.getByRole('button', { name: 'Shown' })).not.toHaveAttribute('aria-label');
      expect(screen.getByRole('button', { name: 'Hidden' })).toHaveAttribute(
        'aria-label',
        'Hidden',
      );
      restore();
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

  describe('the row chrome is charged only where the width is imposed (ADR-0090 M1)', () => {
    /**
     * **A shrink-to-fit row can never need demotion.** Its `clientWidth` *is* its content, so "does
     * the content fit?" is always yes by construction — and charging it the honest-budget chrome
     * makes the answer falsely no by exactly the chrome.
     *
     * This shipped for one CI round. The chrome charge landed on all three `<Toolbar>` instances,
     * and the third is the floating selection bar (`selection-actions.tsx:395`), which shrink-wraps.
     * `e2e-library` timed out clicking **Resources**, because that command had been pushed into the
     * `⋯` on a bar with no width problem at all. jsdom could not have caught it — it has no layout —
     * so this test mocks the two readings the decision actually depends on.
     */
    const three = defineToolbar<Ctx>([
      {
        id: 'a',
        group: 'frame',
        tier: 2,
        order: 0,
        showLabel: 'never',
        label: 'A',
        onActivate: () => {},
      },
      {
        id: 'b',
        group: 'frame',
        tier: 2,
        order: 1,
        showLabel: 'never',
        label: 'B',
        onActivate: () => {},
      },
      {
        id: 'c',
        group: 'frame',
        tier: 2,
        order: 2,
        showLabel: 'never',
        label: 'C',
        onActivate: () => {},
      },
    ]);

    /**
     * 3 × 100 px of items in a 320 px row: they fit on widths alone, and do not once the derived
     * chrome (two gaps + the residual) is added. That is the exact window the bug lived in.
     */
    function renderWith(flexGrow: string) {
      const width = vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(320);
      const rect = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
        width: 100,
        height: 36,
        top: 0,
        left: 0,
        right: 100,
        bottom: 36,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      });
      // Delegate to the real implementation and override one property. Replacing the whole object
      // breaks Testing Library's accessible-name computation, which calls `getPropertyValue` —
      // the first version of this test did exactly that and failed for a reason unrelated to the
      // behaviour under test.
      const real = window.getComputedStyle.bind(window);
      const computed = vi
        .spyOn(window, 'getComputedStyle')
        .mockImplementation((el: Element, pseudo?: string | null) => {
          const style = real(el, pseudo ?? undefined);
          return new Proxy(style, {
            get: (target, key) =>
              key === 'flexGrow'
                ? flexGrow
                : typeof Reflect.get(target, key) === 'function'
                  ? Reflect.get(target, key).bind(target)
                  : Reflect.get(target, key),
          });
        });
      const utils = render(<Toolbar items={three} context={{ count: 1 }} label="T" />);
      return {
        ...utils,
        restore: () => {
          width.mockRestore();
          rect.mockRestore();
          computed.mockRestore();
        },
      };
    }

    it('demotes when the row fills its container, because the chrome is real there', () => {
      const { restore } = renderWith('1');
      expect(screen.getByRole('button', { name: 'More toolbar actions' })).toBeInTheDocument();
      restore();
    });

    it('demotes nothing when the row sizes to its own content', () => {
      // The regression: `flex-grow: 0` means the width came FROM the content, so there is no
      // deficit to pay and no command should move into the `⋯`.
      const { restore } = renderWith('0');
      expect(screen.queryByRole('button', { name: 'More toolbar actions' })).toBeNull();
      expect(screen.getByRole('button', { name: 'C' })).toBeInTheDocument();
      restore();
    });
  });
});
