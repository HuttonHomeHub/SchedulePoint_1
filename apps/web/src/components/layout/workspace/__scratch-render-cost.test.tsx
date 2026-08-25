import { render, act } from '@testing-library/react';
import { useState } from 'react';
import { describe, it, expect } from 'vitest';
import { PlanFactsProvider, PlanFactsOutlet, PlanFactsHost } from './plan-facts-host';

let heavyRenderCount = 0;
let hostRenderCount = 0;
let outletRenderCount = 0;

function HeavyCanvasStandIn({ tick }: { tick: number }) {
  heavyRenderCount++;
  return <div data-tick={tick} />;
}

function StatusStandIn() {
  hostRenderCount++;
  return (
    <PlanFactsHost>
      <span>facts</span>
    </PlanFactsHost>
  );
}

function OutletStandIn() {
  outletRenderCount++;
  return <PlanFactsOutlet />;
}

// Everything below this point is INSIDE PlanFactsProvider already (mirrors production: the layout
// state that mounts/unmounts the outlet lives in the SAME component as the provider's children, so
// toggling it already forces a cascade). This component isolates ONLY the provider's own internal
// `element` state change from any ancestor re-render.
function InsideProvider({ tick }: { tick: number }) {
  const [outletMounted, setOutletMounted] = useState(false);
  return (
    <div>
      <button onClick={() => setOutletMounted((v) => !v)}>toggle-outlet-from-inside</button>
      <HeavyCanvasStandIn tick={tick} />
      {outletMounted ? <OutletStandIn /> : null}
      <StatusStandIn />
    </div>
  );
}

function Harness() {
  const [tick, setTick] = useState(0);
  return (
    <div>
      <button onClick={() => setTick((t) => t + 1)}>bump-unrelated-state</button>
      <PlanFactsProvider>
        <InsideProvider tick={tick} />
      </PlanFactsProvider>
    </div>
  );
}

describe('scratch: PlanFactsProvider render cost', () => {
  it('logs render counts across an isolated outlet toggle (state owned INSIDE the provider subtree, not by an ancestor)', () => {
    const { getByText } = render(<Harness />);
    heavyRenderCount = 0;
    hostRenderCount = 0;
    outletRenderCount = 0;

    act(() => {
      getByText('toggle-outlet-from-inside').click();
    });
    console.log(
      'after toggle-on: heavy=%d host=%d outlet=%d',
      heavyRenderCount,
      hostRenderCount,
      outletRenderCount,
    );

    heavyRenderCount = 0;
    hostRenderCount = 0;
    outletRenderCount = 0;
    act(() => {
      getByText('toggle-outlet-from-inside').click();
    });
    console.log(
      'after toggle-off: heavy=%d host=%d outlet=%d',
      heavyRenderCount,
      hostRenderCount,
      outletRenderCount,
    );
  });

  it('logs render counts for an unrelated ancestor tick (selection/tool/recalc simulation)', () => {
    const { getByText } = render(<Harness />);
    heavyRenderCount = 0;
    act(() => {
      getByText('bump-unrelated-state').click();
    });
    console.log('after tick 1: heavy=%d', heavyRenderCount);
    heavyRenderCount = 0;
    act(() => {
      getByText('bump-unrelated-state').click();
    });
    console.log('after tick 2: heavy=%d', heavyRenderCount);
  });
});
