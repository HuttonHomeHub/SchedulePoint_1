import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **A fact about the PLAN reaches both views; a fact about a SURFACE need not.**
 *
 * `TsldPanel` declares 48 props and `GanttPanel` 10, and they share two. So "the prop lists must
 * match" would be a gate with 46 written exceptions, which is not a gate — most of that difference
 * is honest, because a canvas has gestures, lanes and a viewport that a virtualized row list does
 * not, and vice versa.
 *
 * The distinction that does hold: some inputs describe **the plan** and are therefore true
 * regardless of which projection is on screen. Those must reach both hosts, from one derivation, or
 * the two views disagree about the same plan — and that disagreement is invisible from either view
 * alone, because each stays internally consistent. That is not hypothetical: `barDateSource` was
 * exactly this defect and shipped unreported (`docs/TECH_DEBT.md` #135). A planner in a VISUAL plan
 * saw the chart and the diagram put every hand-placed bar in a different place, and only someone
 * opening both would ever know.
 *
 * The one-shot prop-list diff that found it (`plan-workspace-toolbar.tsx`: _"found by diffing the
 * two hosts' whole prop lists rather than fixing the two the register named"_) catches drift that
 * **predates** a change. It cannot see a divergence introduced later, because nothing re-runs it.
 * This does, on every push.
 *
 * **`canEdit` is the one to watch.** `TsldPanel` receives `model.canEditSchedule && !lateOverlayActive`
 * — the Late-start overlay is read-only analysis, so editing is suppressed while it is on (ADR-0033
 * M4). The Gantt receives no editability at all today, which is correct while it is read-only and
 * becomes a defect the moment a gesture lands: wiring `canEditSchedule` directly would arm Gantt
 * drags underneath a banner reading "editing is paused". The row below is therefore `pending`, with
 * the milestone that must flip it named — a deliberately dated obligation rather than a comment
 * somebody may or may not read.
 *
 * **`hoursPerDayFor` is the next candidate, and is deliberately NOT a row yet.** M2-T1 gave the
 * Gantt a Duration column, whose day↔minute factor (ADR-0068) is resolved once in
 * `plan-workspace-toolbar.tsx` and passed only there — the canvas renders no duration text, so it
 * has nothing to feed. That becomes a genuine plan fact at **M3**, when a canvas drag and a Gantt
 * duration cell both parse a typed `4h` and two spellings of "how long is a day here" would make
 * one plan mean two things.
 *
 * It is not added as `pending` today because it would **fail**: that branch asserts a fact reaching
 * the Gantt has also reached the canvas, and this one legitimately has not. Weakening the rule to
 * admit it would be fitting the gate to the code — the rule was written for `barDateSource`, whose
 * defect was a *second derivation*, and there is only one here. Naming the obligation in prose is
 * the weaker instrument and is labelled as such; M3 is when it becomes expressible.
 */

const WORKSPACE = join(
  import.meta.dirname,
  '..',
  '..',
  'components',
  'layout',
  'workspace',
  'plan-workspace-toolbar.tsx',
);

/**
 * Facts about the plan, not about a surface. `required` ones must already reach both hosts;
 * `pending` ones must reach both by the milestone named, and are asserted absent-or-shared so the
 * row cannot rot into a silent claim that it is handled.
 */
const PLAN_FACTS = [
  { prop: 'activities', status: 'required' },
  { prop: 'barDateSource', status: 'required' },
  {
    prop: 'canEdit',
    status: 'pending',
    until: 'M3 (bar drag) — the first Gantt gesture that writes',
  },
] as const;

/** The JSX attribute names passed to a host at its mount site. */
function propsPassedTo(source: string, component: string): Set<string> {
  const open = source.indexOf(`<${component}`);
  if (open === -1) throw new Error(`${component} is not mounted in plan-workspace-toolbar.tsx`);
  // Read to the end of the opening tag: attributes are `name={...}` at the start of a line.
  const close = source.indexOf('\n    />', open);
  const body = source.slice(open, close === -1 ? source.indexOf('\n    >', open) : close);
  return new Set([...body.matchAll(/^\s+([a-zA-Z][a-zA-Z0-9]*)=/gm)].map((m) => m[1]!));
}

describe('the two plan hosts receive the same facts about the plan', () => {
  const source = readFileSync(WORKSPACE, 'utf8');
  const tsld = propsPassedTo(source, 'TsldPanel');
  const gantt = propsPassedTo(source, 'GanttPanel');

  it('mounts both hosts from this file, so the comparison means something', () => {
    expect(tsld.size).toBeGreaterThan(10);
    expect(gantt.size).toBeGreaterThan(3);
  });

  for (const fact of PLAN_FACTS.filter((f) => f.status === 'required')) {
    it(`passes \`${fact.prop}\` to both`, () => {
      expect([...tsld].includes(fact.prop), `TsldPanel is missing ${fact.prop}`).toBe(true);
      expect([...gantt].includes(fact.prop), `GanttPanel is missing ${fact.prop}`).toBe(true);
    });
  }

  for (const fact of PLAN_FACTS.filter((f) => f.status === 'pending')) {
    it(`does not give \`${fact.prop}\` to one host only — due at ${'until' in fact ? fact.until : '?'}`, () => {
      // Two states are legitimate and one is not.
      //
      // Legitimate: neither host has it (nothing needs it yet), or BOTH do (the fact arrived and was
      // shared). The defect is the Gantt holding its own copy — a second derivation of a plan fact,
      // which is how the two views come to disagree about one plan.
      //
      // The first draft of this test asserted `x ? 'expected' : 'expected'`, which is vacuously true
      // and would have passed against anything. Recorded because a dead assertion is worse than none:
      // it reads as coverage.
      if (gantt.has(fact.prop)) {
        const derivations = source.match(new RegExp(`const ${fact.prop}\\s*=`, 'g')) ?? [];
        expect(
          derivations.length,
          `${fact.prop} reached the Gantt — it must now be ONE shared derivation, not a second expression`,
        ).toBe(1);
        expect(
          tsld.has(fact.prop),
          `${fact.prop} reached the Gantt but not the canvas — the divergence inverted`,
        ).toBe(true);
      }
    });
  }

  it('derives every required fact once, never as the same expression twice', () => {
    // `barDateSource` was written as a duplicated ternary before this test existed — caught by hand.
    // Two copies of a host-shared value drift, and the drift is invisible from either view.
    for (const { prop } of PLAN_FACTS.filter((f) => f.status === 'required')) {
      const derivations = source.match(new RegExp(`const ${prop}\\s*=`, 'g')) ?? [];
      expect(derivations.length, `${prop} should have at most one derivation`).toBeLessThanOrEqual(
        1,
      );
    }
  });
});
