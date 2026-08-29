import { useNavigate, useParams } from '@tanstack/react-router';

import { useOrganizations } from '../api/use-organizations';

import { cn } from '@/lib/utils';

/**
 * Header control to switch the active organisation. The URL is authoritative:
 * changing the selection navigates to `/orgs/$orgSlug`. Rendered as a native
 * select for full keyboard/screen-reader support. Hidden until the user has orgs.
 */
export function OrgSwitcher({
  className,
  title,
}: { className?: string; title?: string | undefined } = {}): React.ReactElement | null {
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
        // Carries the current organisation for a pointer user where the control is too narrow to
        // show it — the collapsed rail at 36 px (Graphite M3). Never a substitute for the label:
        // `title` is unreliable for assistive technology, which is why the `sr-only <label>` above
        // is the accessible name in every presentation.
        {...(title === undefined ? {} : { title })}
        value={current}
        onChange={(event) =>
          void navigate({ to: '/orgs/$orgSlug', params: { orgSlug: event.target.value } })
        }
        className={cn(
          // `h-(--control-h)`, not the literal `h-9` this carried (ADR-0118 M4). It sits in
          // `<header>` — a surface the coarse gate names as swept — and was invisible to it,
          // because the sweep queried `button,a,[role=button],input` and a `<select>` is none of
          // those. Found by the architecture review reading the query rather than the result: the
          // gate reported the header clean, and it was clean of everything it could see.
          'border-input bg-background h-(--control-h) min-w-0 rounded-md border px-2 text-sm',
          'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
          className,
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
