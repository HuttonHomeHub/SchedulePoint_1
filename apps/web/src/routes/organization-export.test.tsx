import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationExportScreen } from './organization-export';

import type { OrganizationExportState } from '@/features/organization-export/api/use-export-organization';
import { formatBytes } from '@/features/organization-export/model/format-bytes';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
}));

let organisations: { isPending: boolean; data: { slug: string; role: string }[] | undefined } = {
  isPending: false,
  data: [{ slug: 'acme', role: 'ORG_ADMIN' }],
};
vi.mock('@/features/organizations', () => ({
  useOrganizations: () => organisations,
}));

const start = vi.fn();
const cancel = vi.fn();
let exportState: OrganizationExportState = { status: 'idle' };
const hookSlug = vi.fn();
vi.mock('@/features/organization-export/api/use-export-organization', () => ({
  useExportOrganization: (slug: string) => {
    hookSlug(slug);
    return { state: exportState, start, cancel };
  },
}));

beforeEach(() => {
  start.mockReset();
  cancel.mockReset();
  hookSlug.mockReset();
  exportState = { status: 'idle' };
  organisations = { isPending: false, data: [{ slug: 'acme', role: 'ORG_ADMIN' }] };
});

describe('OrganizationExportScreen', () => {
  it('shows an Org Admin the action and what is and is not in the file', () => {
    render(<OrganizationExportScreen />);

    expect(
      screen.getByRole('heading', { level: 1, name: 'Export organisation data' }),
    ).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download export' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'What is included' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'What is not included' })).toBeVisible();
    expect(screen.getByText(/Passwords, sign-in sessions/)).toBeVisible();
  });

  it('starts the export from the button and never marks anything disabled', () => {
    render(<OrganizationExportScreen />);
    const button = screen.getByRole('button', { name: 'Download export' });

    fireEvent.click(button);

    expect(start).toHaveBeenCalledTimes(1);
    expect(document.querySelectorAll('[disabled]')).toHaveLength(0);
  });

  it('is a loading state, not a refusal, while the role is unknown', () => {
    organisations = { isPending: true, data: undefined };
    render(<OrganizationExportScreen />);

    expect(screen.getByText('Checking your access…')).toBeInTheDocument();
    expect(screen.queryByText(/Only an Org Admin/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download export' })).toBeNull();
    expect(hookSlug).not.toHaveBeenCalled();
  });

  it.each(['PLANNER', 'CONTRIBUTOR', 'VIEWER'])('tells a %s why there is no action', (role) => {
    organisations = { isPending: false, data: [{ slug: 'acme', role }] };
    render(<OrganizationExportScreen />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Only an Org Admin can export this organisation’s data.',
    );
    expect(screen.queryByRole('button', { name: 'Download export' })).toBeNull();
    expect(hookSlug).not.toHaveBeenCalled();
  });

  it('turns the same button into Cancel while busy and reports the bytes received', () => {
    exportState = { status: 'busy', bytes: 3_200_000 };
    render(<OrganizationExportScreen />);

    expect(screen.queryByRole('button', { name: 'Download export' })).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing your export… 3.2 MB received');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(start).not.toHaveBeenCalled();
  });

  it('keeps the very same button element across Download and Cancel, so focus survives', () => {
    const { rerender } = render(<OrganizationExportScreen />);
    const before = screen.getByRole('button', { name: 'Download export' });
    before.focus();

    exportState = { status: 'busy', bytes: 0 };
    rerender(<OrganizationExportScreen />);

    const after = screen.getByRole('button', { name: 'Cancel' });
    expect(after).toBe(before);
    expect(after).toHaveFocus();
  });

  it('says Downloaded when finished', () => {
    exportState = { status: 'done', filename: 'schedulepoint-export-acme.zip', bytes: 12_345_678 };
    render(<OrganizationExportScreen />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Downloaded schedulepoint-export-acme.zip (12.3 MB).',
    );
    expect(screen.getByRole('button', { name: 'Download export' })).toBeVisible();
  });

  it('says Export cancelled after a cancel', () => {
    exportState = { status: 'cancelled' };
    render(<OrganizationExportScreen />);

    expect(screen.getByRole('status')).toHaveTextContent('Export cancelled.');
  });

  it('announces a failure once, as an alert, and leaves the status line empty', () => {
    exportState = {
      status: 'error',
      message: 'Too many exports in a short time. Try again in a few minutes.',
    };
    render(<OrganizationExportScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent('Too many exports in a short time.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Download export' })).toBeVisible();
  });
});

describe('formatBytes', () => {
  it('uses decimal units, as a file manager does', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(1500)).toBe('1.5 kB');
    expect(formatBytes(3_200_000)).toBe('3.2 MB');
    expect(formatBytes(2_500_000_000)).toBe('2.5 GB');
    expect(formatBytes(5_000_000_000_000)).toBe('5000.0 GB');
  });
});
