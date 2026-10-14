import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  organizationExportErrorMessage,
  PROGRESS_INTERVAL_MS,
  useExportOrganization,
} from './use-export-organization';

const downloadBlob = vi.hoisted(() => vi.fn());
vi.mock('@/lib/download-blob', () => ({ downloadBlob }));

/** A body that hands out `chunks`, then either ends or fails, so a mid-stream drop is testable. */
function streamOf(chunks: Uint8Array[], failAfter?: Error): ReadableStream<Uint8Array> {
  let index = 0;
  return new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[index];
      if (next !== undefined) {
        index += 1;
        controller.enqueue(next);
      } else if (failAfter !== undefined) {
        controller.error(failAfter);
      } else {
        controller.close();
      }
    },
  });
}

function zipResponse(chunks: Uint8Array[], failAfter?: Error): Response {
  return new Response(streamOf(chunks, failAfter), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': 'attachment; filename="schedulepoint-export-acme-20261014T0930Z.zip"',
    },
  });
}

function refusal(status: number, details?: unknown): Response {
  return new Response(
    JSON.stringify({ error: { code: 'X', message: 'raw server text', details } }),
    { status, headers: { 'Content-Type': 'application/json' } },
  );
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock);
  downloadBlob.mockReset();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('organizationExportErrorMessage', () => {
  it('gives the server-wide cap its own sentence, distinct from this organisation exporting', () => {
    const busy = organizationExportErrorMessage(409, 'EXPORT_BUSY');
    const inProgress = organizationExportErrorMessage(409, 'EXPORT_IN_PROGRESS');
    expect(busy).toMatch(/server is busy/i);
    expect(inProgress).toMatch(/already being prepared for this organisation/i);
    expect(organizationExportErrorMessage(409)).toBe(inProgress);
  });

  it('maps the other refusals to the spec copy', () => {
    expect(organizationExportErrorMessage(403)).toMatch(/Only an Org Admin/);
    expect(organizationExportErrorMessage(404)).toBe('This organisation was not found.');
    expect(organizationExportErrorMessage(429)).toMatch(/Too many exports/);
    expect(organizationExportErrorMessage(500)).toMatch(/could not be prepared/);
    expect(organizationExportErrorMessage(503)).toMatch(/could not be prepared/);
    expect(organizationExportErrorMessage(0)).toMatch(/reach the server/);
  });
});

describe('useExportOrganization', () => {
  it('POSTs with credentials, saves the bytes under the server’s filename, and reports done', async () => {
    fetchMock.mockResolvedValue(
      zipResponse([new Uint8Array([0x50, 0x4b]), new Uint8Array([3, 4])]),
    );
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.status).toBe('done'));

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/organizations\/acme\/export$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, filename] = downloadBlob.mock.calls[0] as [Blob, string];
    expect(filename).toBe('schedulepoint-export-acme-20261014T0930Z.zip');
    expect(blob.size).toBe(4);
    expect(result.current.state).toEqual({
      status: 'done',
      filename: 'schedulepoint-export-acme-20261014T0930Z.zip',
      bytes: 4,
    });
  });

  it.each([
    [403, undefined, /Only an Org Admin/],
    [404, undefined, /not found/],
    [409, { reason: 'EXPORT_IN_PROGRESS' }, /already being prepared/],
    [409, { reason: 'EXPORT_BUSY' }, /server is busy/],
    [429, undefined, /Too many exports/],
    [500, undefined, /could not be prepared/],
  ])('shows the mapped copy for a %i refusal and saves nothing', async (status, details, copy) => {
    fetchMock.mockResolvedValue(refusal(status, details));
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    expect(result.current.state).toMatchObject({ message: expect.stringMatching(copy) });
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('does not show a raw server message for a body that is not our envelope', async () => {
    fetchMock.mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    expect(result.current.state).toMatchObject({
      message: expect.stringMatching(/could not be prepared/),
    });
  });

  it('reports a network failure before any response as unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    expect(result.current.state).toMatchObject({
      message: expect.stringMatching(/reach the server/),
    });
  });

  it('treats a mid-stream failure as stopped and saves nothing', async () => {
    fetchMock.mockResolvedValue(
      zipResponse([new Uint8Array([1, 2, 3])], new TypeError('network error')),
    );
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.status).toBe('error'));

    expect(result.current.state).toMatchObject({
      message: 'The download stopped before it finished. Nothing was saved. Try again.',
    });
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('returns to a cancelled rest state when Cancel aborts the request', async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    expect(result.current.state).toEqual({ status: 'busy', bytes: 0 });
    act(() => result.current.cancel());
    await waitFor(() => expect(result.current.state.status).toBe('cancelled'));

    expect(downloadBlob).not.toHaveBeenCalled();
    // And it can be started again.
    fetchMock.mockResolvedValue(zipResponse([new Uint8Array([1])]));
    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.status).toBe('done'));
  });

  it('aborts the request on unmount and does not save', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined;
          signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const { result, unmount } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    unmount();

    expect(signal?.aborted).toBe(true);
    await Promise.resolve();
    expect(downloadBlob).not.toHaveBeenCalled();
  });

  it('ignores a second start while one is running', () => {
    fetchMock.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    act(() => result.current.start());

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('updates the byte count at most once per interval', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-14T09:30:00Z'));
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const chunk = new Uint8Array(1000);
    const body = new ReadableStream<Uint8Array>({
      async pull(controller) {
        // First two chunks inside one interval, then the clock moves, then a third.
        controller.enqueue(chunk);
        controller.enqueue(chunk);
        await gate;
        controller.enqueue(chunk);
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(
      new Response(body, { status: 200, headers: { 'Content-Type': 'application/zip' } }),
    );
    const { result } = renderHook(() => useExportOrganization('acme'));

    act(() => result.current.start());
    await waitFor(() => expect(result.current.state.status).toBe('busy'));
    // Two chunks have arrived inside the interval: still the initial 0.
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.state).toEqual({ status: 'busy', bytes: 0 });

    vi.setSystemTime(Date.now() + PROGRESS_INTERVAL_MS + 1);
    await act(async () => {
      release?.();
      await Promise.resolve();
    });
    await waitFor(() => expect(result.current.state.status).toBe('done'));
    // The fallback filename applies when the server sends no Content-Disposition.
    expect(downloadBlob.mock.calls[0]?.[1]).toBe('schedulepoint-export-acme.zip');
    expect(result.current.state).toMatchObject({ bytes: 3000 });
  });
});
