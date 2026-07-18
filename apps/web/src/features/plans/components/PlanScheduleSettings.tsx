import type { CriticalPathDefinition, PlanSummary, TotalFloatMode } from '@repo/types';

import {
  CRITICAL_PATH_DEFINITION_LABELS,
  CRITICAL_PATH_DEFINITIONS,
  TOTAL_FLOAT_MODE_LABELS,
  TOTAL_FLOAT_MODES,
} from '../schemas/plan-schemas';

import {
  ON_OFF_OPTIONS,
  PlanScheduleOptionSelect,
  type OnOffValue,
} from './PlanScheduleOptionSelect';

/**
 * The plan's **float & critical scheduling settings** (M6, ADR-0035 §17/§18/§20) — three options
 * governing how the engine's critical path is decided and how total float is measured:
 *
 * - **Critical-path definition** (`criticalPathDefinition`, ADR-0035 §17) — Total float (critical when
 *   total float is at/below the threshold, the P6 default) vs Longest path (critical along the longest
 *   chain of driving relationships to the finish).
 * - **Total-float measure** (`totalFloatMode`, ADR-0035 §18) — Finish float (late finish − early finish,
 *   the P6 default), Start float (late start − early start), or Smallest (the lesser of the two).
 * - **Open-ends criticality** (`makeOpenEndsCritical`, ADR-0035 §20) — when on, activities with no
 *   predecessor or no successor are always flagged critical. Off by default.
 *
 * Writers (`canEdit`) edit the three; everyone else sees them read-only. Each change persists immediately
 * (a targeted PATCH of just that field + `version`); it changes no dates itself — a later **Recalculate**
 * applies the new definition/measure to the computed critical path. Flagged behind
 * `VITE_FLOAT_CRITICAL_SETTINGS` (the API/engine behind it is already live; only the picker is gated).
 *
 * Each control shares the optimistic/busy/focus-restore machinery via the shared
 * {@link PlanScheduleOptionSelect}, keyed on its own server value so it stays busy until the refetched
 * plan confirms the new `version` (closing the optimistic-lock race a rapid re-edit hits).
 */
export function PlanScheduleSettings({
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
      // The three settings are one logical group (WCAG 1.3.1) — `aria-label` names it for AT without
      // a visible heading, avoiding a lone sub-heading the sibling settings above don't have.
      <dl className="flex flex-col gap-3 text-sm" aria-label="Float & critical settings">
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Critical-path definition</dt>
          <dd>{CRITICAL_PATH_DEFINITION_LABELS[plan.criticalPathDefinition].label}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Total-float measure</dt>
          <dd>{TOTAL_FLOAT_MODE_LABELS[plan.totalFloatMode].label}</dd>
        </div>
        <div className="flex flex-col gap-1">
          <dt className="text-muted-foreground">Open-ends criticality</dt>
          <dd>{plan.makeOpenEndsCritical ? 'On' : 'Off'}</dd>
        </div>
      </dl>
    );
  }

  return (
    // A `fieldset` groups the three related controls for AT (WCAG 1.3.1); the `legend` is the group's
    // accessible name, visually hidden so the section keeps its flat look (the sibling settings above
    // aren't grouped visually — a section-wide heading pass is tracked separately in TECH_DEBT).
    <fieldset className="m-0 flex flex-col gap-3 border-0 p-0">
      <legend className="sr-only">Float & critical settings</legend>
      <PlanScheduleOptionSelect<CriticalPathDefinition>
        orgSlug={orgSlug}
        plan={plan}
        label="Critical-path definition"
        serverValue={plan.criticalPathDefinition}
        options={CRITICAL_PATH_DEFINITIONS.map((value) => ({
          value,
          label: CRITICAL_PATH_DEFINITION_LABELS[value].label,
        }))}
        hint={(value) => CRITICAL_PATH_DEFINITION_LABELS[value].description}
        buildPatch={(value) => ({ criticalPathDefinition: value })}
        announceMessage={(value) =>
          `Critical-path definition set to ${CRITICAL_PATH_DEFINITION_LABELS[value].label}.`
        }
      />
      <PlanScheduleOptionSelect<TotalFloatMode>
        orgSlug={orgSlug}
        plan={plan}
        label="Total-float measure"
        serverValue={plan.totalFloatMode}
        options={TOTAL_FLOAT_MODES.map((value) => ({
          value,
          label: TOTAL_FLOAT_MODE_LABELS[value].label,
        }))}
        hint={(value) => TOTAL_FLOAT_MODE_LABELS[value].description}
        buildPatch={(value) => ({ totalFloatMode: value })}
        announceMessage={(value) =>
          `Total-float measure set to ${TOTAL_FLOAT_MODE_LABELS[value].label}.`
        }
      />
      <PlanScheduleOptionSelect<OnOffValue>
        orgSlug={orgSlug}
        plan={plan}
        label="Open-ends criticality"
        serverValue={plan.makeOpenEndsCritical ? 'on' : 'off'}
        options={ON_OFF_OPTIONS}
        hint={() =>
          'When on, activities with no predecessor or no successor are always flagged critical.'
        }
        buildPatch={(value) => ({ makeOpenEndsCritical: value === 'on' })}
        announceMessage={(value) =>
          `Open-ends criticality turned ${value === 'on' ? 'on' : 'off'}.`
        }
      />
    </fieldset>
  );
}
