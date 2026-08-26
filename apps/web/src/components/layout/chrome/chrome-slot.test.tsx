import { render, screen } from '@testing-library/react';
import { createContext } from 'react';
import { describe, expect, it } from 'vitest';

import {
  CHROME_SLOT_NAMES,
  ChromePortal,
  ChromeSlot,
  ChromeSlotProvider,
  useChromeSlot,
  type ChromeSlotName,
} from './chrome-slot';
import { TEST_CHROME_SLOTS, TestChromeHost } from './test-chrome-host';

/**
 * The chrome slot (ADR-0055 §3). This used to be the flag-ON half of a pair, and its docblock
 * named a `chrome-slot.flag-off.test.tsx` sibling that has never existed in this repository —
 * a citation nothing checked. `VITE_DESIGNED_CHROME` retired in Graphite M2, so there is one
 * behaviour and one suite.
 */

/** Stands in for the workspace's own contexts (the model, the toolbar context, the registry). */
const WorkspaceContext = createContext('');

function Band({ children }: { children: React.ReactNode }): React.ReactElement {
  const { slotRef, node } = useChromeSlot();
  return (
    <ChromeSlotProvider nodes={{ rows: node }}>
      <div data-testid="band">
        <ChromeSlot slotRef={slotRef} />
      </div>
      <div data-testid="workspace">{children}</div>
    </ChromeSlotProvider>
  );
}

describe('ChromeSlot / ChromePortal (flag on)', () => {
  it('renders portalled children into the band, not where they are written', () => {
    render(
      <Band>
        <ChromePortal>
          <button type="button">Recalculate</button>
        </ChromePortal>
      </Band>,
    );
    const button = screen.getByRole('button', { name: 'Recalculate' });
    expect(screen.getByTestId('band')).toContainElement(button);
    expect(screen.getByTestId('workspace')).not.toContainElement(button);
  });

  it('renders the children exactly once', () => {
    // The failure this guards is the tempting "render in place until the slot mounts" fallback:
    // it paints the toolbar twice for one frame on the way in.
    render(
      <Band>
        <ChromePortal>
          <button type="button">Recalculate</button>
        </ChromePortal>
      </Band>,
    );
    expect(screen.getAllByRole('button', { name: 'Recalculate' })).toHaveLength(1);
  });

  it('renders nothing, and does not throw, when there is no band above it', () => {
    // Every unit-test harness that mounts a workspace without the shell is in this state.
    expect(() =>
      render(
        <ChromePortal>
          <button type="button">Recalculate</button>
        </ChromePortal>,
      ),
    ).not.toThrow();
    expect(screen.queryByRole('button', { name: 'Recalculate' })).not.toBeInTheDocument();
  });

  it('keeps the portalled subtree in the REACT tree — context still reaches it', () => {
    // This is the whole reason for a portal rather than lifting state: the toolbar keeps reading
    // the workspace's context, so `usePlanWorkspaceModel` and the registry predicates are untouched.
    const Ctx = WorkspaceContext;
    render(
      <Band>
        <Ctx.Provider value="from the workspace">
          <ChromePortal>
            <Ctx.Consumer>{(value) => <span data-testid="ctx">{value}</span>}</Ctx.Consumer>
          </ChromePortal>
        </Ctx.Provider>
      </Band>,
    );
    expect(screen.getByTestId('ctx')).toHaveTextContent('from the workspace');
    expect(screen.getByTestId('band')).toContainElement(screen.getByTestId('ctx'));
  });
});

/**
 * **Every name in `ChromeSlotName` has a target in `TestChromeHost`.**
 *
 * The rule is not new; the gate is. `test-chrome-host.tsx`'s docblock has claimed since Graphite M7
 * that "`chrome-slot.test.tsx` pins that, so adding a fifth name fails here rather than silently" —
 * and nothing in this repository referenced `ChromeSlotName` from a test at all. The claim was
 * disproved the first time it mattered: adding `identity` for the one-row header produced exactly
 * the silent gap that paragraph promises to prevent, and the failure surfaced two files away, in
 * suites that were suddenly rendering a screen with a piece missing.
 *
 * A type-level `satisfies` cannot do this job: it proves every listed name is valid and says nothing
 * about a name that is **absent**, which is the only direction that fails. So the check is a runtime
 * comparison against the union's members, listed once here — and the second assertion holds that
 * list against what the component actually renders, because a roster that drifts from its own
 * component is the defect one layer along (ADR-0073 C4).
 */
describe('TestChromeHost covers every chrome slot', () => {
  // `CHROME_SLOT_NAMES` is the single roster the union itself derives from, so there is nothing to
  // keep in step here. The third hand-written copy that used to sit on this line was the component
  // review's finding: a `readonly ChromeSlotName[]` annotation accepts a SUBSET, so omitting a name
  // from it type-checks and silently narrows the gate written to catch that exact omission.
  const EVERY_NAME: readonly ChromeSlotName[] = CHROME_SLOT_NAMES;

  it('mounts a target for every name', () => {
    expect([...TEST_CHROME_SLOTS].sort()).toEqual([...EVERY_NAME].sort());
  });

  it('and the roster matches what it actually renders', () => {
    const { container } = render(
      <TestChromeHost>
        <span />
      </TestChromeHost>,
    );
    const rendered = [...container.querySelectorAll('[data-chrome-slot]')].map((n) =>
      n.getAttribute('data-chrome-slot'),
    );
    expect(rendered.sort()).toEqual([...EVERY_NAME].sort());
  });
});
