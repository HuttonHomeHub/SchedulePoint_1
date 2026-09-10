import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { makeTsldToolbarContext } from './test-helpers';
import { buildTsldToolbarItems } from './tsld-toolbar-items';

import { Deck, Toolbar, splitByRow } from '@/components/ui/toolbar';
import { usePenLockView } from '@/features/plan-lock';
import type { PlanPen } from '@/features/plan-lock/api/use-plan-edit-lock';

/**
 * **The `pen` toolbar item, across every branch `resolveLockView` can produce** (console epic
 * M5-T3).
 *
 * The pen left the identity row for the head of the DO row it unlocks, which means the eleven
 * authoring commands and the control that enables them now share one roving set. The property that
 * has to hold for all thirteen lock branches — and the one a per-branch reading of the registry
 * cannot establish — is that the item **always renders and always says why**: exactly one of three
 * appearances, never an absence. An item that disappears takes a roving stop with it and shifts
 * every command on the row sideways, so a planner reaching for `Add activity` by muscle memory
 * lands on `Link` instead, and only in the states where the pen is unavailable.
 *
 * **The branch table is DERIVED, never restated.** Each case builds a real `PlanEditLockStatus`,
 * runs it through the real `usePenLockView` (and therefore the real `resolveLockView`), and hands
 * the result to the real registry. A table of hand-written `actions` arrays would pass equally
 * against a `resolveLockView` that had stopped producing them — which is the shape this repository
 * keeps recording, most recently in the two M4 harness reads that were correct arithmetic over a
 * DOM that had changed underneath them.
 *
 * The three appearances, and what discriminates them:
 *
 * | condition                  | label         | `aria-pressed` | shaded | fill            |
 * | -------------------------- | ------------- | -------------- | ------ | --------------- |
 * | the view's tone is editing | Stop editing  | `true`         | no     | `bg-primary`    |
 * | `actions` contains `start` | Start editing | `false`        | no     | none (the band) |
 * | neither                    | Start editing | `false`        | yes    | none (the band) |
 *
 * **"I hold the pen" is the view's TONE, never `actions.includes('stop')`**, and the first version
 * of this table got that wrong in a way it also pinned: it listed `held by me, someone is asking`
 * as shaded, because `resolveLockView` drops `stop` from that branch's action list in favour of
 * `Hand over` / `Keep editing`. You are editing throughout — `holdsPen`, `canEditSchedule` and
 * `authoringEnabled` are all true — so the row shaded the pen and described it as _"Jane is asking
 * to edit this plan"_ beside eleven live authoring commands. A suite written by asserting agreement
 * with `resolveLockView`'s output cannot find that, because it agrees. The accessibility review
 * did; `penVerbs` carries the corrected rule and the reasoning.
 *
 * **`aria-pressed` is present in every state**, which is the codebase's convention for a control
 * that declares `isActive`: whether the attribute exists is a property of the control being
 * toggle-shaped, never of its current value. It was conditional in the first version, so the same
 * element was exposed as a toggle button in one state and a plain button in the others.
 */
vi.mock('@/config/env', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  PLAN_EDIT_LOCK_ENABLED: true,
}));

const ME = { id: 'u-me', name: 'Mo Hale' };
const JANE = { id: 'u-jane', name: 'Jane Okonkwo' };

/** A `PlanPen` whose only interesting fields are the status and the lost-control reason. */
function pen(over: Partial<PlanPen> = {}): PlanPen {
  return {
    penManaged: true,
    status: undefined,
    holdsPen: false,
    isPending: false,
    lostControl: null,
    dismissLost: vi.fn(),
    startEditing: vi.fn(),
    stopEditing: vi.fn(),
    requestControl: vi.fn(),
    handoff: vi.fn(),
    takeOver: vi.fn(),
    onWriteRejected: vi.fn(),
    ...over,
  };
}

/** The status shape `resolveLockView` reads, with every capability flag off by default. */
function status(over: Record<string, unknown>): PlanPen['status'] {
  return {
    state: 'FREE',
    holder: null,
    requestedBy: null,
    heartbeatAt: null,
    graceEndsAt: null,
    canAcquire: false,
    canRequest: false,
    canTakeOver: false,
    canOverride: false,
    ...over,
  } as unknown as PlanPen['status'];
}

/**
 * Render the DO row with the pen resolved from `planPen` by the real hook.
 *
 * `authoringEnabled` is false throughout, deliberately: it is the gate the pen EXISTS to open, so
 * every case here is a planner who does not yet hold it. Passing true would test the pen beside a
 * row that is already unlocked, which is not a state the product reaches.
 */
function renderPen(planPen: PlanPen, surface: 'toolbar' | 'deck' = 'toolbar') {
  function Host(): React.ReactElement {
    const penLock = usePenLockView(planPen, ME.id, 1_700_000_000_000);
    const items = buildTsldToolbarItems();
    const context = makeTsldToolbarContext({ penLock, hasDiagram: true, canvasActive: true });
    if (surface === 'deck') {
      return (
        <Deck items={items} context={context} label="Author and act" authoringEnabled={false} />
      );
    }
    return (
      <Toolbar
        items={splitByRow(items).strip}
        context={context}
        label="Author and act"
        authoringEnabled={false}
      />
    );
  }
  return render(<Host />);
}

/** The pen control, found by either of its two names — never by a test id. */
const penControl = (): HTMLElement =>
  screen.getByRole('button', { name: /^(start|stop) editing$/i });

/** Every branch `resolveLockView` returns, keyed by what the pen should look like. */
const BRANCHES: ReadonlyArray<{
  name: string;
  pen: PlanPen;
  expect: 'stop' | 'start' | 'shaded';
}> = [
  { name: 'status still loading', pen: pen(), expect: 'shaded' },
  {
    name: 'lost control (423)',
    pen: pen({
      status: status({ state: 'HELD_BY_OTHER', holder: JANE }),
      lostControl: 'TAKEN_OVER' as PlanPen['lostControl'],
    }),
    expect: 'shaded',
  },
  {
    name: 'FREE, may acquire',
    pen: pen({ status: status({ state: 'FREE', canAcquire: true }) }),
    expect: 'start',
  },
  {
    name: 'FREE, may not acquire',
    pen: pen({ status: status({ state: 'FREE', canAcquire: false }) }),
    expect: 'shaded',
  },
  {
    name: 'EXPIRED, may acquire',
    pen: pen({ status: status({ state: 'EXPIRED', holder: JANE, canAcquire: true }) }),
    expect: 'start',
  },
  {
    name: 'EXPIRED, may not acquire',
    pen: pen({ status: status({ state: 'EXPIRED', holder: JANE, canAcquire: false }) }),
    expect: 'shaded',
  },
  {
    name: 'held by me',
    pen: pen({ status: status({ state: 'HELD_BY_ME', holder: ME }) }),
    expect: 'stop',
  },
  {
    // **`stop`, not `shaded`** — the branch the accessibility review found. See the header.
    name: 'held by me, someone is asking',
    pen: pen({ status: status({ state: 'HELD_BY_ME', holder: ME, requestedBy: JANE }) }),
    expect: 'stop',
  },
  {
    name: 'held by other, no holder recorded (defensive)',
    pen: pen({ status: status({ state: 'HELD_BY_OTHER', holder: null }) }),
    expect: 'shaded',
  },
  {
    name: 'held by other, admin may override',
    pen: pen({ status: status({ state: 'HELD_BY_OTHER', holder: JANE, canOverride: true }) }),
    expect: 'shaded',
  },
  {
    name: 'held by other, peer may take over',
    pen: pen({ status: status({ state: 'HELD_BY_OTHER', holder: JANE, canTakeOver: true }) }),
    expect: 'shaded',
  },
  {
    name: 'held by other, my request is waiting out grace',
    pen: pen({
      status: status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true, requestedBy: ME }),
    }),
    expect: 'shaded',
  },
  {
    name: 'held by other, I may request',
    pen: pen({ status: status({ state: 'HELD_BY_OTHER', holder: JANE, canRequest: true }) }),
    expect: 'shaded',
  },
  {
    name: 'held by other, read-only role',
    pen: pen({ status: status({ state: 'HELD_BY_OTHER', holder: JANE }) }),
    expect: 'shaded',
  },
];

describe('the pen toolbar item, across every lock branch', () => {
  it.each(BRANCHES)(
    '$name renders the pen and no other appearance',
    ({ pen: planPen, expect: want }) => {
      renderPen(planPen);
      const control = penControl();

      if (want === 'stop') {
        expect(control).toHaveAccessibleName(/stop editing/i);
        expect(control).toHaveAttribute('aria-pressed', 'true');
        expect(control).not.toHaveAttribute('aria-disabled');
      } else {
        expect(control).toHaveAccessibleName(/start editing/i);
        expect(control).toHaveAttribute('aria-pressed', 'false');
        if (want === 'shaded') expect(control).toHaveAttribute('aria-disabled', 'true');
        else expect(control).not.toHaveAttribute('aria-disabled');
      }

      // **The PICTURE, and it is the assertion the milestone most needed and shipped without.** The
      // first version of this suite read the accessible name, the pressed state and the shading,
      // and none of those can tell an amber-FILLED pen from an amber-INKED armed tool — so the pen
      // was wired to `armed` and every gate here stayed green, including the structural one built
      // for exactly this class (it enumerates registry declarations, and the pen declared none).
      //
      // `bg-primary` is what makes the pen the row's one amber slab; bare `text-primary` with no
      // fill is what an ARMED tool takes. Asserting the absence of the second is the half that
      // discriminates: both class strings contain `primary`, so a fill-only assertion passes
      // against a control wearing both.
      if (want === 'stop') {
        expect(control.className).toContain('bg-primary');
        expect(control.className).toContain('text-primary-foreground');
        expect(control.className.split(/\s+/)).not.toContain('text-primary');
      } else {
        expect(control.className).not.toContain('bg-primary');
      }
    },
  );

  /**
   * The invariant the table above cannot state case by case: the roving set is the same size, and
   * the pen sits at the same index, in all thirteen branches. Asserted on the INDEX rather than on
   * the count alone — a count is preserved by an item swapping places with its neighbour, which is
   * the failure a planner would feel.
   *
   * The index is read rather than asserted to be zero, because zero is a fact about the DECK and
   * this case covers both surfaces: `Toolbar` lays the whole registry out in group order, where the
   * `tools` group is not first. The case below pins the head-of-row claim where it is true.
   */
  it.each(['toolbar', 'deck'] as const)(
    'keeps the roving set and the pen index stable across every branch (%s)',
    (surface) => {
      const indices = new Set<number>();
      const widths = new Set<number>();
      for (const branch of BRANCHES) {
        const { unmount } = renderPen(branch.pen, surface);
        const stops = Array.from(document.querySelectorAll('[data-toolbar-item]'));
        widths.add(stops.length);
        indices.add(stops.findIndex((el) => el.getAttribute('data-toolbar-item') === 'pen'));
        unmount();
      }
      expect(widths.size).toBe(1);
      expect(indices.size).toBe(1);
      expect([...indices][0]).toBeGreaterThanOrEqual(0);
    },
  );

  /**
   * **The milestone's own claim: the pen leads the row it unlocks.** `Author` is the deck's first
   * DO-row card and the pen is its first control, so the control that opens the eleven authoring
   * commands sits immediately before them rather than three sections away on the identity line.
   */
  it('puts the pen first in the deck DO row', () => {
    renderPen(pen({ status: status({ state: 'FREE', canAcquire: true }) }), 'deck');
    const row = document.querySelector('[data-deck-row="do"]');
    expect(row).not.toBeNull();
    const first = row?.querySelector('[data-toolbar-item]');
    expect(first?.getAttribute('data-toolbar-item')).toBe('pen');
  });

  /**
   * A shaded pen still says why, on the same channel `ToolbarButton` uses everywhere else
   * (ADR-0082): an `sr-only` sibling wired by `aria-describedby`, never folded into the name.
   * Without this the eleven shaded authoring commands would each explain themselves and the one
   * control that opens them would not.
   */
  it('gives a shaded pen a reason a screen reader can reach', () => {
    renderPen(pen({ status: status({ state: 'HELD_BY_OTHER', holder: JANE }) }));
    expect(penControl()).toHaveAccessibleDescription(/jane/i);
  });
});
