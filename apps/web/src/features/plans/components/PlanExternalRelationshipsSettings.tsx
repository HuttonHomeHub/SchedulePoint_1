import type { PlanSummary } from '@repo/types';

import {
  ON_OFF_OPTIONS,
  PlanScheduleOptionSelect,
  type OnOffValue,
} from './PlanScheduleOptionSelect';

/**
 * The plan's **external / inter-project relationships setting** (ADR-0043 / ADR-0035 §30) — P6's
 * "ignore relationships to/from other projects" toggle:
 *
 * - **Ignore external relationships** (`ignoreExternalRelationships`) — off by default (the parity gate:
 *   the engine honours every external bound, and a plan with no external data schedules identically
 *   either way). When on, a recalculation drops all external early-start and late-finish bounds so the
 *   plan schedules on its own logic; internal constraints and logic are untouched.
 *
 * Writers (`canEdit`) edit it; everyone else sees it read-only. The change persists immediately (a
 * targeted PATCH of just `ignoreExternalRelationships` + `version`, via the shared
 * {@link PlanScheduleOptionSelect}); it changes no dates itself — a later **Recalculate** applies it.
 * Flagged behind `VITE_INTER_PROJECT_DATES` (the API/engine behind it is already live; only the control
 * is gated).
 */
export function PlanExternalRelationshipsSettings({
  orgSlug,
  plan,
  canEdit,
}: {
  orgSlug: string;
  plan: PlanSummary;
  canEdit: boolean;
}): React.ReactElement {
  if (!canEdit) {
    return (
      // One logical group named for AT without a visible heading (WCAG 1.3.1), matching the sibling
      // levelling / Earned-Value read-only views.
      <dl className="flex flex-col gap-3 text-sm" aria-label="External relationships settings">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Ignore external relationships</dt>
          <dd>{plan.ignoreExternalRelationships ? 'On' : 'Off'}</dd>
        </div>
      </dl>
    );
  }

  return (
    // A `fieldset` groups the control for AT (WCAG 1.3.1); the visually-hidden `legend` names the group
    // without a box, matching the sibling settings sections.
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">External relationships settings</legend>
      <PlanScheduleOptionSelect<OnOffValue>
        orgSlug={orgSlug}
        plan={plan}
        label="Ignore external relationships"
        serverValue={plan.ignoreExternalRelationships ? 'on' : 'off'}
        options={ON_OFF_OPTIONS}
        hint={(value) =>
          value === 'on'
            ? 'A recalculation drops every imported external early-start and late-finish bound, so the plan schedules on its own logic; internal constraints and logic are untouched.'
            : 'Off — a recalculation honours the imported external dates on this plan’s activities as soft bounds.'
        }
        buildPatch={(value) => ({ ignoreExternalRelationships: value === 'on' })}
        announceMessage={(value) =>
          `Ignore external relationships turned ${value === 'on' ? 'on' : 'off'}.`
        }
      />
    </fieldset>
  );
}
