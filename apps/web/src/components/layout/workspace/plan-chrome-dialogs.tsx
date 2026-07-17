import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { Dialog } from '@/components/ui/dialog';
import {
  ADVANCED_CONSTRAINTS_ENABLED,
  PROGRESS_INGESTION_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';
import { BaselinesPanel } from '@/features/baselines';
import {
  PLAN_STATUS_LABELS,
  PlanCalendarPicker,
  PlanExpectedFinishToggle,
  PlanLevellingSettings,
  PlanRecalcModePicker,
} from '@/features/plans';
import { formatCalendarDate } from '@/lib/format-date';

/** The lower-frequency plan-chrome surfaces reachable from either layout's overflow. */
export type PlanChromeDialog = 'details' | 'baselines' | 'calendar';

/**
 * The three **plan-chrome dialogs** — Plan details, Baselines, and the working-day Calendar — shared
 * by both plan layouts: the ADR-0030 header overflow ({@link PlanActionsMenu}) and the ADR-0031
 * toolbar overflow ({@link ToolbarPlanWorkspace}). Both open them from a single `PlanChromeDialog`
 * state and drive them off the same {@link PlanWorkspaceModel}, so the copy and behaviour can't drift
 * between the two paths (TECH_DEBT #31b). Only one dialog is open at a time; `null` closes all.
 */
export function PlanChromeDialogs({
  dialog,
  onClose,
  model,
  plan,
}: {
  dialog: PlanChromeDialog | null;
  onClose: () => void;
  model: PlanWorkspaceModel;
  plan: LoadedPlan;
}): React.ReactElement {
  return (
    <>
      <Dialog open={dialog === 'details'} onClose={onClose} title="Plan details">
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Status</dt>
          <dd>{PLAN_STATUS_LABELS[plan.status]}</dd>
          <dt className="text-muted-foreground">Planned start</dt>
          <dd>{formatCalendarDate(plan.plannedStart)}</dd>
          {plan.description ? (
            <>
              <dt className="text-muted-foreground">Description</dt>
              <dd className="whitespace-pre-wrap">{plan.description}</dd>
            </>
          ) : null}
        </dl>
      </Dialog>

      <Dialog
        open={dialog === 'baselines'}
        onClose={onClose}
        title="Baselines"
        description="Frozen snapshots of the schedule to compare against. The active baseline drives the variance shown in the activities table."
        size="lg"
      >
        <BaselinesPanel orgSlug={model.orgSlug} planId={model.planId} canManage={model.canWrite} />
      </Dialog>

      <Dialog
        open={dialog === 'calendar'}
        onClose={onClose}
        title="Working-day calendar"
        description="The calendar that sets which days are working days (and holidays) for this plan's schedule."
      >
        <div className="flex flex-col gap-6">
          <PlanCalendarPicker
            orgSlug={model.orgSlug}
            plan={plan}
            calendars={model.calendars.data ?? []}
            calendarsLoading={model.calendars.isPending}
            canEdit={model.canWrite}
          />
          {PROGRESS_INGESTION_ENABLED ? (
            <PlanRecalcModePicker orgSlug={model.orgSlug} plan={plan} canEdit={model.canWrite} />
          ) : null}
          {ADVANCED_CONSTRAINTS_ENABLED ? (
            <PlanExpectedFinishToggle
              orgSlug={model.orgSlug}
              plan={plan}
              canEdit={model.canWrite}
            />
          ) : null}
          {RESOURCE_LEVELLING_ENABLED ? (
            <PlanLevellingSettings orgSlug={model.orgSlug} plan={plan} canEdit={model.canWrite} />
          ) : null}
        </div>
      </Dialog>
    </>
  );
}
