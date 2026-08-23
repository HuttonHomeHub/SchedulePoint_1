import { describe, expect, it } from 'vitest';

import {
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
    expect(describeUnsavedWork([editor(scope('general', 'General'), scope('cost', 'Cost'))])).toBe(
      'General, Cost have unsaved changes.',
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
      'General, Scheduling have unsaved changes. They can no longer be saved, because you no longer hold the edit lock.',
    );
  });

  it('names only the unsavable scopes when some can still be saved', () => {
    // The real mixed case: definition scopes need the pen, progress deliberately does not
    // (ADR-0060), so losing the pen strands some scopes and leaves others writable.
    const report = [
      editor(scope('general', 'General', false), scope('progress', 'Progress', true)),
    ];
    expect(describeUnsavedWork(report)).toBe(
      'General, Progress have unsaved changes. General can no longer be saved, because you no longer hold the edit lock.',
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
