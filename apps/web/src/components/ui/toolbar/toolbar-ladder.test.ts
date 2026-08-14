import { describe, expect, it } from 'vitest';

import {
  GROUP_RULE_PX,
  ITEM_GAP_PX,
  computeLadder,
  iconOnlyWidth,
  type LadderInput,
  type LadderItem,
} from './toolbar-ladder';
import { toolbarControlVariants } from './toolbar-styles';

/**
 * **The first tests this arithmetic has ever had.**
 *
 * It used to live inside `Toolbar.measure`, which reads the DOM and early-returns at
 * `available <= 0` — so under jsdom it never ran, and every defect it shipped (a `⋯` charged to
 * nobody, a projection that differed between its own two states, commands painted outside an
 * `overflow-hidden` row at zero visible width) was found in a browser, by a person, after release.
 * A pure function is testable at a desk.
 *
 * The e2e gate (`e2e-toolbar-fit`) still owns the question these cannot answer — *is a control a
 * planner can see a control a planner can click* — because that is about real boxes. These own the
 * decisions.
 */

const NO_ICON = false;
const WITH_ICON = true;
const FINE = false;

function button(id: string, order: number, over: Partial<LadderItem> = {}): LadderItem {
  return {
    id,
    group: 'frame',
    index: order,
    order,
    priority: -order,
    demotable: true,
    baseWidth: iconOnlyWidth(WITH_ICON, FINE), // 32
    labelDelta: 40,
    labelPolicy: 'auto',
    ...over,
  };
}

function input(over: Partial<LadderInput> = {}): LadderInput {
  return {
    available: 1000,
    chrome: 0,
    core: [],
    candidates: [],
    overflowWidth: 44,
    previouslyLabelled: new Set(),
    previouslyAdmitted: new Set(),
    ...over,
  };
}

describe('computeLadder — labels fall one at a time', () => {
  const core = [button('a', 0), button('b', 1), button('c', 2)];
  // Three 32 px buttons + two gaps = 104 fixed; each label costs 40; promotion needs 24 headroom.
  const FIXED = 3 * 32 + 2 * ITEM_GAP_PX;

  it('labels every item when the row can afford them all', () => {
    const { labelled } = computeLadder(input({ core, available: FIXED + 3 * (40 + 24) }));
    expect([...labelled].sort()).toEqual(['a', 'b', 'c']);
  });

  it('drops exactly one when the row can afford exactly two', () => {
    // The behaviour the product owner asked for and the row-level `autoLabelsFit` could not express:
    // this width used to take ALL three labels away at once.
    const { labelled } = computeLadder(input({ core, available: FIXED + 2 * (40 + 24) }));
    expect([...labelled].sort()).toEqual(['a', 'b']);
  });

  it('drops the least wanted first, which is the demotion queue reversed', () => {
    // `priority` defaults to `-order`, so `a` is wanted most and `c` least. If the two orders ever
    // disagreed, a row could demote `a` into the `⋯` while keeping a label on `c`.
    const { labelled } = computeLadder(input({ core, available: FIXED + 1 * (40 + 24) }));
    expect([...labelled]).toEqual(['a']);
  });

  it('respects an explicit priority over registry position', () => {
    const reordered = [
      button('a', 0, { priority: 0 }),
      button('b', 1, { priority: 10 }), // sits second, wanted most
      button('c', 2, { priority: 5 }),
    ];
    const { labelled } = computeLadder(input({ core: reordered, available: FIXED + (40 + 24) }));
    expect([...labelled]).toEqual(['b']);
  });

  it('labels `always` items whatever the width, and never labels `never` items', () => {
    const pinned = [
      button('shown', 0, { labelPolicy: 'always' }),
      button('hidden', 1, { labelPolicy: 'never', labelDelta: null }),
    ];
    // 110 px: wide enough to hold both buttons and one policy label, far too narrow for an `'auto'`
    // one. (Not 1 px — at that width the row holds nothing at all, which says nothing about
    // labelling.)
    const { labelled } = computeLadder(input({ core: pinned, available: 110 }));
    expect([...labelled]).toEqual(['shown']);
  });

  it('never labels an item with no measurable text, and does not punish its neighbours', () => {
    // `labelDelta` is null when there is no 2D context to measure with — icon-only rather than a
    // guess. In practice the condition is all-or-nothing (the context is global), so the
    // neighbour's fate is unobservable in the product; the honest semantics are nonetheless that an
    // unmeasurable item is simply not a label candidate. The old pass abandoned the whole row on the
    // first null, which is the same answer by accident.
    const core2 = [button('a', 0, { labelDelta: null }), button('b', 1)];
    const { labelled } = computeLadder(input({ core: core2, available: 1000 }));
    expect([...labelled]).toEqual(['b']);
  });
});

describe('computeLadder — the labelled set is a prefix, and it never oscillates', () => {
  const core = [button('a', 0), button('b', 1), button('c', 2), button('d', 3)];

  /**
   * **The property the old pass could not hold.** Sweep every width in 1 px steps, carrying each
   * answer forward as the next call's `previouslyLabelled` — exactly what the `ResizeObserver` does
   * as a window edge is dragged.
   *
   * Two assertions, and the second is the one that matters. *Prefix*: the labelled set is always the
   * most-wanted N, never an arbitrary subset — `break`, not best-fit. *Monotone*: widening never
   * removes a label and narrowing never adds one, so the bar cannot flicker while a user is dragging.
   */
  it('holds both properties across a 400 px sweep', () => {
    let previouslyLabelled = new Set<string>();
    let last = 0;
    for (let available = 100; available <= 500; available += 1) {
      const { labelled } = computeLadder(input({ core, available, previouslyLabelled }));
      const ids = core.filter((i) => labelled.has(i.id)).map((i) => i.id);
      expect(ids).toEqual(['a', 'b', 'c', 'd'].slice(0, ids.length));
      expect(labelled.size).toBeGreaterThanOrEqual(last);
      last = labelled.size;
      previouslyLabelled = labelled;
    }
    expect(last).toBe(4);
  });

  it('is idempotent — feeding an answer back changes nothing', () => {
    // The termination proof in one assertion: no output of this function is on its input side except
    // the hysteresis, which by construction only ever confirms what is already there.
    const first = computeLadder(input({ core, available: 300 }));
    const second = computeLadder(
      input({
        core,
        available: 300,
        previouslyLabelled: first.labelled,
        previouslyAdmitted: first.admitted,
      }),
    );
    expect([...second.labelled].sort()).toEqual([...first.labelled].sort());
    expect([...second.overflowed].sort()).toEqual([...first.overflowed].sort());
  });

  it('keeps a label it already has at a width that would not have promoted it', () => {
    // The hysteresis itself: promotion is charged 24 px of headroom, retention none. Without the
    // gap a row parked on a label's exact cost flips it every time the window moves a pixel.
    const at = 2 * 32 + ITEM_GAP_PX + 40; // exactly two buttons, one gap, one label
    const cold = computeLadder(input({ core: core.slice(0, 2), available: at }));
    const warm = computeLadder(
      input({ core: core.slice(0, 2), available: at, previouslyLabelled: new Set(['a']) }),
    );
    expect([...cold.labelled]).toEqual([]);
    expect([...warm.labelled]).toEqual(['a']);
  });
});

describe('computeLadder — demotion', () => {
  it('demotes the least wanted first and stops as soon as the row fits', () => {
    const core = [button('a', 0), button('b', 1), button('c', 2), button('d', 3)];
    // Four 32 px buttons + three gaps = 140. At 100 the row must shed enough to fit, and every
    // demotion also has to pay for the `⋯` that now renders.
    const { overflowed } = computeLadder(input({ core, available: 100 }));
    expect(overflowed.has('d')).toBe(true);
    expect(overflowed.has('a')).toBe(false);
  });

  it('never demotes a pinned `render` item', () => {
    const core = [
      button('pinned', 0, { demotable: false, baseWidth: 200, labelDelta: null }),
      button('b', 1),
    ];
    const { overflowed } = computeLadder(input({ core, available: 40 }));
    expect(overflowed.has('pinned')).toBe(false);
  });

  it('takes a demotionGroup out as one unit', () => {
    const core = [
      button('a', 0),
      button('early', 1, { demotionGroup: 'mode' }),
      button('visual', 2, { demotionGroup: 'mode' }),
    ];
    const { overflowed } = computeLadder(input({ core, available: 60 }));
    // A two-state segment with one half on the bar and the other in a menu is a switch with a
    // hidden state, which is the whole reason `demotionGroup` exists.
    expect(overflowed.has('early')).toBe(overflowed.has('visual'));
  });

  it('never demotes from a row whose width is its own content — the one-way door', () => {
    // **Measured in a browser, not reasoned about.** The `shrink-0` mode row demoted `Diagram` and
    // `Gantt` on a transient narrow first pass, then shrink-wrapped to **37 px holding nothing but
    // the `⋯`** — and could never take them back, because on such a row `available` is an output of
    // this decision. Three journeys failed looking for a view switch that no longer existed.
    //
    // Verified red: without `allowDemotion` the second call overflows both.
    const core = [button('a', 0), button('b', 1)];
    const wrapped = { core, available: 37, allowDemotion: false };
    expect([...computeLadder(input(wrapped)).overflowed]).toEqual([]);
    expect(
      [...computeLadder(input({ ...wrapped, allowDemotion: true })).overflowed].length,
    ).toBeGreaterThan(0);
  });

  it('holds no candidate on the row when the core itself did not fit', () => {
    const core = [button('a', 0), button('b', 1), button('c', 2)];
    const candidates = [button('t3', 9, { group: 'help' })];
    const { admitted, overflowed } = computeLadder(input({ core, candidates, available: 60 }));
    expect([...admitted]).toEqual([]);
    expect(overflowed.has('t3')).toBe(true);
  });
});

describe('computeLadder — tier-3 admission', () => {
  const core = [button('a', 0), button('b', 1)];
  const candidates = [
    button('t1', 10, { group: 'help', priority: 5 }),
    button('t2', 11, { group: 'help', priority: 1 }),
  ];

  it('admits nothing on a row with no room to spare', () => {
    const { admitted, overflowed } = computeLadder(
      input({ core, candidates, available: 2 * 32 + ITEM_GAP_PX }),
    );
    expect([...admitted]).toEqual([]);
    expect(overflowed.has('t1')).toBe(true);
  });

  it('admits the most wanted candidate first', () => {
    // Room for exactly one: two core buttons, their labels, the `⋯`, and one admission.
    const room =
      2 * 32 + ITEM_GAP_PX + 2 * (40 + 24) + 44 + (32 + 40 + ITEM_GAP_PX + GROUP_RULE_PX) + 24;
    const { admitted } = computeLadder(input({ core, candidates, available: room }));
    expect([...admitted]).toEqual(['t1']);
  });

  it('admits every candidate when the row is wide, which is what empties the `⋯`', () => {
    const { admitted, overflowed } = computeLadder(input({ core, candidates, available: 2000 }));
    expect([...admitted].sort()).toEqual(['t1', 't2']);
    // Nothing left in it ⇒ `Toolbar` renders no `⋯` at all. "Hidden unless in use" falls out of
    // admission rather than needing a rule of its own.
    expect([...overflowed]).toEqual([]);
  });

  // A core that never takes a label, so the only variable in the two cases below is the group rule.
  const bareCore = [
    button('a', 0, { labelPolicy: 'never', labelDelta: null }),
    button('b', 1, { labelPolicy: 'never', labelDelta: null }),
  ];
  /** Two 32 px buttons, one gap, and the `⋯` the candidate has not yet emptied. */
  const BARE_FIXED = 2 * 32 + ITEM_GAP_PX + 44;
  /** One candidate: its box, its label, its gap. */
  const ADMIT_COST = 32 + 40 + ITEM_GAP_PX;
  const HYSTERESIS = 24;

  it('charges a candidate the group rule it brings with it', () => {
    // `chrome` is derived from the CORE alone and must stay that way — deriving it from what is
    // admitted would make it downstream of this decision. So a candidate opening a group the core
    // does not have pays the rule as part of its own admission. At exactly the same-group threshold
    // the two answers differ, which is the assertion.
    const atThreshold = BARE_FIXED + ADMIT_COST + HYSTERESIS;
    const sameGroup = [button('t1', 10, { group: 'frame' })];
    const newGroup = [button('t1', 10, { group: 'help' })];
    expect([
      ...computeLadder(input({ core: bareCore, candidates: sameGroup, available: atThreshold }))
        .admitted,
    ]).toEqual(['t1']);
    expect([
      ...computeLadder(input({ core: bareCore, candidates: newGroup, available: atThreshold }))
        .admitted,
    ]).toEqual([]);
  });

  it('charges one group rule for two candidates arriving in the same new group', () => {
    const both = [
      button('t1', 10, { group: 'help', priority: 5 }),
      button('t2', 11, { group: 'help', priority: 1 }),
    ];
    // The hysteresis is a **check**, not a spend — it is required on top of each admission but never
    // deducted — so only the last one binds. Charging it per admission (`2 * (cost + hysteresis)`)
    // over-states the threshold by 24 px, which is how the first version of this case admitted both
    // at a width meant to afford one.
    const room = BARE_FIXED + 2 * ADMIT_COST + GROUP_RULE_PX + HYSTERESIS;
    expect(
      [
        ...computeLadder(input({ core: bareCore, candidates: both, available: room })).admitted,
      ].sort(),
    ).toEqual(['t1', 't2']);
    // One rule short, the second candidate cannot be paid for — proving the rule was charged once
    // rather than not at all.
    expect([
      ...computeLadder(input({ core: bareCore, candidates: both, available: room - GROUP_RULE_PX }))
        .admitted,
    ]).toEqual(['t1']);
  });
});

describe('computeLadder — the ladder runs in the order it claims to', () => {
  it('decides labels before reserving the `⋯`, so a labellable row is labelled', () => {
    // The rung order is the product owner's, not an implementation detail: a row that can wear all
    // its labels does, and only then is the overflow considered. Charging the `⋯` first would take
    // labels away on a row that never needed the button.
    const core = [button('a', 0), button('b', 1)];
    const candidates = [button('t3', 9, { group: 'help' })];
    const justEnoughForLabels = 2 * 32 + ITEM_GAP_PX + 2 * (40 + 24);
    const { labelled, admitted } = computeLadder(
      input({ core, candidates, available: justEnoughForLabels }),
    );
    expect([...labelled].sort()).toEqual(['a', 'b']);
    expect([...admitted]).toEqual([]); // no room left to admit, and that is the right trade
  });

  it('an icon-less button is 16 px, not 32', () => {
    expect(iconOnlyWidth(NO_ICON, FINE)).toBe(16);
    expect(iconOnlyWidth(WITH_ICON, FINE)).toBe(32);
    // A coarse pointer widens `px-2` to `px-3` on every control (`toolbar-styles.ts`).
    expect(iconOnlyWidth(WITH_ICON, true)).toBe(40);
  });
});

describe('the derived widths are tied to the styles they are derived from', () => {
  /**
   * **The one coupling in this module that nothing else can see.** Every constant above is read off
   * `toolbarControlVariants`'s class string by hand — `px-2` → 16, `pointer-coarse:px-3` → 24,
   * `size-4` → 16, `gap-1.5` → 6 — and the CVA has no idea. Change the padding and the ladder keeps
   * budgeting for the old box, on a surface whose whole history is arithmetic that was quietly wrong.
   *
   * It cannot catch a *value* change inside a class that stays (`px-2` → `px-2.5` is invisible to a
   * string check), and saying so is the point: this gate catches the removal or rename, which is the
   * likelier accident, and the residual risk is named rather than implied.
   */
  it('the control CVA still carries the classes the constants were read from', () => {
    const control = toolbarControlVariants();
    expect(control).toContain('px-2');
    expect(control).toContain('gap-1.5');
    expect(control).toContain('pointer-coarse:px-3');
    expect(control).toContain('min-h-9');
  });

  it('an icon-only button is the padding plus a `size-4` icon, in both pointer modes', () => {
    expect(iconOnlyWidth(WITH_ICON, FINE)).toBe(16 + 16);
    expect(iconOnlyWidth(WITH_ICON, true)).toBe(24 + 16);
  });
});

/**
 * **A row already painting the `⋯` pays for it before it decides whether it is short.**
 *
 * The defect ADR-0094 M0-T1 found by measurement. `overflowWidth` was subtracted *inside* the
 * `budget < 0` branch, so the shortfall test asked "is this row short **without** the button it is
 * already rendering?" A row holding an un-admitted tier-3 candidate always renders that button, so
 * a row over by less than the button's own width answered **no**, demoted nothing, and laid out
 * past its container — which `e2e-toolbar-fit` S4 reported as 8 px at 1024 on Row 1 the moment one
 * more tier-1 item joined it.
 *
 * Stage 3 had the rule right all along and says so in its own comment: with candidates present the
 * `⋯` is charged unconditionally, and is deliberately not released even when every candidate is
 * admitted. This is that rule applied one stage earlier, which is why it is a move rather than a
 * new charge — and why nothing about admission changes.
 *
 * Verified red first: with the reservation back inside the branch, the first case demotes nothing.
 */
describe('computeLadder — the `⋯` is reserved before the shortfall test', () => {
  // Six 32 px icon-only buttons + five 4 px gaps = 212. A 240 px row holds them with 28 px spare —
  // less than the 44 px `⋯` that the un-admitted candidate forces onto it.
  const core = [0, 1, 2, 3, 4, 5].map((i) => button(`c${String(i)}`, i, { labelPolicy: 'never' }));

  it('demotes when the row fits its items but not its overflow button', () => {
    const result = computeLadder(
      input({
        available: 240,
        core,
        // One candidate, far too wide to be admitted — so the `⋯` is certain to render.
        candidates: [button('tier3', 9, { baseWidth: 500, labelPolicy: 'never' })],
      }),
    );
    expect(result.overflowed.has('tier3')).toBe(true);
    expect(
      result.overflowed.size,
      'the row is 16 px short once the `⋯` is charged, so exactly one item leaves',
    ).toBeGreaterThan(1);
  });

  it('does not charge the `⋯` twice on a row that has no candidates', () => {
    // 212 of items in a 240 px row, no candidates: nothing forces the button, so nothing demotes
    // and the row keeps all six. The old code and the new agree here — pinned so a future
    // simplification cannot turn the reservation unconditional and quietly demote from full rows.
    const result = computeLadder(input({ available: 240, core, candidates: [] }));
    expect(result.overflowed.size).toBe(0);
  });

  it('still admits a candidate that fits with the `⋯` charged', () => {
    // Admission's own arithmetic is untouched: the charge simply happens earlier in the same
    // function, so a roomy row behaves exactly as before.
    const result = computeLadder(
      input({
        available: 1000,
        core,
        candidates: [button('tier3', 9, { baseWidth: 32, labelPolicy: 'never' })],
      }),
    );
    expect(result.admitted.has('tier3')).toBe(true);
    expect(result.overflowed.size).toBe(0);
  });
});
