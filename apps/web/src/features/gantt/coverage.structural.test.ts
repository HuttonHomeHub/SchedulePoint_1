import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { selectionActionItems } from '@/features/plan-actions/selection-actions';

/**
 * **Either a Gantt-reachable action has a journey that exercises it, or it does not render.**
 *
 * This is the Q4 merge condition made mechanical. With no feature flag (the product owner's choice),
 * every milestone reaches the auto-pulling host the day it merges, and the only thing standing
 * between a half-built affordance and a planner is the rule that a milestone leaves the Gantt
 * coherent. The test-engineer review's verdict on the first version of that rule was exact: written
 * as prose it "is not different in kind from the original sentence — it's a better sentence".
 *
 * So it is a gate, in the `pnpm check:playbook` shape CLAUDE.md §7 already describes — **resolving in
 * both directions**:
 *
 * 1. Every action the Gantt can reach is named by a spec in `e2e-gantt-editing/`. An action nobody
 *    drives is either untested or unreachable, and both are worth failing over.
 * 2. The suite exists and is non-trivial, so the first direction cannot be satisfied by an empty
 *    directory. Without this, deleting every spec turns the gate green — the ADR-0081 shape, where a
 *    passing suite could not distinguish "the duplicate is gone" from "the capability is gone".
 *
 * **Scheduled at M1, not M0, and that was a correction.** The plan put it in M0-T2 beside the
 * host-parity gate; picking it up showed `e2e-gantt-editing/` does not exist until this milestone
 * creates it, so at M0 it would have failed on every item on its first run — and ADR-0058 records
 * that a gate failing on day one gets deleted rather than fixed — or been written to pass with
 * nothing to check.
 *
 * **Its blind spot, stated.** It matches on the action's *label*, so it proves a spec mentions the
 * control, not that the spec drives it to a successful write. That second half belongs to the
 * journey's own assertions and cannot be had structurally. What this catches is the case the
 * register keeps recording: an affordance that renders and is exercised by nothing.
 */

const SUITE_DIR = join(import.meta.dirname, '..', '..', '..', 'e2e-gantt-editing');

/** Every spec's source, concatenated — the corpus a Gantt action must appear in. */
function suiteText(): { files: string[]; text: string } {
  const files = readdirSync(SUITE_DIR).filter((f) => f.endsWith('.spec.ts'));
  return {
    files,
    text: files.map((f) => readFileSync(join(SUITE_DIR, f), 'utf8')).join('\n'),
  };
}

/**
 * The actions a Gantt selection can reach: every registry item that is NOT gated on the canvas.
 *
 * Derived from the registry itself rather than a hand-written list — a restated roster is the
 * ADR-0073 C4 defect in miniature, where a cap written as a literal fell behind the vocabulary it
 * capped and started rejecting valid input.
 */
const LAYOUT_MODES = ['comfortable', 'compact', 'condensed', 'collapsed'] as const;

function ganttReachableLabels(): string[] {
  const ganttCtx = { canvas: null } as never;
  // An ARRAY, not a factory — `selection-actions.tsx:442`. Called it as a function first; the
  // duplication gate one directory over reads it correctly, which is where I should have looked.
  return selectionActionItems
    .filter((item) => {
      // `isVisible` is the canvas gate: the two canvas-only items answer false with `canvas: null`.
      // Items without one are unconditional and therefore reachable in both views.
      //
      // It takes `(ctx, env)`, and the **union across every band** is the right reading: an action a
      // planner can reach at any width is an action that must be exercised. Taking one band would
      // let a future width-dependent item fall out of the requirement at whichever width this test
      // happened to pick — silently, since the item would still render for real users. No selection
      // action reads `env` today; this is written so the first one that does cannot create a hole.
      // (I passed one argument at first. It ran green under vitest, which does not typecheck, and
      // `pnpm typecheck` caught it — the fifth assumed signature this epic has had corrected by the
      // compiler rather than by reading.)
      try {
        return item.isVisible
          ? LAYOUT_MODES.some((layout) => item.isVisible!(ganttCtx, { layout }))
          : true;
      } catch {
        // An item whose predicate needs more context than this stub cannot be classified here.
        // Treat it as reachable: a false negative would silently drop it from the requirement,
        // which is the direction that hides a gap rather than reporting one.
        return true;
      }
    })
    .map((item) => item.label)
    .filter((label): label is string => typeof label === 'string');
}

describe('every Gantt-reachable object action is exercised by a journey', () => {
  it('has a non-trivial journey suite, so the requirement below can mean something', () => {
    const { files, text } = suiteText();
    expect(files.length, 'e2e-gantt-editing/ has no specs').toBeGreaterThan(0);
    // A floor on substance, not just existence: an empty file satisfies the count.
    expect(text.length).toBeGreaterThan(1000);
  });

  it('names each of them in a spec, or the action should not render', () => {
    const { text } = suiteText();
    const labels = ganttReachableLabels();
    expect(labels.length, 'the registry yielded no Gantt-reachable actions').toBeGreaterThan(0);

    const unexercised = labels.filter((label) => !text.includes(label));
    expect(
      unexercised,
      `Reachable from a Gantt selection and driven by no journey:\n${unexercised.join('\n')}\n\n` +
        `Either add a case to e2e-gantt-editing/, or make the item not render in the Gantt. ` +
        `An affordance nobody drives is the shape this register keeps finding shipped.`,
    ).toEqual([]);
  });
});
