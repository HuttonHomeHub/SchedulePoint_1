import type { InterchangeReport } from '@repo/interchange';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as ReactRouter from '@tanstack/react-router';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImportScheduleDialog } from './ImportScheduleDialog';

import { AnnouncerProvider } from '@/components/ui/announcer';
import { MAX_UPLOAD_BYTES } from '@/features/interchange';

const h = vi.hoisted(() => ({ navigate: vi.fn() }));

vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof ReactRouter>()),
  useNavigate: () => h.navigate,
}));

const REPORT: InterchangeReport = {
  detectedFormat: 'XER',
  sourceVersion: '19.12',
  sourceFilename: 'tower.xer',
  mapped: { activities: 214, relationships: 231, calendars: 3 },
  approximations: [
    {
      kind: 'approximation',
      entity: 'activity',
      sourceRef: 'A1010',
      detail: 'constraint MSO → SNET',
    },
  ],
  repairs: [
    { kind: 'repair', entity: 'relationship', sourceRef: null, detail: 'edge A→B dropped' },
  ],
  drops: [],
};

/** A minimal `Response`-like stub for the mocked `fetch`. */
function jsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function renderDialog(onClose = vi.fn(), canManageOrgCalendars = false) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AnnouncerProvider>
        <ImportScheduleDialog
          orgSlug="acme"
          projectId="proj-1"
          projectName="Tower"
          open
          onClose={onClose}
          canManageOrgCalendars={canManageOrgCalendars}
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

function pickFile(size = 1024): void {
  const file = new File(['<xer>'], 'tower.xer', { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(screen.getByLabelText('Schedule file (.xer or .xml)'), {
    target: { files: [file] },
  });
}

describe('ImportScheduleDialog', () => {
  beforeEach(() => {
    h.navigate.mockReset();
    globalThis.fetch = vi.fn();
  });

  it('starts idle: a file picker and a shaded Confirm', () => {
    renderDialog();
    expect(screen.getByLabelText('Schedule file (.xer or .xml)')).toBeInTheDocument();
    // `aria-disabled`, not the native attribute — a natively-disabled button leaves the tab order,
    // taking any reason attached to it with it.
    expect(screen.getByRole('button', { name: 'Confirm import' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('dry-runs the picked file and renders the report (counts + repair list)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: REPORT }));
    renderDialog();
    pickFile();

    // Report shows the mapped counts and the repair finding.
    expect(await screen.findByText('214')).toBeInTheDocument();
    expect(screen.getByText(/edge A→B dropped/)).toBeInTheDocument();

    // It hit the dry-run endpoint with a multipart body (no JSON content-type).
    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    expect(url).toBe('/api/v1/organizations/acme/projects/proj-1/interchange/dry-run');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBeInstanceOf(FormData);
    expect(screen.getByRole('button', { name: 'Confirm import' })).toHaveAttribute(
      'aria-disabled',
      'false',
    );
  });

  it('confirm → commit hits the commit endpoint, opens the plan, and closes', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { data: REPORT }))
      .mockResolvedValueOnce(jsonResponse(201, { data: { planId: 'plan-9', report: REPORT } }));
    const { onClose } = renderDialog();
    pickFile();
    await screen.findByText('214');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));

    await waitFor(() => expect(h.navigate).toHaveBeenCalled());
    const commitUrl = vi.mocked(fetch).mock.calls[1]![0];
    expect(commitUrl).toBe('/api/v1/organizations/acme/projects/proj-1/interchange/commit');
    expect(h.navigate).toHaveBeenCalledWith({
      to: '/orgs/$orgSlug/plans/$planId',
      params: { orgSlug: 'acme', planId: 'plan-9' },
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('announces the resolved dry-run report to the live region (WCAG 4.1.3)', async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: REPORT }));
    renderDialog();
    pickFile();

    await screen.findByText('214');
    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'Report ready — 214 activities, 231 relationships mapped.',
      ),
    );
  });

  it('announces the committed import to the live region (WCAG 4.1.3)', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(jsonResponse(200, { data: REPORT }))
      .mockResolvedValueOnce(jsonResponse(201, { data: { planId: 'plan-9', report: REPORT } }));
    renderDialog();
    pickFile();
    await screen.findByText('214');

    fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));

    await waitFor(() =>
      expect(screen.getByTestId('announcer')).toHaveTextContent(
        'Imported schedule — 214 activities. Opening the plan.',
      ),
    );
  });

  it('surfaces a friendly reject message on a 422 UNPARSEABLE_FILE (nothing created)', async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(422, {
        error: {
          code: 'VALIDATION_FAILED',
          message: 'unparseable',
          details: { reason: 'UNPARSEABLE_FILE' },
        },
      }),
    );
    renderDialog();
    pickFile();

    expect(await screen.findByRole('alert')).toHaveTextContent(/Primavera P6/);
    expect(screen.getByRole('button', { name: 'Confirm import' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('blocks an oversize file client-side with a friendly message and no upload', () => {
    renderDialog();
    pickFile(MAX_UPLOAD_BYTES + 1);
    expect(screen.getByRole('alert')).toHaveTextContent(/16 MiB/);
    expect(fetch).not.toHaveBeenCalled();
  });

  /**
   * The calendar-tier import option (ADR-0053 §5, closing TECH_DEBT #55). The safe default —
   * imported calendars belong to the target project — must ride in the request as an ABSENT field,
   * so the flag-off/unpermitted path is byte-for-byte the pre-ADR-0053 upload.
   */
  describe('global-calendar tier option', () => {
    const scopeOf = (call: number): FormDataEntryValue | null =>
      (vi.mocked(fetch).mock.calls[call]![1]!.body as FormData).get('globalCalendarScope');

    it('is offered only to a holder of calendar:manage_org', () => {
      renderDialog(vi.fn(), false);
      expect(screen.queryByLabelText(/organisation library/i)).not.toBeInTheDocument();
      renderDialog(vi.fn(), true);
      expect(screen.getAllByLabelText(/organisation library/i).length).toBeGreaterThan(0);
    });

    it('omits the field entirely at the safe default', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: REPORT }));
      renderDialog(vi.fn(), true);
      pickFile();
      await screen.findByText('214');
      expect(scopeOf(0)).toBeNull();
    });

    it('sends ORG when ticked, and re-runs the dry-run so the report matches the choice', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: REPORT }));
      renderDialog(vi.fn(), true);
      pickFile();
      await screen.findByText('214');

      fireEvent.click(screen.getByLabelText(/organisation library/i));

      // A second dry-run fires — confirming a report that described the OTHER choice would be a lie.
      await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBe(2));
      expect(vi.mocked(fetch).mock.calls[1]![0]).toContain('/interchange/dry-run');
      expect(scopeOf(1)).toBe('ORG');
    });

    it('carries the same choice through to the commit', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, { data: REPORT }))
        .mockResolvedValueOnce(jsonResponse(200, { data: REPORT }))
        .mockResolvedValueOnce(jsonResponse(200, { data: { planId: 'plan-9', report: REPORT } }));
      renderDialog(vi.fn(), true);
      pickFile();
      await screen.findByText('214');
      fireEvent.click(screen.getByLabelText(/organisation library/i));
      await waitFor(() => expect(vi.mocked(fetch).mock.calls.length).toBe(2));

      fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
      await waitFor(() => expect(h.navigate).toHaveBeenCalled());
      expect(vi.mocked(fetch).mock.calls[2]![0]).toContain('/interchange/commit');
      expect(scopeOf(2)).toBe('ORG');
    });
  });

  describe('resource-name collisions (ADR-0050)', () => {
    const COLLIDING: InterchangeReport = {
      ...REPORT,
      resourceCollisions: [
        {
          resourceKey: 'RSRC:RA',
          name: 'Site Crew',
          code: 'CREW-Z',
          existing: { id: 'res-1', name: 'Site Crew', code: 'CREW-A', archived: false },
        },
      ],
    };

    /** The `resourceResolutions` field of the Nth fetch call, parsed back from its JSON string. */
    function resolutionsOf(callIndex: number): unknown {
      const body = vi.mocked(fetch).mock.calls[callIndex]![1]!.body as FormData;
      const raw = body.get('resourceResolutions');
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
    }

    it('blocks Confirm with a reason until every collision is answered', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: COLLIDING }));
      renderDialog();
      pickFile();
      await screen.findByText('214');

      const confirm = screen.getByRole('button', { name: 'Confirm import' });
      expect(confirm).toHaveAttribute('aria-disabled', 'true');
      // Blocked, but the reason is attached to the control rather than only sitting near it — a
      // natively-disabled button would take both itself and the reason out of the tab order.
      const reasonId = confirm.getAttribute('aria-describedby');
      expect(reasonId).toBeTruthy();
      expect(document.getElementById(reasonId!)).toHaveTextContent(/Answer the resource above/);

      fireEvent.click(screen.getByRole('radio', { name: 'Use the existing one' }));
      expect(screen.getByRole('button', { name: 'Confirm import' })).toHaveAttribute(
        'aria-disabled',
        'false',
      );
    });

    it('sends the answers with the commit', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, { data: COLLIDING }))
        .mockResolvedValueOnce(
          jsonResponse(200, { data: { planId: 'plan-9', report: COLLIDING } }),
        );
      renderDialog();
      pickFile();
      await screen.findByText('214');

      fireEvent.click(screen.getByRole('radio', { name: 'Import a copy' }));
      fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));

      await waitFor(() => expect(h.navigate).toHaveBeenCalled());
      expect(vi.mocked(fetch).mock.calls[1]![0]).toContain('/interchange/commit');
      expect(resolutionsOf(1)).toEqual({ 'RSRC:RA': 'CREATE_COPY' });
    });

    it('names the library row it clashes with, so a planner can tell if it is the same crew', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: COLLIDING }));
      renderDialog();
      pickFile();

      expect(await screen.findByText(/Already in this organisation as CREW-A/)).toBeInTheDocument();
    });

    it('sends no resolutions field at all when the report reported no collisions', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(jsonResponse(200, { data: REPORT }))
        .mockResolvedValueOnce(jsonResponse(200, { data: { planId: 'plan-9', report: REPORT } }));
      renderDialog();
      pickFile();
      await screen.findByText('214');

      fireEvent.click(screen.getByRole('button', { name: 'Confirm import' }));
      await waitFor(() => expect(h.navigate).toHaveBeenCalled());
      // Byte-for-byte the pre-collision request — an absent field is the server's own default path.
      expect(
        (vi.mocked(fetch).mock.calls[1]![1]!.body as FormData).has('resourceResolutions'),
      ).toBe(false);
    });

    it('discards answers when the report is re-fetched — they belonged to the old one', async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { data: COLLIDING }));
      renderDialog();
      pickFile();
      await screen.findByText('214');
      fireEvent.click(screen.getByRole('radio', { name: 'Use the existing one' }));
      expect(screen.getByRole('button', { name: 'Confirm import' })).toHaveAttribute(
        'aria-disabled',
        'false',
      );

      pickFile(2048); // a different file — a new report, and the old answer must not ride along
      await waitFor(() =>
        expect(screen.getByRole('button', { name: 'Confirm import' })).toHaveAttribute(
          'aria-disabled',
          'true',
        ),
      );
    });
  });
});
