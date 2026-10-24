import { describe, expect, it } from 'vitest';

import { buildTsldToolbarItems, LENS_TOGGLES } from './tsld-toolbar-items';

import { makeTsldToolbarContext } from '@/features/tsld/toolbar/test-helpers';

/**
 * **The Swimlanes lens is registered, shut by reason, and offered to nobody** (swimlanes M2-T2,
 * ui-architecture C1). It is dark until M2-T11: `enabled: false` keeps it out of every built
 * registry and out of `View ▾`, which is what lets the paint and the state land first.
 */
const lens = () => {
  const item = LENS_TOGGLES.find((i) => i.id === 'swimlanes');
  // A `find` that returns nothing would make every assertion below vacuous.
  expect(item, 'the swimlanes lens must be registered').toBeDefined();
  return item!;
};

describe('the Swimlanes lens', () => {
  it('lives in the Structure section and is not offered', () => {
    expect(lens().group).toBe('structure');
    expect(lens().enabled).toBe(false);
    expect(buildTsldToolbarItems().some((i) => i.id.includes('swimlanes'))).toBe(false);
  });

  it('reads its checked state and toggles through the context', () => {
    let toggled = 0;
    const ctx = makeTsldToolbarContext({
      swimlanesShown: true,
      toggleSwimlanes: () => {
        toggled += 1;
      },
    });
    expect(lens().checked(ctx)).toBe(true);
    lens().toggle(ctx);
    expect(toggled).toBe(1);
  });

  it('is open when there is a diagram and swimlanes are set up and loaded', () => {
    expect(lens().reason(makeTsldToolbarContext({ hasDiagram: true }))).toBeUndefined();
  });

  it('shuts with the reasons in order: no diagram, nothing set up, loading, failed', () => {
    const all = {
      hasDiagram: false,
      swimlanesSetUp: false,
      swimlanesLoading: true,
      swimlanesFailed: true,
    };
    const reason = (over: Partial<typeof all>) =>
      lens().reason(makeTsldToolbarContext({ ...all, ...over }));
    const noDiagram = reason({});
    const nothing = reason({ hasDiagram: true });
    const loading = reason({ hasDiagram: true, swimlanesSetUp: true });
    const failed = reason({ hasDiagram: true, swimlanesSetUp: true, swimlanesLoading: false });
    expect(nothing).toBe('No swimlanes have been set up for this plan.');
    expect(loading).toBe('Loading swimlanes…');
    // No instruction: nothing in the product offers a retry, and the list is read again on its own.
    expect(failed).toBe("Couldn't load swimlanes.");
    expect(new Set([noDiagram, nothing, loading, failed]).size).toBe(4);
  });
});
