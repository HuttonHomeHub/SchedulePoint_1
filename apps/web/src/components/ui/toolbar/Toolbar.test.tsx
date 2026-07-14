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

/** A registry exercising groups 1/2/4/5, a pen-gated item, a toggle, and a render escape-hatch. */
function makeItems(handlers: Handlers = {}): ToolbarItem<Ctx>[] {
  return defineToolbar<Ctx>([
    {
      id: 'fit',
      group: 'frame',
      tier: 1,
      order: 0,
      label: 'fit',
      onActivate: handlers.fit ?? (() => {}),
    },
    {
      id: 'grid',
      group: 'lens',
      tier: 1,
      order: 0,
      label: 'grid',
      isActive: (c) => c.count % 2 === 0,
      onActivate: handlers.grid ?? (() => {}),
    },
    {
      id: 'add',
      group: 'tools',
      tier: 1,
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

  it('has no axe violations', async () => {
    render(<Toolbar items={makeItems()} context={{ count: 1 }} label="Plan toolbar" />);
    expect((await axe(screen.getByRole('toolbar'))).violations).toEqual([]);
  });
});
