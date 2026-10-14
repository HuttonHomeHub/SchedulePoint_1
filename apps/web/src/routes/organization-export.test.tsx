import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrganizationExportScreen } from './organization-export';

import type { OrganizationExportState } from '@/features/organization-export/api/use-export-organization';

vi.mock('@tanstack/react-router', () => ({
  useParams: () => ({ orgSlug: 'acme' }),
}));

const refetch = vi.fn();
let organisations: {
  isPending: boolean;
  isError: boolean;
  data: { slug: string; role: string }[] | undefined;
  refetch: () => void;
} = { isPending: false, isError: false, data: [{ slug: 'acme', role: 'ORG_ADMIN' }], refetch };
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
  refetch.mockReset();
  organisations = {
    isPending: false,
    isError: false,
    data: [{ slug: 'acme', role: 'ORG_ADMIN' }],
    refetch,
  };
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
    organisations = { ...organisations, isPending: true, data: undefined };
    render(<OrganizationExportScreen />);

    expect(screen.getByText('Checking your access…')).toBeInTheDocument();
    expect(screen.queryByText(/Only an Org Admin/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download export' })).toBeNull();
    expect(hookSlug).not.toHaveBeenCalled();
  });

  it.each(['PLANNER', 'CONTRIBUTOR', 'VIEWER'])('tells a %s why there is no action', (role) => {
    organisations = { ...organisations, data: [{ slug: 'acme', role }] };
    render(<OrganizationExportScreen />);

    expect(screen.getByRole('status')).toHaveTextContent(
      'Only an Org Admin can export this organisation’s data.',
    );
    expect(screen.queryByRole('button', { name: 'Download export' })).toBeNull();
    expect(hookSlug).not.toHaveBeenCalled();
  });

  it('says the access check failed, not that the reader is not an admin, and offers a retry', () => {
    organisations = { ...organisations, isError: true, data: undefined };
    render(<OrganizationExportScreen />);

    expect(screen.getByRole('alert')).toHaveTextContent('We couldn’t check your access');
    expect(screen.queryByText(/Only an Org Admin/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Download export' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('says leaving the page cancels the download', () => {
    render(<OrganizationExportScreen />);

    expect(screen.getByText(/Leaving the page cancels the download\./)).toBeVisible();
  });
});
