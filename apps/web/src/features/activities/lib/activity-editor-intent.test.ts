import type { ActivitySummary } from '@repo/types';
import { describe, expect, it } from 'vitest';

import {
  openActivityEditor,
  type ActivityEditorPurpose,
  type ActivityEditorIntent,
} from './activity-editor-intent';

const ROW = { id: 'act-1' } as ActivitySummary;

describe('openActivityEditor', () => {
  const CASES: [ActivityEditorPurpose, ActivityEditorIntent][] = [
    ['edit', { activityId: 'act-1', tab: 'general' }],
    ['progress', { activityId: 'act-1', tab: 'progress' }],
    ['steps', { activityId: 'act-1', tab: 'progress', focusSteps: true }],
  ];

  it.each(CASES)('maps %s to its intent', (purpose, expected) => {
    expect(openActivityEditor(ROW, purpose)).toEqual(expected);
  });

  it('sends Progress and Steps to the same tab, differing only in focus', () => {
    // The epic's central claim, as an assertion: these are one subject, not two dialogs.
    const progress = openActivityEditor(ROW, 'progress');
    const steps = openActivityEditor(ROW, 'steps');
    expect(steps.tab).toBe(progress.tab);
    expect(progress.focusSteps).toBeUndefined();
    expect(steps.focusSteps).toBe(true);
  });

  it('carries an id, never a row', () => {
    // Holding the row would freeze `version` at open time; every host re-derives from the live
    // query so the next save carries the version a sibling scope's save produced.
    expect(Object.keys(openActivityEditor(ROW, 'edit'))).toEqual(['activityId', 'tab']);
  });
});
