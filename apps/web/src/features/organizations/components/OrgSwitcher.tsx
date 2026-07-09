import { useNavigate, useParams } from '@tanstack/react-router';

import { useOrganizations } from '../api/use-organizations';

import { cn } from '@/lib/utils';

/**
 * Header control to switch the active organisation. The URL is authoritative:
 * changing the selection navigates to `/orgs/$orgSlug`. Rendered as a native
 * select for full keyboard/screen-reader support. Hidden until the user has orgs.
 */
export function OrgSwitcher(): React.ReactElement | null {
  const { data: organizations } = useOrganizations();
  const params = useParams({ strict: false });
  const navigate = useNavigate();

  if (!organizations || organizations.length === 0) {
    return null;
  }

  const current = 'orgSlug' in params ? params.orgSlug : '';

  return (
    <>
      <label htmlFor="org-switcher" className="sr-only">
        Active organisation
      </label>
      <select
        id="org-switcher"
        value={current}
        onChange={(event) =>
          void navigate({ to: '/orgs/$orgSlug', params: { orgSlug: event.target.value } })
        }
        className={cn(
          'border-input bg-background h-9 rounded-md border px-2 text-sm',
          'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        )}
      >
        {current === '' ? (
          <option value="" disabled>
            Select organisation
          </option>
        ) : null}
        {organizations.map((organization) => (
          <option key={organization.id} value={organization.slug}>
            {organization.name}
          </option>
        ))}
      </select>
    </>
  );
}
