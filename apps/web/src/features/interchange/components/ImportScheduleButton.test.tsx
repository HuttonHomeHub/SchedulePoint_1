import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportScheduleButton } from './ImportScheduleButton';

// Mutable flag state, read through a getter so each render re-reads the current value (the component
// reads the live `SCHEDULE_INTERCHANGE_ENABLED` binding at render time). Mirrors the flag-mock pattern
// other flag-gated suites use (e.g. plan-detail.gating.test.tsx).
const h = vi.hoisted(() => ({ flagOn: true }));

vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  get SCHEDULE_INTERCHANGE_ENABLED() {
    return h.flagOn;
  },
}));

// Stub the dialog so the entry's gating is tested in isolation (no router / query deps).
vi.mock('./ImportScheduleDialog', () => ({
  ImportScheduleDialog: () => null,
}));

function renderButton(canImport: boolean) {
  return render(
    <ImportScheduleButton
      orgSlug="acme"
      projectId="proj-1"
      projectName="Tower"
      canImport={canImport}
    />,
  );
}

describe('ImportScheduleButton', () => {
  beforeEach(() => {
    h.flagOn = true;
  });

  it('renders the entry when the flag is on and the user may import', () => {
    renderButton(true);
    expect(screen.getByRole('button', { name: 'Import from file…' })).toBeInTheDocument();
  });

  it('renders nothing when the user lacks the import permission', () => {
    const { container } = renderButton(false);
    expect(screen.queryByRole('button', { name: 'Import from file…' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when the flag is off — the parity assertion (no entry)', () => {
    h.flagOn = false;
    const { container } = renderButton(true);
    expect(screen.queryByRole('button', { name: 'Import from file…' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
