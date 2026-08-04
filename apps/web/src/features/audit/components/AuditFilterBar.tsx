import { AUDIT_OUTCOMES, auditCategoriesForSurface, type AuditOutcome } from '@repo/types';
import { X } from 'lucide-react';

import { AUDIT_CATEGORY_LABELS, AUDIT_OUTCOME_LABELS } from '../model/audit-copy';
import {
  isAuditFilterEmpty,
  selectedCategories,
  toggleCategory,
  type AuditFilterState,
  type AuditSurface,
} from '../model/audit-filter';

import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/form';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ToggleChip } from '@/components/ui/toggle-chip';

export interface AuditFilterBarProps {
  /** Which read this bar filters. Decides which categories are offered at all. */
  surface: AuditSurface;
  value: AuditFilterState;
  onChange: (patch: Partial<AuditFilterState>) => void;
}

/**
 * The audit log's filter bar (ADR-0073 C1) — category chips, an outcome choice and a date range.
 *
 * **Controlled.** The value and setter come from the screen, which owns `useUrlFilterState`; that
 * hook must be called inside the router, and this component is rendered directly by its unit tests.
 * The split is the hook's own documented rule rather than a preference here.
 *
 * The chips are {@link ToggleChip} and the outcome is a {@link SegmentedControl}, and the choice is
 * semantic rather than visual: categories are **independent booleans** ("also show deletions"),
 * while an outcome is **one of a set**. A radiogroup tells assistive technology "one of N" and a
 * pressed button tells it "this is on"; getting it backwards misdescribes the control even when it
 * looks right.
 *
 * Which categories appear is **not decided here** — `auditCategoriesForSurface` derives it from the
 * vocabulary, so the organisation screen cannot offer Sign-ins (those rows carry no organisation
 * and the endpoint refuses the filter), and a category with no actions yet stays off screen until
 * its first action lands. A chip that can only ever answer "no events" is the defect this whole
 * milestone exists to remove.
 *
 * **The consumer owes the announcement.** Changing a filter must move an announced result count or
 * a screen-reader user has no evidence anything happened (WCAG 4.1.3) — both screens already render
 * `AuditEventList`, which announces its settled count.
 */
export function AuditFilterBar({
  surface,
  value,
  onChange,
}: AuditFilterBarProps): React.ReactElement {
  const categories = auditCategoriesForSurface(surface);
  const chosen = new Set(selectedCategories(value));
  const empty = isAuditFilterEmpty(value);

  return (
    <div className="border-border flex flex-wrap items-end gap-x-6 gap-y-3 rounded-lg border p-3">
      <div className="flex flex-col gap-1.5">
        <span id="audit-filter-categories-label" className="text-muted-foreground text-xs">
          Show
        </span>
        <div
          role="group"
          aria-labelledby="audit-filter-categories-label"
          className="flex flex-wrap gap-2"
        >
          {categories.map((category) => (
            <ToggleChip
              key={category}
              pressed={chosen.has(category)}
              onPressedChange={(next) => {
                onChange(toggleCategory(value, category, next));
              }}
            >
              {AUDIT_CATEGORY_LABELS[category]}
            </ToggleChip>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs">Outcome</span>
        <SegmentedControl
          label="Outcome"
          // `null` is "any", which is the state the screen opens in — the APG note on the
          // primitive is explicit that an unchosen radiogroup carries no selection rather than
          // defaulting to its first option.
          value={value.outcome === '' ? null : (value.outcome as AuditOutcome)}
          onChange={(next) => {
            // Re-picking the current outcome clears it. Without this the only way back to "any" is
            // Clear filters, which also discards the categories and dates the reader still wants.
            onChange({ outcome: next === value.outcome ? '' : next });
          }}
          options={AUDIT_OUTCOMES.map((outcome) => ({
            value: outcome,
            label: AUDIT_OUTCOME_LABELS[outcome],
          }))}
        />
      </div>

      {/*
        `TextField`, not a hand-assembled label + input. The first version of this file wrote both
        by hand — the idiom TECH_DEBT #42 records being written 33 times before the primitives
        existed — and got the token wrong on the way: it used `bg-background` where the `Input`
        primitive uses `bg-field`. Those are different tokens, rebound separately per surface scope
        (ADR-0055), so the hand-rolled version would have painted the wrong colour the moment this
        bar sat inside a chrome or panel surface, with nothing to catch it: both are semantic
        tokens, so the colour-literal lint rule sees nothing wrong.
      */}
      <TextField
        label="From"
        type="date"
        value={value.from}
        max={value.to === '' ? undefined : value.to}
        onChange={(event) => {
          onChange({ from: event.target.value });
        }}
      />

      <TextField
        label="To"
        type="date"
        value={value.to}
        // The native bounds stop an inverted range being *composed* rather than reporting it after
        // the fact. The API refuses one regardless — this is the courtesy, not the guard.
        min={value.from === '' ? undefined : value.from}
        onChange={(event) => {
          onChange({ to: event.target.value });
        }}
      />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        // `aria-disabled`, never the native attribute: a control that flips as the filter changes
        // would blur to `<body>` mid-interaction and drop the reader's place (the ScopeSaveBar
        // lesson, ADR-0060/ADR-0063).
        aria-disabled={empty}
        onClick={() => {
          if (empty) return;
          onChange({ categories: '', outcome: '', from: '', to: '' });
        }}
        className={empty ? 'opacity-50' : undefined}
      >
        <X aria-hidden="true" className="size-4" />
        Clear filters
      </Button>
    </div>
  );
}
