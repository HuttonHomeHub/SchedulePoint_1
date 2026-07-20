import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// The flag-ON export & print registry: the `export` placeholder becomes the real Export ▾ menu-button.
// The flag-off stubs (both `export` and `print` "Coming soon") are covered by `tsld-toolbar.test.tsx`
// (which pins EXPORT_PRINT_ENABLED off).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EXPORT_PRINT_ENABLED: true,
}));

const spies = {
  exportScheduleCsv: vi.fn(),
};

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({
    exportScheduleCsv: spies.exportScheduleCsv,
    ...over,
  });
}

function renderRows(context: TsldToolbarContext) {
  const rows = splitByRow(buildTsldToolbarItems());
  return render(
    <div>
      <Toolbar
        items={rows.look}
        context={context}
        label="View and navigate"
        authoringEnabled
        alignEndGroup="object"
      />
      <Toolbar items={rows.do} context={context} label="Build and manage" authoringEnabled />
    </div>,
  );
}

beforeEach(() => vi.clearAllMocks());

describe('TSLD toolbar — export & print (flag on)', () => {
  it('renders a real Export menu-button (not the "Coming soon" placeholder)', () => {
    renderRows(ctx());
    const trigger = screen.getByRole('button', { name: /Export/ });
    expect(trigger).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('exports the whole schedule (scope "all") from the Schedule (CSV) item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Schedule (CSV)' }));
    expect(spies.exportScheduleCsv).toHaveBeenCalledWith('all');
  });

  it('hides the "Matching activities only" item when no lens is narrowing the set', () => {
    renderRows(ctx({ filterActive: false }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByRole('menuitem', { name: 'Schedule (CSV)' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: /Matching activities only/ })).toBeNull();
  });

  it('offers "Matching activities only (N)" and exports scope "matching" when a lens narrows', () => {
    renderRows(ctx({ filterActive: true, matchingCount: 3 }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    const matching = screen.getByRole('menuitem', { name: 'Matching activities only (3)' });
    fireEvent.click(matching);
    expect(spies.exportScheduleCsv).toHaveBeenCalledWith('matching');
  });

  it('shades the Export control with its reason on an empty/uncomputed canvas (shade-don’t-hide)', () => {
    renderRows(ctx({ hasDiagram: false }));
    const trigger = screen.getByRole('button', { name: /Export/ });
    expect(trigger).toHaveAttribute('aria-disabled', 'true');
    expect(trigger).toHaveAttribute('title', 'Add an activity first');
    fireEvent.click(trigger);
    // Disabled ⇒ the menu never opens, so no item is reachable.
    expect(screen.queryByRole('menuitem', { name: 'Schedule (CSV)' })).toBeNull();
  });

  it('keeps Print a "Coming soon" placeholder even with the flag on (the real button lands at M4)', () => {
    renderRows(ctx());
    const print = screen.getByRole('button', { name: 'Print…' });
    expect(print).toHaveAttribute('aria-disabled', 'true');
    expect(print).toHaveAttribute('title', 'Print… — Coming soon');
  });
});
