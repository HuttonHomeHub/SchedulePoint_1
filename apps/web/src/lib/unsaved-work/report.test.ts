import { describe, expect, it } from 'vitest';

import {
  buildReport,
  describeUnsavedWork,
  hasUnsavedWork,
  unsavableScopes,
  type UnsavedWorkReport,
} from './report';

const scope = (key: string, label: string, savable = true) => ({ key, label, savable });
const editor = (...scopes: ReturnType<typeof scope>[]): UnsavedWorkReport => ({
  subject: 'This activity',
  scopes,
});

describe('unsaved-work report', () => {
  it('is empty when nothing is dirty', () => {
    expect(hasUnsavedWork([])).toBe(false);
    expect(hasUnsavedWork([editor()])).toBe(false);
    expect(describeUnsavedWork([editor()])).toBe('');
  });

  /**
   * These are the FIRST SENTENCE of what `ActivityEditorDialog.tsx:856-863` prints today, asserted
   * verbatim so M2-T3 — replacing that copy with a call to this — is provably a no-op for the three
   * scopes that already worked, and shows up only in the three that were silently omitted.
   *
   * Deliberately NOT the whole string: the editor appends a context clause (`Closing will discard
   * them.` / `Switching to X will discard them.`) and a navigation guard needs a third. That clause
   * belongs at the call site, because only the call site knows which action is being confirmed —
   * folding it in here would mean this builder growing a parameter for every future caller.
   */
  it('reproduces the editor’s existing first sentence, including has/have agreement', () => {
    expect(describeUnsavedWork([editor(scope('general', 'General'))])).toBe(
      'General has unsaved changes.',
    );
    // "General **and** Cost", not "General, Cost" (`docs/TECH_DEBT.md` #184). The multi-surface
    // branch below always said "and", so the same confirmation read two ways depending on how many
    // surfaces were dirty; both branches now share one `joinWithAnd`.
    expect(describeUnsavedWork([editor(scope('general', 'General'), scope('cost', 'Cost'))])).toBe(
      'General and Cost have unsaved changes.',
    );
  });

  /**
   * `docs/TECH_DEBT.md` #184. **No test had ever read the six-scope sentence**, which is how it
   * shipped as one unpunctuated comma list — every scope the activity editor holds, in one breath,
   * with the number a reader most wants left for them to count. Past four names the count leads.
   *
   * Three is the last length that reads as a phrase, so it is pinned beside four: a threshold with
   * only one side asserted is a threshold nobody can move safely.
   */
  it('leads with the count once the list is too long to be a phrase', () => {
    expect(
      describeUnsavedWork([
        editor(
          scope('general', 'General'),
          scope('scheduling', 'Scheduling'),
          scope('cost', 'Cost'),
        ),
      ]),
    ).toBe('General, Scheduling and Cost have unsaved changes.');

    expect(
      describeUnsavedWork([
        editor(
          scope('general', 'General'),
          scope('scheduling', 'Scheduling'),
          scope('cost', 'Cost'),
          scope('progress', 'Reported progress'),
          scope('measure', 'How value is measured'),
          scope('steps', 'Weighted steps'),
        ),
      ]),
    ).toBe(
      '6 sections have unsaved changes: General, Scheduling, Cost, Reported progress, ' +
        'How value is measured and Weighted steps.',
    );
  });

  it('names the subjects rather than the scopes when more than one surface holds work', () => {
    const calendar: UnsavedWorkReport = {
      subject: 'The calendar',
      scopes: [scope('week', 'Working week')],
    };
    expect(describeUnsavedWork([editor(scope('general', 'General')), calendar])).toBe(
      'This activity and The calendar have unsaved changes.',
    );
  });

  it('says the work cannot be saved when the pen is gone (CQ-2)', () => {
    const report = [
      editor(scope('general', 'General', false), scope('scheduling', 'Scheduling', false)),
    ];
    expect(unsavableScopes(report)).toHaveLength(2);
    expect(describeUnsavedWork(report)).toBe(
      'General and Scheduling have unsaved changes. They can no longer be saved, because you no longer hold the edit lock.',
    );
  });

  it('names only the unsavable scopes when some can still be saved', () => {
    // The real mixed case: definition scopes need the pen, progress deliberately does not
    // (ADR-0060), so losing the pen strands some scopes and leaves others writable.
    const report = [
      editor(scope('general', 'General', false), scope('progress', 'Progress', true)),
    ];
    expect(describeUnsavedWork(report)).toBe(
      'General and Progress have unsaved changes. General can no longer be saved, because you no longer hold the edit lock.',
    );
  });

  it('ignores surfaces that registered but hold nothing', () => {
    expect(
      describeUnsavedWork([
        editor(),
        { subject: 'The calendar', scopes: [scope('week', 'Working week')] },
      ]),
    ).toBe('Working week has unsaved changes.');
  });
});

describe('buildReport', () => {
  it('keeps only the candidates whose condition holds, in order', () => {
    expect(
      buildReport('This activity', [
        { when: true, key: 'general', label: 'General', savable: true },
        { when: false, key: 'scheduling', label: 'Scheduling', savable: true },
        { when: true, key: 'cost', label: 'Cost', savable: false },
      ]),
    ).toEqual({
      subject: 'This activity',
      scopes: [
        { key: 'general', label: 'General', savable: true },
        { key: 'cost', label: 'Cost', savable: false },
      ],
    });
  });

  /**
   * `when` must not survive into the report. It is assembly input, and an `UnsavedScope` carrying
   * an extra truthy field is one more thing every future consumer has to know not to trust — the
   * kind of leak `toEqual` catches and `toMatchObject` would not.
   */
  it('does not leak the condition into the scopes it returns', () => {
    const [scope] = buildReport('x', [{ when: true, key: 'a', label: 'A', savable: true }]).scopes;
    expect(Object.keys(scope ?? {}).sort()).toEqual(['key', 'label', 'savable']);
  });

  it('returns an empty report rather than null when nothing holds', () => {
    const report = buildReport('This calendar', [
      { when: false, key: 'details', label: 'Calendar details', savable: true },
    ]);
    // The caller decides whether an empty report is registered at all — `hasUnsavedWork` is what
    // reads it, and every call site already guards on its own open/dirty state.
    expect(report.scopes).toEqual([]);
    expect(hasUnsavedWork([report])).toBe(false);
  });
});
