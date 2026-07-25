import { describe, expect, it, vi } from 'vitest';

import { calendarKeys, calendarsQueryOptions, projectCalendarsQueryOptions } from './use-calendars';

import type * as ApiClient from '@/lib/api/client';
import { apiFetchAllPages } from '@/lib/api/client';

vi.mock('@/lib/api/client', async (importOriginal) => ({
  ...(await importOriginal<typeof ApiClient>()),
  apiFetchAllPages: vi.fn().mockResolvedValue([]),
}));

/**
 * The scope-aware calendar reads (ADR-0053 §1). These assert the *request and the cache key*, which
 * is where a scoping bug does real damage: a shared key would let a project's list overwrite the org
 * library in the cache, and a plain `apiFetch` would silently truncate every list at the endpoint's
 * default page (the 20-row defect fixed just before this milestone).
 */
describe('calendar list query options', () => {
  it('requests the plain org list with NO scope param by default — the flag-off request is unchanged', async () => {
    const options = calendarsQueryOptions('acme');

    expect(options.queryKey).toEqual(calendarKeys.list('acme'));
    await options.queryFn!({} as never);
    expect(apiFetchAllPages).toHaveBeenCalledWith('/organizations/acme/calendars');
  });

  it('shares ONE cache entry between the default read and an explicit org filter', () => {
    expect(calendarsQueryOptions('acme', 'org').queryKey).toEqual(
      calendarsQueryOptions('acme').queryKey,
    );
  });

  it('sends ?scope= and takes a distinct key for the project and all filters', async () => {
    for (const scope of ['project', 'all'] as const) {
      vi.mocked(apiFetchAllPages).mockClear();
      const options = calendarsQueryOptions('acme', scope);

      expect(options.queryKey).not.toEqual(calendarKeys.list('acme'));
      await options.queryFn!({} as never);
      expect(apiFetchAllPages).toHaveBeenCalledWith(`/organizations/acme/calendars?scope=${scope}`);
    }
  });

  it('reads a project’s usable calendars from the project-nested endpoint, paged in full', async () => {
    vi.mocked(apiFetchAllPages).mockClear();
    const options = projectCalendarsQueryOptions('acme', 'proj-1');

    expect(options.queryKey).toEqual(calendarKeys.forProject('acme', 'proj-1'));
    await options.queryFn!({} as never);
    expect(apiFetchAllPages).toHaveBeenCalledWith('/organizations/acme/projects/proj-1/calendars');
  });

  it('idles until a project id is known (no request for a still-loading plan)', () => {
    expect(projectCalendarsQueryOptions('acme', '').enabled).toBe(false);
    expect(projectCalendarsQueryOptions('acme', 'proj-1').enabled).toBe(true);
  });
});

describe('calendarKeys', () => {
  it('keeps every project list on its own key so two projects can’t stomp each other', () => {
    expect(calendarKeys.forProject('acme', 'proj-1')).not.toEqual(
      calendarKeys.forProject('acme', 'proj-2'),
    );
    expect(calendarKeys.forProject('acme', 'proj-1')).not.toEqual(calendarKeys.list('acme'));
  });

  it('nests every scoped and per-project list under the org list, so one invalidation sweeps all', () => {
    const listKey = calendarKeys.list('acme');
    for (const key of [
      calendarKeys.scoped('acme', 'project'),
      calendarKeys.scoped('acme', 'all'),
      calendarKeys.forProject('acme', 'proj-1'),
    ]) {
      expect(key.slice(0, listKey.length)).toEqual([...listKey]);
    }
  });
});
