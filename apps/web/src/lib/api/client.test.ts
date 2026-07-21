import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { apiFetchAllPages } from './client';

/**
 * Regression tests for {@link apiFetchAllPages} — the paging helper the plan workspace uses so the
 * canvas/table/logic load the WHOLE plan, not just the endpoint's default 20-row page (which left a
 * large imported plan showing ~20 of 144 activities with no logic drawn). It must follow
 * `meta.nextCursor` to exhaustion and concatenate every page's rows in order.
 */
function page(data: unknown[], meta: { nextCursor: string | null; hasMore: boolean }): Response {
  return new Response(JSON.stringify({ data, meta }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('apiFetchAllPages', () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it('follows the cursor across pages and concatenates every row in order', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(page([{ id: 'a' }, { id: 'b' }], { nextCursor: 'b', hasMore: true }))
      .mockResolvedValueOnce(page([{ id: 'c' }, { id: 'd' }], { nextCursor: 'd', hasMore: true }))
      .mockResolvedValueOnce(page([{ id: 'e' }], { nextCursor: null, hasMore: false }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await apiFetchAllPages<{ id: string }>('/organizations/acme/plans/p1/activities');

    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // First page opens the query string with `?`, requests the max page size, and carries no cursor;
    // later pages append the previous page's nextCursor.
    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls[0]).toContain('/organizations/acme/plans/p1/activities?limit=100');
    expect(urls[0]).not.toContain('cursor=');
    expect(urls[1]).toContain('limit=100');
    expect(urls[1]).toContain('cursor=b');
    expect(urls[2]).toContain('cursor=d');
  });

  it('returns a single page when the server reports no more', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(page([{ id: 'only' }], { nextCursor: null, hasMore: false }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await apiFetchAllPages<{ id: string }>(
      '/organizations/acme/plans/p1/dependencies',
    );

    expect(rows.map((r) => r.id)).toEqual(['only']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('stops when hasMore is true but the cursor is null (no infinite loop)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(page([{ id: 'x' }], { nextCursor: null, hasMore: true }));
    vi.stubGlobal('fetch', fetchMock);

    const rows = await apiFetchAllPages<{ id: string }>('/organizations/acme/plans/p1/activities');

    expect(rows.map((r) => r.id)).toEqual(['x']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
