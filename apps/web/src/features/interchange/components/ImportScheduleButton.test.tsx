import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ImportScheduleButton } from './ImportScheduleButton';

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
  it('renders the entry when the user may import', () => {
    renderButton(true);
    expect(screen.getByRole('button', { name: 'Import from file…' })).toBeInTheDocument();
  });

  it('renders nothing when the user lacks the import permission', () => {
    const { container } = renderButton(false);
    expect(screen.queryByRole('button', { name: 'Import from file…' })).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });
});
