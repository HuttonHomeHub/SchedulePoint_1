import type { OrganizationSummary } from '@repo/types';
import { QueryClient } from '@tanstack/react-query';
import { isNotFound } from '@tanstack/react-router';
import { describe, expect, it, vi } from 'vitest';

import { loadMemberOrganization, orgNotFoundBeforeLoad } from './org-membership';

import { organizationKeys } from '@/features/organizations';

function clientWith(organizations: Array<Pick<OrganizationSummary, 'slug'>>): QueryClient {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(organizationKeys.list(), organizations);
  return queryClient;
}

describe('loadMemberOrganization', () => {
  it('finds a slug in the caller’s own list', async () => {
    const found = await loadMemberOrganization(
      clientWith([{ slug: 'acme' }, { slug: 'beta' }]),
      'beta',
    );
    expect(found?.slug).toBe('beta');
  });

  it('answers undefined for a slug that is not in the list, whether or not it exists', async () => {
    const queryClient = clientWith([{ slug: 'acme' }]);
    expect(await loadMemberOrganization(queryClient, 'foreign')).toBeUndefined();
    expect(await loadMemberOrganization(queryClient, 'no-such-org')).toBeUndefined();
  });

  it('answers undefined for a caller with no organisation', async () => {
    expect(await loadMemberOrganization(clientWith([]), 'acme')).toBeUndefined();
  });
});

describe('orgNotFoundBeforeLoad', () => {
  it('lets a member through', async () => {
    await expect(
      orgNotFoundBeforeLoad(clientWith([{ slug: 'acme' }]), 'acme'),
    ).resolves.toBeUndefined();
  });

  it('never records the slug as the active organisation — a mistype is not a visit', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    await orgNotFoundBeforeLoad(clientWith([{ slug: 'acme' }]), 'acme');
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('throws a not-found for a non-member, for a foreign and a nonexistent slug alike', async () => {
    const queryClient = clientWith([{ slug: 'acme' }]);
    const thrown: unknown[] = [];
    for (const slug of ['foreign', 'no-such-org']) {
      await orgNotFoundBeforeLoad(queryClient, slug).catch((error: unknown) => thrown.push(error));
    }
    expect(thrown).toHaveLength(2);
    expect(thrown.every((error) => isNotFound(error))).toBe(true);
    expect(thrown[0]).toEqual(thrown[1]);
  });
});
