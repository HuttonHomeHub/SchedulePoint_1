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
 * **`canEdit` was the one to watch, and M3 flipped it** — the milestone its `pending` row named,
 * which is what a dated obligation is for. The Late-start overlay is read-only analysis (ADR-0033
 * M4), so `model.canEditSchedule && !lateOverlayActive` is the real question, and now that the
 * Gantt moves bars, arming from `canEditSchedule` alone would let them move underneath a banner
 * reading "editing is paused".
 *
 * Its row is `required-derivation` rather than `required`, because the Gantt receives it inside the
 * `drag` bundle and "is the attribute on both tags?" is then the wrong question. What must hold is
 * that there is ONE `const canEdit =` and the canvas is passed **that binding** — a second
 * `model.canEditSchedule && !lateOverlayActive` written inline at the other mount would satisfy an
 * attribute check perfectly and is exactly the drift this file exists to catch. Verified red
 * against that inline form before being relied on.
 *
 * **`hoursPerDayFor` is still not a row, and M3 did not change that.** The prose here previously
 * said M3 would make it expressible, on the reasoning that a canvas drag would need the same
 * day-factor. It does not: a canvas drag moves a bar by DAYS through `onTsldReposition`, and the
 * `hoursPerDay` factor is only needed to parse or format a day↔minute value — which the canvas
 * still does only inside the editor dialog, from its own resolution. Recorded as a corrected
 * prediction rather than quietly dropped: the obligation was real when written and the milestone
 * that was supposed to discharge it turned out not to touch it.
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
interface PlanFact {
  prop: string;
  status: 'required' | 'required-derivation' | 'pending';
  /** For a `pending` row: the milestone that must discharge it. */
  until?: string;
}

/**
 * Typed rather than `as const`, so the `pending` loop below survives having **no** pending rows.
 * With a const tuple TypeScript narrows an empty filter to `never` and the loop stops compiling —
 * which would make "delete the mechanism" the path of least resistance the first time the queue
 * empties, and it is exactly the mechanism that catches the next divergence.
 */
const PLAN_FACTS: PlanFact[] = [
  { prop: 'activities', status: 'required' },
  { prop: 'barDateSource', status: 'required' },
  // Flipped at M3, the milestone the `pending` row named. The Gantt now moves bars, so both hosts
  // must read the SAME fused role+pen+overlay binding — arming a drag from `canEditSchedule` alone
  // would let bars move underneath a banner reading "editing is paused". It reaches the Gantt
  // inside the `drag` bundle rather than as a bare prop, so the assertion below matches the
  // derivation rather than the attribute name.
  { prop: 'canEdit', status: 'required-derivation' },
];

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

  for (const fact of PLAN_FACTS.filter((f) => f.status === 'required-derivation')) {
    it(`derives \`${fact.prop}\` once, and the canvas reads that binding`, () => {
      // The Gantt receives it inside a bundle, so "is the attribute present on both tags?" is the
      // wrong question. What must hold is that there is ONE derivation and the canvas uses it —
      // a second `model.canEditSchedule && !lateOverlayActive` written at the other mount is the
      // drift this file exists to catch, and it would satisfy an attribute check perfectly.
      const derivations = source.match(new RegExp(`const ${fact.prop}\\s*=`, 'g')) ?? [];
      expect(derivations.length, `${fact.prop} must be derived exactly once`).toBe(1);
      expect(
        tsld.has(fact.prop),
        `TsldPanel no longer receives ${fact.prop} — the shared binding was bypassed`,
      ).toBe(true);
      expect(
        source.includes(`${fact.prop}={${fact.prop}}`),
        `${fact.prop} should be passed by the shared binding, not re-expressed inline`,
      ).toBe(true);
    });
  }

  for (const fact of PLAN_FACTS.filter((f) => f.status === 'required')) {
    it(`passes \`${fact.prop}\` to both`, () => {
      expect([...tsld].includes(fact.prop), `TsldPanel is missing ${fact.prop}`).toBe(true);
      expect([...gantt].includes(fact.prop), `GanttPanel is missing ${fact.prop}`).toBe(true);
    });
  }

  for (const fact of PLAN_FACTS.filter((f) => f.status === 'pending')) {
    it(`does not give \`${fact.prop}\` to one host only — due at ${fact.until ?? '?'}`, () => {
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
