import { WorkingWeekdays } from '@repo/types';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CalendarFormDialog } from './CalendarFormDialog';

import type * as ApiClient from '@/lib/api/client';
import { ApiFetchError, apiFetch } from '@/lib/api/client';

// Flag ON: the create-time scope choice (ADR-0053 §1). The flag-OFF parity assertions live in the
// sibling `CalendarFormDialog.test.tsx`, which imports the real (default-off) config.
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  LIBRARY_SCOPING_ENABLED: true,
}));

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetch: vi.fn(),
}));

function renderDialog(props: Partial<React.ComponentProps<typeof CalendarFormDialog>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <CalendarFormDialog orgSlug="acme" open onClose={() => {}} {...props} />
    </QueryClientProvider>,
  );
}

describe('CalendarFormDialog — scope choice (flag on)', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset().mockResolvedValue({ id: 'cal-new' });
  });

  it('offers a labelled Scope control defaulting to the shared organisation library', () => {
    renderDialog();
    const scope = screen.getByLabelText('Scope');

    expect(scope).toHaveValue('ORG');
    expect(screen.getByRole('option', { name: /Organisation \(shared library\)/ })).toBeEnabled();
    // With no project context there is nothing to scope a project calendar to.
    expect(screen.queryByRole('option', { name: /^Project/ })).not.toBeInTheDocument();
    expect(screen.getByText(/open that project and use its Calendars section/)).toBeInTheDocument();
  });

  it('offers — and defaults to — the project when opened from a project context', () => {
    renderDialog({ projectId: 'proj-1', projectName: 'Harbour Tower' });

    expect(screen.getByLabelText('Scope')).toHaveValue('PROJECT');
    expect(screen.getByRole('option', { name: 'Project: Harbour Tower' })).toBeInTheDocument();
  });

  it('sends scope + projectId when creating a project calendar', async () => {
    renderDialog({ projectId: 'proj-1', projectName: 'Harbour Tower' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Site shutdown' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const [path, init] = vi.mocked(apiFetch).mock.calls[0]!;
    expect(path).toBe('/organizations/acme/calendars');
    expect(JSON.parse(init?.body as string)).toMatchObject({
      name: 'Site shutdown',
      scope: 'PROJECT',
      projectId: 'proj-1',
    });
  });

  it('sends scope ORG and NO projectId when creating in the shared library', async () => {
    renderDialog({ projectId: 'proj-1', projectName: 'Harbour Tower' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard' } });
    fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'ORG' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.scope).toBe('ORG');
    expect(body).not.toHaveProperty('projectId');
  });

  it('explains — and blocks — instead of offering an unusable control when NO tier is reachable', () => {
    // No `calendar:manage_org` and no project context: the organisation library is the only tier
    // here and it is out of reach, so there is nothing to choose between.
    renderDialog({ canManageOrg: false });

    // A `<select>` whose every option is disabled is a control that cannot be operated — don't
    // render one; render the reason.
    expect(screen.queryByLabelText('Scope')).not.toBeInTheDocument();
    expect(
      screen.getByText(/don’t have permission to add to the shared organisation library/),
    ).toBeInTheDocument();
    // The submit is blocked too, so the planner can't fill the form and lose the work to a 403.
    expect(screen.getByRole('button', { name: 'Create calendar' })).toBeDisabled();
  });

  it('disables — but keeps — the organisation option beside a usable project option, and says why', () => {
    renderDialog({ canManageOrg: false, projectId: 'proj-1', projectName: 'Harbour Tower' });

    // Disabled, not removed: an option that silently vanishes teaches nothing.
    expect(screen.getByRole('option', { name: /Organisation \(shared library\)/ })).toBeDisabled();
    expect(
      screen.getByText(/don’t have permission to add to the shared organisation library/),
    ).toBeInTheDocument();
    // …and creating in the project still works, so the dialog is not a dead end.
    expect(screen.getByLabelText('Scope')).toHaveValue('PROJECT');
    expect(screen.getByRole('button', { name: 'Create calendar' })).toBeEnabled();
  });

  it('still sends the implied tier when the choice is suppressed', async () => {
    // canManageOrg true, no project context ⇒ one reachable tier. The control still renders (it is
    // informative), and ORG rides the body either way.
    renderDialog();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Standard' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    const body = JSON.parse(vi.mocked(apiFetch).mock.calls[0]![1]?.body as string) as Record<
      string,
      unknown
    >;
    expect(body.scope).toBe('ORG');
  });

  it('shows the tier read-only when editing (a move is a separate, confirmed act)', () => {
    renderDialog({
      calendar: {
        id: 'cal-1',
        name: 'Site shutdown',
        description: null,
        workingWeekdays: 31,
        shifts: WorkingWeekdays.toFullDayShifts(31),
        scope: 'PROJECT',
        projectId: 'proj-1',
        archivedAt: null,
        version: 3,
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
      },
      projectName: 'Harbour Tower',
    });

    expect(screen.queryByLabelText('Scope')).not.toBeInTheDocument();
    expect(screen.getByText('Project: Harbour Tower')).toBeInTheDocument();
  });

  it('maps a 422 CALENDAR_SCOPE_PROJECT_MISMATCH to its shared sentence', async () => {
    vi.mocked(apiFetch).mockRejectedValue(
      new ApiFetchError(422, {
        code: 'UNPROCESSABLE_ENTITY',
        message: 'Validation failed.',
        details: { reason: 'CALENDAR_SCOPE_PROJECT_MISMATCH' },
      }),
    );
    renderDialog({ projectId: 'proj-1', projectName: 'Harbour Tower' });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Site shutdown' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create calendar' }));

    // Plain-language copy — the message names the CHOICE, never the wire field (`projectId`).
    expect(
      await screen.findByText(/A project calendar must name the project it belongs to/),
    ).toBeInTheDocument();
  });
});
