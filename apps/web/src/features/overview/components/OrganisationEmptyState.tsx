import { Link } from '@tanstack/react-router';
import { Building2, CalendarRange } from 'lucide-react';

import { buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/page';

/**
 * What the overview says when the organisation has nothing in it yet.
 *
 * **Two states, and each is role-aware** (spec §2 US-3). The screen this replaces offered
 * "Add a client" to every role including Viewer — a button that leads to a screen whose own action
 * is shaded. An action the reader cannot take is not offered, and the copy says who can, which is
 * the ADR-0082 discriminator applied to an empty state: omit when the action does not apply to the
 * reader, and say why.
 *
 * **`ScheduleBackdrop` is deleted with `welcome-empty-state.tsx` rather than moved here**, which is
 * the choice M2-T5 required to be made one way or the other rather than left as both. It was a
 * hand-drawn evocation of the canvas — a repeating-gradient ruler, a TODAY pill and a mask stop —
 * whose own docblock records it as "a deliberate, isolated exception to the spacing scale". ADR-0097
 * Landing A's condition is that this screen is built from the archetypes and not from a bespoke
 * layout that happens to look right, and the most tempting screen in the product to decorate is the
 * one where that condition is worth the most. Structure and copy here; the design language decides
 * how it looks.
 */
export function OrganisationEmptyState({
  orgSlug,
  isNewOrganisation,
  canAddClients,
}: {
  orgSlug: string;
  isNewOrganisation: boolean;
  canAddClients: boolean;
}): React.ReactElement {
  if (isNewOrganisation) {
    return (
      <EmptyState
        icon={<Building2 aria-hidden="true" className="size-6" />}
        title="This organisation is empty"
        description={
          canAddClients
            ? 'Start with a client, then a project, then a plan.'
            : 'Ask a Planner or Org Admin to add the first client.'
        }
        action={
          canAddClients ? (
            <Link
              to="/orgs/$orgSlug/clients"
              params={{ orgSlug }}
              className={buttonVariants({ size: 'sm' })}
            >
              Add your first client
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <EmptyState
      icon={<CalendarRange aria-hidden="true" className="size-6" />}
      title="No plans yet"
      description={
        canAddClients
          ? 'Pick a project in the Project Explorer and add its first plan.'
          : 'Ask a Planner or Org Admin to add the first plan.'
      }
    />
  );
}
