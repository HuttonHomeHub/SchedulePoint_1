import type { CalendarSummary } from '@repo/types';
import { WorkingWeekdays } from '@repo/types';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ActivityCalendarField } from './ActivityCalendarField';

import { FieldGateProvider, type FieldGate } from '@/components/ui/field-gate';

/**
 * The shared per-activity calendar picker (ADR-0037), tested directly.
 *
 * **This suite did not exist**, which is worth stating rather than quietly fixing: the component was
 * extracted precisely because the tabbed editor's first draft rebuilt it as a plain `SelectField`
 * and silently lost four shipped behaviours — the ADR-0053 §4 combobox, the loading and error
 * states, the unresolvable-value fallback and the `RESOURCE_DEPENDENT` reason. Every one of those
 * failures renders a field that looks right and reports a calendar the activity does not have. The
 * component's own docblock says all of that; nothing asserted any of it, so the only coverage was
 * whatever its two callers happened to exercise, and one of them did not call it at all.
 */

function calendar(overrides: Partial<CalendarSummary> = {}): CalendarSummary {
  return {
    id: 'cal-1',
    name: '5-day week',
    description: null,
    workingWeekdays: 31,
    shifts: WorkingWeekdays.toFullDayShifts(31),
    hoursPerDay: 8,
    hoursPerDayMinutes: 480,
    scope: 'ORG',
    projectId: null,
    archivedAt: null,
    version: 1,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const RESOURCE_DEPENDENT_REASON =
  'Not used by a resource-dependent activity — it is scheduled on its driving resource’s calendar instead. Change the type back to set a calendar here.';

const ORDINARY_HINT =
  'The working-time calendar this activity is scheduled on. Inherits the plan’s calendar unless you pick one. Recalculate to apply it to the activity’s dates.';

function mount(
  props: Partial<React.ComponentProps<typeof ActivityCalendarField>> = {},
  gate?: FieldGate,
): ReturnType<typeof render> {
  const field = (
    <ActivityCalendarField
      value=""
      onChange={() => {}}
      calendars={[calendar()]}
      activityType="TASK"
      {...props}
    />
  );
  return render(gate ? <FieldGateProvider gate={gate}>{field}</FieldGateProvider> : field);
}

const field = (): HTMLElement => screen.getByRole('combobox', { name: 'Calendar' });
/** Open the popup exactly as a keyboard user does (APG: ↓ opens at the first option). */
const open = (): void => {
  fireEvent.keyDown(field(), { key: 'ArrowDown' });
};

const describedText = (control: HTMLElement): string =>
  (control.getAttribute('aria-describedby') ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();

describe('ActivityCalendarField', () => {
  it('renders a combobox, not a plain select', () => {
    // The ADR-0053 §4 primitive, default-on since 2026-07-26. A `SelectField` would pass a naive
    // "is there a calendar control" assertion while losing type-ahead over a large library.
    mount();
    expect(field()).toBeVisible();
  });

  it('reads as the plan’s calendar when nothing is bound', () => {
    mount();
    expect(field()).toHaveValue('Plan default (inherit)');
  });

  it('explains what the field does when it applies', () => {
    mount();
    expect(describedText(field())).toBe(ORDINARY_HINT);
  });

  describe('a resource-dependent activity', () => {
    it('is read-only rather than disabled, so the binding stays readable', () => {
      // ADR-0083 D1 row 4: a control whose operations go beyond changing its value — caret,
      // selection, copy — takes `readOnly`. Disabling it would hide which calendar the activity
      // carries from the reader who most needs to know it is being overridden.
      mount({ activityType: 'RESOURCE_DEPENDENT' });
      expect(field()).toHaveAttribute('readonly');
      expect(field()).not.toBeDisabled();
    });

    it('says WHY it is unavailable, not merely that it is', () => {
      mount({ activityType: 'RESOURCE_DEPENDENT' });
      expect(describedText(field())).toBe(RESOURCE_DEPENDENT_REASON);
    });
  });

  describe('the scope’s own gate', () => {
    it('shades the field when the enclosing provider says it is not writable', () => {
      // The gate arrives through the provider rather than a `disabled` prop a caller has to
      // remember to pass (ADR-0083 D4) — which is exactly the kind of prop one host forgets.
      mount({}, { writable: false, reason: 'Someone else is editing this plan.' });
      expect(field()).toHaveAttribute('readonly');
    });

    it('leaves the field live when there is no provider at all', () => {
      // The create surface has none: creating is one act with one permission.
      mount();
      expect(field()).not.toHaveAttribute('readonly');
    });

    it('prefers the resource-dependent reason over the gate’s, being the more specific', () => {
      mount({ activityType: 'RESOURCE_DEPENDENT' }, { writable: false, reason: 'No pen.' });
      expect(describedText(field())).toBe(RESOURCE_DEPENDENT_REASON);
    });
  });

  describe('the three states it refuses to fake', () => {
    it('keeps a still-loading value selected rather than reading as “inherit”', () => {
      // Asserted as the literal text, not merely "not blank": the empty state renders
      // "Plan default (inherit)", so a non-emptiness check would pass on exactly the wrong answer.
      mount({ value: 'cal-9', calendars: [], loading: true });
      expect(field()).toHaveValue('Loading…');
    });

    it('says the list failed rather than offering a short one', () => {
      mount({ calendars: [], errored: true });
      expect(
        screen.getByText(/Couldn’t load the calendar list, so only/, { exact: false }),
      ).toBeVisible();
      expect(field()).toHaveAttribute('aria-invalid', 'true');
    });

    it('still shows a bound calendar the list does not contain', () => {
      // Blank would read as "inherits the plan's", which is a different answer to a different
      // question — and the one the save would then contradict.
      mount({ value: 'cal-9', calendars: [calendar()] });
      expect(field()).toHaveValue('Unavailable');
    });
  });

  describe('an archived seeded calendar (ADR-0053 §4)', () => {
    it('keeps it selected, badged Archived, rather than reading as an ordinary choice', () => {
      // Ported from `ActivityCreateDialog.scope.test.tsx` (deleted with the create dialog's edit
      // path, activity-dialog-unification epic): every list read defaults to `?archived=exclude`,
      // so an archived row is only ever present here because the CURRENT value is archived —
      // `offerableCalendars` keeps it in, `toCalendarOptions` badges it, and this is what makes
      // that state honest rather than invisible.
      const archived = calendar({
        id: 'cal-old',
        name: 'Winter shutdown',
        archivedAt: '2026-07-01T00:00:00Z',
      });
      // A second archived calendar the seeded value is NOT on — it must never be offered for a
      // new selection, only the current, seeded one.
      const summer = calendar({
        id: 'cal-summer',
        name: 'Summer shutdown',
        archivedAt: '2026-07-01T00:00:00Z',
      });
      mount({ value: 'cal-old', calendars: [calendar(), archived, summer] });
      expect(field()).toHaveValue('Winter shutdown');
      open();
      expect(screen.getByRole('option', { name: 'Winter shutdown, Archived' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
      expect(within(screen.getByRole('listbox')).queryByText(/Summer/)).not.toBeInTheDocument();
    });
  });
});

describe('the group gate’s reason is reachable, not merely visible', () => {
  it('points the control at the enclosing provider’s reason', () => {
    // WCAG 1.3.1. The reason paragraph is rendered once above the fields and published by id; this
    // component read `useFieldGate()?.writable` directly, so it shaded the control and never joined
    // that sentence to it. A sighted reader saw the explanation; nothing connected it to the field.
    // Every sibling gets this from the shared `*Field` primitives — this one predates them.
    mount({}, { writable: false, reason: 'Someone else is editing this plan.' });
    expect(describedText(field())).toContain('Someone else is editing this plan.');
  });

  it('prefers the resource-dependent reason alone, being the more specific', () => {
    // The nearest-reason rule (ADR-0083 D4): two sentences would say the field is shut twice, and
    // the type-specific one is the actionable half.
    mount({ activityType: 'RESOURCE_DEPENDENT' }, { writable: false, reason: 'No pen.' });
    expect(describedText(field())).toBe(RESOURCE_DEPENDENT_REASON);
  });
});
