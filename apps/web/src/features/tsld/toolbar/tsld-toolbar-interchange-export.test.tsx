import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import type { TsldToolbarContext } from './tsld-toolbar-context';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Toolbar, splitByRow } from '@/components/ui/toolbar';

// Flag-ON: the Export ▾ menu is real (EXPORT_PRINT_ENABLED) AND schedule interchange is on
// (SCHEDULE_INTERCHANGE_ENABLED), so the menu's "Interchange" group renders when the caller also holds
// the permission (`canInterchangeExport`). The permission-off / flag-off "hidden" case is proven by
// toggling `canInterchangeExport` below (in production it is `flag && interchange:export`).
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  EXPORT_PRINT_ENABLED: true,
  SCHEDULE_INTERCHANGE_ENABLED: true,
}));

const exportInterchange = vi.fn();

function ctx(over: Partial<TsldToolbarContext> = {}): TsldToolbarContext {
  return makeTsldToolbarContext({ exportInterchange, canInterchangeExport: true, ...over });
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

describe('TSLD toolbar — schedule interchange export (flag + permission on)', () => {
  it('offers the P6 (.xer) and MS Project (.xml) items in the Export menu when both gates pass', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    expect(screen.getByRole('menuitem', { name: 'Primavera P6 (.xer)' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Microsoft Project (.xml)' })).toBeInTheDocument();
  });

  it('exports the plan as XER from the P6 item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Primavera P6 (.xer)' }));
    expect(exportInterchange).toHaveBeenCalledWith('xer');
  });

  it('exports the plan as MSPDI from the MS Project item', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Microsoft Project (.xml)' }));
    expect(exportInterchange).toHaveBeenCalledWith('mspdi');
  });

  it('keeps the Stage-C1 CSV/PNG/PDF items alongside the interchange group', () => {
    renderRows(ctx());
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    // Sanity: the interchange group is ADDED to the existing menu, not a replacement.
    expect(screen.getByRole('menuitem', { name: 'Schedule (CSV)' })).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'Diagram — whole plan (PNG)' }),
    ).toBeInTheDocument();
  });

  it('hides both interchange items when the caller lacks interchange:export', () => {
    renderRows(ctx({ canInterchangeExport: false }));
    fireEvent.click(screen.getByRole('button', { name: /Export/ }));
    // The CSV item still renders (the Export menu itself is unaffected)…
    expect(screen.getByRole('menuitem', { name: 'Schedule (CSV)' })).toBeInTheDocument();
    // …but the interchange group is gone.
    expect(screen.queryByRole('menuitem', { name: 'Primavera P6 (.xer)' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Microsoft Project (.xml)' })).toBeNull();
  });
});
