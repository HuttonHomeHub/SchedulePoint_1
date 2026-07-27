import type { LoadedPlan, PlanWorkspaceModel } from './use-plan-workspace-model';

import { Dialog } from '@/components/ui/dialog';
import {
  ADVANCED_CONSTRAINTS_ENABLED,
  EARNED_VALUE_ENABLED,
  FLOAT_CRITICAL_SETTINGS_ENABLED,
  GUEST_SHARE_LINKS_ENABLED,
  INTER_PROJECT_DATES_ENABLED,
  PROGRESS_INGESTION_ENABLED,
  RESOURCE_CURVES_ENABLED,
  RESOURCE_LEVELLING_ENABLED,
} from '@/config/env';
import { BaselinesPanel } from '@/features/baselines';
import { EarnedValuePanel } from '@/features/earned-value';
import {
  PLAN_STATUS_LABELS,
  PlanCalendarPicker,
  PlanEarnedValueSettings,
  PlanExpectedFinishToggle,
  PlanExternalRelationshipsSettings,
  PlanLevellingSettings,
  PlanRecalcModePicker,
  PlanScheduleSettings,
} from '@/features/plans';
import { ResourceHistogram } from '@/features/resources';
import { ShareLinksDialog } from '@/features/share';
import { formatCalendarDate } from '@/lib/format-date';

/** The lower-frequency plan-chrome surfaces reachable from either layout's overflow. */
export type PlanChromeDialog =
  'details' | 'baselines' | 'calendar' | 'earned-value' | 'resource-histogram' | 'share';

/**
 * One titled subsection of the **Schedule settings** dialog.
 *
 * That dialog accumulated seven independent settings groups one migration at a time, and every one
 * of them renders its own controls with no visible heading — so a planner opening it scrolled from
 * working-day configuration straight into critical-path and earned-value options with nothing
 * marking the boundary (TECH_DEBT #60). This supplies the missing signpost.
 *
 * The heading is an `<h3>` because `Dialog` renders its own `title` as the `<h2>` these sit under,
 * so the dialog reads as one properly-nested outline to a screen reader's heading navigation rather
 * than a flat wall of controls. Kept local: the seven section components are shared with the legacy
 * `plan-detail` page, which already groups them under its own "Schedule" heading and would end up
 * with two levels of heading for one group if the title moved inside them.
 */
function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}): React.ReactElement {
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-base font-medium">{title}</h3>
      {children}
    </section>
  );
}

/**
 * The **plan-chrome dialogs** — Plan details, Baselines, Schedule settings, and the flag-gated
 * Earned value / Resource histogram / Share links — shared by both plan layouts: the ADR-0030
 * header overflow ({@link PlanActionsMenu}) and the ADR-0031 toolbar overflow
 * ({@link ToolbarPlanWorkspace}). Both open them from a single `PlanChromeDialog` state and drive
 * them off the same {@link PlanWorkspaceModel}, so the copy and behaviour can't drift between the
 * two paths (TECH_DEBT #31b). Only one dialog is open at a time; `null` closes all.
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
        title="Schedule settings"
        description="Everything that changes how this plan's dates are calculated — its working-day calendar, how the critical path and float are measured, and how progress, resources and external dates are treated."
      >
        <div className="flex flex-col gap-6">
          <SettingsSection title="Working-day calendar">
            <PlanCalendarPicker
              orgSlug={model.orgSlug}
              plan={plan}
              calendars={model.calendars.data ?? []}
              calendarsLoading={model.calendars.isPending}
              canEdit={model.canWrite}
            />
          </SettingsSection>
          {FLOAT_CRITICAL_SETTINGS_ENABLED ? (
            <SettingsSection title="Critical path & float">
              <PlanScheduleSettings orgSlug={model.orgSlug} plan={plan} canEdit={model.canWrite} />
            </SettingsSection>
          ) : null}
          {PROGRESS_INGESTION_ENABLED ? (
            <SettingsSection title="Progress & recalculation">
              <PlanRecalcModePicker orgSlug={model.orgSlug} plan={plan} canEdit={model.canWrite} />
            </SettingsSection>
          ) : null}
          {ADVANCED_CONSTRAINTS_ENABLED ? (
            <SettingsSection title="Expected finish">
              <PlanExpectedFinishToggle
                orgSlug={model.orgSlug}
                plan={plan}
                canEdit={model.canWrite}
              />
            </SettingsSection>
          ) : null}
          {RESOURCE_LEVELLING_ENABLED ? (
            <SettingsSection title="Resource levelling">
              <PlanLevellingSettings orgSlug={model.orgSlug} plan={plan} canEdit={model.canWrite} />
            </SettingsSection>
          ) : null}
          {INTER_PROJECT_DATES_ENABLED ? (
            <SettingsSection title="External relationships">
              <PlanExternalRelationshipsSettings
                orgSlug={model.orgSlug}
                plan={plan}
                canEdit={model.canWrite}
              />
            </SettingsSection>
          ) : null}
          {EARNED_VALUE_ENABLED ? (
            <SettingsSection title="Earned value">
              <PlanEarnedValueSettings
                orgSlug={model.orgSlug}
                plan={plan}
                canEdit={model.canWrite}
              />
            </SettingsSection>
          ) : null}
        </div>
      </Dialog>

      {EARNED_VALUE_ENABLED ? (
        <Dialog
          open={dialog === 'earned-value'}
          onClose={onClose}
          title="Earned value"
          description="Cost and schedule performance measured against the active baseline when one exists — SPI, CPI and the forecast at completion, per activity and for the plan."
          size="lg"
        >
          <EarnedValuePanel
            orgSlug={model.orgSlug}
            planId={model.planId}
            activities={model.activities.data ?? []}
          />
        </Dialog>
      ) : null}

      {RESOURCE_CURVES_ENABLED ? (
        <Dialog
          open={dialog === 'resource-histogram'}
          onClose={onClose}
          title="Resource histogram"
          description="Each resource's curve-shaped units over time across this plan — a bar chart with a keyboard-navigable data table carrying the same numbers."
          size="lg"
        >
          <ResourceHistogram orgSlug={model.orgSlug} planId={model.planId} />
        </Dialog>
      ) : null}

      {/* External-Guest share links (ADR-0051 F-M4). Unlike the panels above, `ShareLinksDialog` owns its
          own `Dialog` chrome, so it is rendered directly (not wrapped). Gated behind the flag so it (and
          the whole share feature) is never pulled into a flag-off build's behaviour. */}
      {GUEST_SHARE_LINKS_ENABLED ? (
        <ShareLinksDialog
          orgSlug={model.orgSlug}
          planId={model.planId}
          open={dialog === 'share'}
          onClose={onClose}
        />
      ) : null}
    </>
  );
}
