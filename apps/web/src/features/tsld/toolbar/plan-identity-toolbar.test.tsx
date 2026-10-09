import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

/**
 * **The plan's identity row** (toolbar-redesign M2-T1): Plan summary and Edit plan details, two
 * registered items rendered by their own `Toolbar` named "Plan details".
 *
 * They were a deck popover (`Summary ▾`) and a hand-rolled header pencil; the move makes both
 * registry items, so what is asserted here is what a registry item owes and the pencil never had:
 * a name, a purpose tooltip, a gate, and a roving model of its own.
 *
 * **Its blind spot, stated**: jsdom has no layout, so that the header holds one line at 1024 is
 * `e2e-workspace-fit/pen-status.spec.ts`'s, and that focus really returns to the trigger across a
 * real portal is the journey's too. The ARIA state and the tooltip's lifecycle are what this proves.
 */

const editPlan = vi.fn();

function renderIdentity(over: Partial<TsldToolbarContext> = {}) {
  const rows = splitByRow(buildTsldToolbarItems());
  const context = makeTsldToolbarContext({ editPlan, ...over });
  return render(
    <Toolbar
      items={rows.identity}
      context={context}
      label="Plan details"
      groupLabels={{ object: 'About this plan' }}
    />,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('the identity row', () => {
  it('is its own toolbar holding exactly the two plan facts, in group `object`', () => {
    const rows = splitByRow(buildTsldToolbarItems());
    expect(rows.identity.map((item) => item.id)).toEqual(['summary', 'edit-plan']);
    for (const item of rows.identity) expect(item.group).toBe('object');

    renderIdentity();
    const toolbar = screen.getByRole('toolbar', { name: 'Plan details' });
    expect(within(toolbar).getByRole('group', { name: 'About this plan' })).toBeInTheDocument();
    // One Tab stop: exactly one of the two controls is tabbable.
    const tabbable = within(toolbar)
      .getAllByRole('button')
      .filter((button) => button.getAttribute('tabindex') === '0');
    expect(tabbable).toHaveLength(1);
  });

  it('names Summary "Plan summary", and reports its panel as a dialog it controls', () => {
    renderIdentity();
    const trigger = screen.getByRole('button', { name: 'Plan summary' });
    expect(trigger).toHaveAttribute('aria-haspopup', 'dialog');
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    // Icon-only: the name is `aria-label`, there is no painted word.
    expect(trigger).toHaveAttribute('aria-label', 'Plan summary');

    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByTestId('summary-body')).toBeInTheDocument();
  });

  it('returns focus to the trigger when Escape closes the panel', () => {
    renderIdentity();
    const trigger = screen.getByRole('button', { name: 'Plan summary' });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByTestId('summary-body')).toBeInTheDocument();
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(screen.queryByTestId('summary-body')).not.toBeInTheDocument();
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    expect(trigger).toHaveFocus();
  });

  it('tips its purpose on focus, with the tooltip primitive and no native title', () => {
    renderIdentity();
    const trigger = screen.getByRole('button', { name: 'Plan summary' });
    expect(trigger).not.toHaveAttribute('title');
    trigger.focus();
    fireEvent.focus(trigger);
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Plan summary — Status, data date and the schedule at a glance');
    // A tip that says more than the name is linked to the control (ADR-0117's `'description'`).
    expect(trigger).toHaveAccessibleDescription(/status, data date/i);
    // Escape dismisses it with focus unmoved (WCAG 1.4.13), and blur does too.
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('stands the tooltip down while the panel it opened is showing', () => {
    renderIdentity();
    const trigger = screen.getByRole('button', { name: 'Plan summary' });
    trigger.focus();
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });

  it('offers Edit plan details to a writer, and runs the context callback', () => {
    renderIdentity();
    fireEvent.click(screen.getByRole('button', { name: 'Edit plan details' }));
    expect(editPlan).toHaveBeenCalledOnce();
    // The old name is gone: it sat one word from the pen's "Start editing".
    expect(screen.queryByRole('button', { name: 'Edit plan' })).not.toBeInTheDocument();
  });

  it('omits Edit plan details for a reader who cannot write, rather than shading it', () => {
    renderIdentity({ editPlan: null });
    expect(screen.queryByRole('button', { name: 'Edit plan details' })).not.toBeInTheDocument();
    // Summary is a plan fact for every role.
    expect(screen.getByRole('button', { name: 'Plan summary' })).toBeInTheDocument();
  });
});
