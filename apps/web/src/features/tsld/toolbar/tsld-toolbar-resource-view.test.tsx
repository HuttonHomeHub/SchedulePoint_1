import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// The flag-ON resource-view registry (Stage E, ADR-0049): `resource-view` swaps its "Coming soon"
// placeholder for a real pressed-state toggle. The flag-off stub is covered by `tsld-toolbar.test.tsx`
// (which pins CANVAS_RESOURCE_VIEW_ENABLED off). Only this flag is forced on — the rest stay real.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  CANVAS_RESOURCE_VIEW_ENABLED: true,
}));

const spies = { toggleResourceView: vi.fn() };

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({ toggleResourceView: spies.toggleResourceView, ...over });
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

describe('TSLD toolbar — resource-view lens (flag on)', () => {
  it('is a real toggle button (not a "Coming soon" placeholder) with a pressed state', () => {
    renderRows(ctx({ resourceViewOpen: false }));
    const item = screen.getByRole('button', { name: 'Resource view' });
    // Not the disabled placeholder — enabled with a computed diagram, and a real toggle (aria-pressed).
    expect(item).not.toHaveAttribute('aria-disabled', 'true');
    expect(item).toHaveAttribute('aria-pressed', 'false');
    expect(item).not.toHaveAttribute('title', 'Resource view — Coming soon');
  });

  it('reflects the open state as pressed', () => {
    renderRows(ctx({ resourceViewOpen: true }));
    expect(screen.getByRole('button', { name: 'Resource view' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('toggles the resource strip on activation', () => {
    renderRows(ctx({ resourceViewOpen: false }));
    fireEvent.click(screen.getByRole('button', { name: 'Resource view' }));
    expect(spies.toggleResourceView).toHaveBeenCalledOnce();
  });

  it('shades — not hides — on an empty/uncomputed canvas, disabled with the shared lens reason', () => {
    renderRows(ctx({ hasDiagram: false }));
    const item = screen.getByRole('button', { name: 'Resource view' });
    expect(item).toHaveAttribute('aria-disabled', 'true');
    // The shared "Add an activity first" lens reason (not "Coming soon").
    expect(item).toHaveAttribute('title', expect.stringContaining('Add an activity first'));
    fireEvent.click(item);
    expect(spies.toggleResourceView).not.toHaveBeenCalled();
  });
});
