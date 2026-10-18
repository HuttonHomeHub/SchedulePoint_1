import { useParams } from '@tanstack/react-router';

import { Breadcrumbs } from '@/components/layout/breadcrumbs';
import {
  ChildCounts,
  LoadingShape,
  PageContainer,
  PageHeader,
  PageHeaderSkeleton,
  SectionCard,
  Skeleton,
} from '@/components/ui/page';
import { SCHEDULE_INTERCHANGE_ENABLED } from '@/config/env';
import { ProjectCalendarsSection } from '@/features/calendars';
import { useClient } from '@/features/clients';
import { ImportScheduleButton } from '@/features/interchange';
import { CreatePlanButton, PlansTable, usePlans } from '@/features/plans';
import { useProject } from '@/features/projects';
import {
  canImportSchedule,
  canManageHierarchy,
  canManageOrgCalendars,
  useOrgRole,
} from '@/hooks/use-org-role';
import { EntityLoadFailure } from '@/routes/entity-not-found';

/**
 * A project's plans screen (`/orgs/$orgSlug/projects/$projectId`): the project's
 * plans, with create/edit/delete for writers. Individual plan detail (and the
 * future TSLD canvas) lives at `/orgs/$orgSlug/plans/$planId`.
 *
 * **The frame renders at once and only the header waits for the project** (see `client-detail.tsx`
 * for the reasoning and its cost, and for who speaks while the header waits). The Calendars section needs the project's name, so it appears
 * when the project does; it is the last block on the page, so nothing above it moves for it.
 *
 * It also carries the project's **Calendars** section (ADR-0053
 * §1). This screen is the project's only detail surface — there is no separate project-settings
 * route — and it already owns the project's scoped children (its plans), so the project's scoped
 * calendars belong beside them rather than behind a new route.
 */
export function ProjectDetailScreen(): React.ReactElement {
  const params = useParams({ strict: false });
  const orgSlug = 'orgSlug' in params ? params.orgSlug : '';
  const projectId = 'projectId' in params ? params.projectId : '';
  const role = useOrgRole(orgSlug);
  const canWrite = canManageHierarchy(role);
  const canImport = canImportSchedule(role);
  const canManageOrgCals = canManageOrgCalendars(role);
  const project = useProject(orgSlug, projectId);
  const plans = usePlans(orgSlug, projectId);
  // The parent client (for the breadcrumb trail); resolved once the project loads.
  const client = useClient(orgSlug, project.data?.clientId ?? '');

  if (project.isError) {
    return (
      <EntityLoadFailure
        entity="Project"
        orgSlug={orgSlug}
        error={project.error}
        onRetry={() => void project.refetch()}
      />
    );
  }

  const pending = project.isPending;

  // How many action blocks the settled header will draw: the same gates it applies, all known
  // from the role, so the skeleton's trailing edge is where the buttons will be.
  const importing = SCHEDULE_INTERCHANGE_ENABLED && canImport;
  const actionBlocks = importing && canWrite ? 2 : importing || canWrite ? 1 : 0;

  return (
    <PageContainer>
      {pending ? (
        <LoadingShape label="Loading project…" announce={plans.isPending ? 'none' : 'polite'}>
          <Skeleton className="h-5 w-64" />
          <PageHeaderSkeleton className="mt-2" aside actions={actionBlocks} />
        </LoadingShape>
      ) : (
        <>
          <Breadcrumbs
            items={[
              { label: 'Clients', to: '/orgs/$orgSlug/clients', params: { orgSlug } },
              {
                label: client.data?.name ?? 'Client',
                to: '/orgs/$orgSlug/clients/$clientId',
                params: { orgSlug, clientId: project.data.clientId },
              },
              { label: project.data.name },
            ]}
          />
          {/* Flag OFF ⇒ render exactly the prior surface. Flag ON ⇒ the "Import from file…" entry sits
          beside "New plan" (the entry self-gates on interchange:import). */}
          <PageHeader
            className="mt-2"
            title={project.data.name}
            description={project.data.description ?? undefined}
            actions={
              SCHEDULE_INTERCHANGE_ENABLED ? (
                <>
                  <ImportScheduleButton
                    orgSlug={orgSlug}
                    projectId={projectId}
                    projectName={project.data.name}
                    canImport={canImport}
                    canManageOrgCalendars={canManageOrgCals}
                  />
                  {canWrite ? <CreatePlanButton orgSlug={orgSlug} projectId={projectId} /> : null}
                </>
              ) : canWrite ? (
                <CreatePlanButton orgSlug={orgSlug} projectId={projectId} />
              ) : null
            }
            /* **"activities across its plans", and "activities" means EVERY row.** A project owns no
           activities directly — an activity hangs off a plan — and the figure includes WBS
           summaries, levels of effort and milestones as well as tasks, which is what the API
           counts and what `docs/TEST_PLAYBOOK.md` records a reader being misled by once when a
           denominator quietly included summaries. Either count is ABSENT rather than zero when the
           API could not take it. */
            aside={
              <ChildCounts
                counts={[
                  { value: project.data.planCount, one: 'plan', many: 'plans' },
                  {
                    value: project.data.activityCount,
                    one: 'activity across its plans',
                    many: 'activities across its plans',
                  },
                ]}
              />
            }
          />
        </>
      )}
      {/* `flush`: no vertical padding, so the rows start under the heading, and the card's own
          horizontal gutter so the first cell lines up with it — see `client-detail.tsx` for the
          defect that rule was written against (ADR-0146 D3). */}
      <SectionCard className="mt-6" title="Plans" flush>
        <PlansTable orgSlug={orgSlug} projectId={projectId} canWrite={canWrite} />
      </SectionCard>
      {pending ? null : (
        <div className="mt-10">
          <ProjectCalendarsSection
            orgSlug={orgSlug}
            projectId={projectId}
            projectName={project.data.name}
            canWrite={canWrite}
            canManageOrg={canManageOrgCals}
          />
        </div>
      )}
    </PageContainer>
  );
}
