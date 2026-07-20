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

function renderDialog(onClose = vi.fn()) {
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
        />
      </AnnouncerProvider>
    </QueryClientProvider>,
  );
  return { onClose };
}

function pickFile(size = 1024): void {
  const file = new File(['<xer>'], 'tower.xer', { type: 'text/plain' });
  Object.defineProperty(file, 'size', { value: size });
  fireEvent.change(screen.getByLabelText('Schedule file (.xer)'), { target: { files: [file] } });
}

describe('ImportScheduleDialog', () => {
  beforeEach(() => {
    h.navigate.mockReset();
    globalThis.fetch = vi.fn();
  });

  it('starts idle: a file picker and a disabled Confirm', () => {
    renderDialog();
    expect(screen.getByLabelText('Schedule file (.xer)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
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
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeEnabled();
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

    expect(await screen.findByRole('alert')).toHaveTextContent(/Primavera XER/);
    expect(screen.getByRole('button', { name: 'Confirm import' })).toBeDisabled();
  });

  it('blocks an oversize file client-side with a friendly message and no upload', () => {
    renderDialog();
    pickFile(MAX_UPLOAD_BYTES + 1);
    expect(screen.getByRole('alert')).toHaveTextContent(/16 MiB/);
    expect(fetch).not.toHaveBeenCalled();
  });
});
