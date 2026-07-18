import type { PlanSummary } from '@repo/types';

import {
  ON_OFF_OPTIONS,
  PlanScheduleOptionSelect,
  type OnOffValue,
} from './PlanScheduleOptionSelect';

/**
 * The plan's **resource-levelling settings** (ADR-0041) — the opt-in switch for the second levelling
 * pass and, when it is on, whether levelling may only delay within total float:
 *
 * - **Level resources** (`levelResources`) — the opt-in switch. Off by default (the parity gate: the
 *   levelling pass never runs and a recalculation is byte-identical to the pure CPM network pass). When
 *   on, a recalculation runs the second pass that delays over-allocated activities into the engine-owned
 *   levelled overlay.
 * - **Level within float only** (`levelWithinFloatOnly`) — shown only when levelling is on. When on,
 *   levelling may delay an activity only within its total float (never extending the schedule); residual
 *   over-allocation that a within-float delay can't resolve is flagged rather than pushed out.
 *
 * Writers (`canEdit`) edit them; everyone else sees them read-only. Each change persists immediately (a
 * targeted PATCH of just that field + `version`, via the shared {@link PlanScheduleOptionSelect}); it
 * changes no dates itself — a later **Recalculate** applies the levelling. Flagged behind
 * `VITE_RESOURCE_LEVELLING` (the API/engine behind it is already live; only the controls are gated).
 *
 * The within-float control appears only while levelling is on because it has no effect otherwise
 * (ADR-0041 §4) — surfacing an inert control would misrepresent what it does.
 */
export function PlanLevellingSettings({
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
      // The settings are one logical group (WCAG 1.3.1) — `aria-label` names it for AT without a
      // visible heading, matching the sibling float/critical read-only view.
      <dl className="flex flex-col gap-3 text-sm" aria-label="Resource levelling settings">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Level resources</dt>
          <dd>{plan.levelResources ? 'On' : 'Off'}</dd>
        </div>
        {plan.levelResources ? (
          <div className="flex flex-col gap-1">
            <dt className="text-muted-foreground">Level within float only</dt>
            <dd>{plan.levelWithinFloatOnly ? 'On' : 'Off'}</dd>
          </div>
        ) : null}
      </dl>
    );
  }

  return (
    // A `fieldset` groups the related controls for AT (WCAG 1.3.1); the `legend` is the group's
    // accessible name, visually hidden so the section keeps its flat look (matching the sibling
    // float/critical settings).
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">Resource levelling settings</legend>
      <PlanScheduleOptionSelect<OnOffValue>
        orgSlug={orgSlug}
        plan={plan}
        label="Level resources"
        serverValue={plan.levelResources ? 'on' : 'off'}
        options={ON_OFF_OPTIONS}
        hint={(value) =>
          value === 'on'
            ? 'A recalculation delays over-allocated activities to respect each resource’s capacity, shown as a levelled overlay alongside the critical path.'
            : 'Off — a recalculation computes only the critical path; resource over-allocation is not resolved.'
        }
        buildPatch={(value) => ({ levelResources: value === 'on' })}
        announceMessage={(value) => `Level resources turned ${value === 'on' ? 'on' : 'off'}.`}
      />
      {plan.levelResources ? (
        <PlanScheduleOptionSelect<OnOffValue>
          orgSlug={orgSlug}
          plan={plan}
          label="Level within float only"
          serverValue={plan.levelWithinFloatOnly ? 'on' : 'off'}
          options={ON_OFF_OPTIONS}
          hint={(value) =>
            value === 'on'
              ? 'Levelling delays an activity only within its total float, so the project finish never moves; over-allocation a within-float delay can’t clear is flagged instead.'
              : 'Levelling may extend the schedule past total float to resolve over-allocation.'
          }
          buildPatch={(value) => ({ levelWithinFloatOnly: value === 'on' })}
          announceMessage={(value) =>
            `Level within float only turned ${value === 'on' ? 'on' : 'off'}.`
          }
        />
      ) : null}
    </fieldset>
  );
}
