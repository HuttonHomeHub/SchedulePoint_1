// @ts-check
/**
 * The pure verdict logic of `measure-loading-shapes.mjs` (docs/specs/loading-skeletons, M0), kept
 * apart from the browser so it can be proved with fixtures — the `measure-activities-panel.judge.mjs`
 * arrangement. Nothing here touches a page.
 *
 * Three questions, each with the tolerance the approved spec states and nowhere else:
 *
 *  - SC-2 — did an ANCHOR (a heading, a label, a column heading) move between the pending and the
 *    settled picture? |delta| <= 1 px on each axis.
 *  - SC-3 — did a `fit` column start at its settled width? within 8 px. `auto` and `bounded`
 *    columns are reported and never graded, because their settled width is a function of data a
 *    skeleton cannot have.
 *  - SC-4 — how many live regions spoke while the surface was pending, and what did they say?
 */

/** SC-2: a heading or label that moves more than this has been shifted by the content arriving. */
export const ANCHOR_TOLERANCE_PX = 1;

/** SC-3: the width a `fit` column's placeholder may differ from its settled cell by. */
export const FIT_TOLERANCE_PX = 8;

/**
 * Thrown when the instrument cannot say it examined a settled picture. A probe that reads a
 * skeleton as content reports "nothing moved", which is indistinguishable from a product that does
 * not shift (ADR-0146's M6 lesson, which `measure-column-fit.mjs` carries as its pinned case).
 */
export class NothingSettledError extends Error {}

/**
 * @typedef {{ key: string, top: number, left: number, width: number }} Anchor
 * @typedef {{ anchors: Anchor[], skeletons: number, settledCells: number }} Snapshot
 */

/**
 * The control: refuses a verdict unless the settled snapshot genuinely was settled, and the pending
 * one genuinely was pending. Both directions, because either mistake yields a plausible zero.
 *
 * @param {string} site
 * @param {Snapshot} pending
 * @param {Snapshot} settled
 * @param {{ requireSkeleton?: boolean }} [options] `requireSkeleton` is for a run taken AFTER a site
 *   was converted; the M0 baseline legitimately finds a spinner where the skeleton will be.
 */
export function assertExamined(site, pending, settled, options = {}) {
  if (settled.skeletons > 0) {
    throw new NothingSettledError(
      `${site}: the settled snapshot still contains ${String(settled.skeletons)} skeleton block(s) — the instrument read a loading picture as content`,
    );
  }
  if (settled.anchors.length === 0) {
    throw new NothingSettledError(`${site}: the settled snapshot has no anchors to compare`);
  }
  if (options.requireSkeleton && pending.skeletons === 0) {
    throw new NothingSettledError(
      `${site}: the pending snapshot has no skeleton block — the read was not held, or the site shows a spinner`,
    );
  }
}

/**
 * SC-2. Anchors are matched by key (tag + text). An anchor that exists settled and not pending is
 * reported as `absentWhilePending` — it appeared out of nothing, which is itself a shift of
 * everything below it — and is NOT graded as a pass.
 *
 * @param {Snapshot} pending
 * @param {Snapshot} settled
 */
export function judgeAnchors(pending, settled) {
  const before = new Map(pending.anchors.map((a) => [a.key, a]));
  /** @type {{ key: string, dx: number, dy: number, ok: boolean }[]} */
  const moved = [];
  /** @type {string[]} */
  const absentWhilePending = [];
  for (const after of settled.anchors) {
    const was = before.get(after.key);
    if (!was) {
      absentWhilePending.push(after.key);
      continue;
    }
    const dx = after.left - was.left;
    const dy = after.top - was.top;
    moved.push({
      key: after.key,
      dx,
      dy,
      ok: Math.abs(dx) <= ANCHOR_TOLERANCE_PX && Math.abs(dy) <= ANCHOR_TOLERANCE_PX,
    });
  }
  const failing = moved.filter((m) => !m.ok);
  return {
    compared: moved.length,
    failing,
    absentWhilePending,
    verdict: failing.length === 0 && absentWhilePending.length === 0 ? 'PASS' : 'FAIL',
  };
}

/**
 * @typedef {{ header: string, mode: 'fit' | 'bounded' | 'auto' | 'undeclared', pending: number, settled: number }} ColumnPair
 */

/**
 * SC-3. Only `fit` columns are graded; every other mode is carried through as REPORTED so the
 * figure the withdrawal clause needs (#341's 628 -> 738 px) is in the output either way.
 *
 * @param {ColumnPair[]} columns
 */
export function judgeColumns(columns) {
  const rows = columns.map((c) => {
    const delta = c.settled - c.pending;
    const graded = c.mode === 'fit';
    return {
      ...c,
      delta,
      graded,
      verdict: graded ? (Math.abs(delta) <= FIT_TOLERANCE_PX ? 'PASS' : 'FAIL') : 'REPORTED',
    };
  });
  const graded = rows.filter((r) => r.graded);
  return {
    columns: rows,
    // No `fit` column at all is "nothing to grade", not a pass: a table with none says nothing about
    // the remedy, and the caller must say so rather than count it.
    verdict:
      graded.length === 0
        ? 'NOTHING_GRADED'
        : graded.every((r) => r.verdict === 'PASS')
          ? 'PASS'
          : 'FAIL',
  };
}

/**
 * SC-4. The loading sentences speaking AT THE READING. The spec's wording is "while each surface is
 * pending: exactly one live region carries a sentence", which is a statement about regions that
 * exist together. The first reading counted every region that had ever held text, so a
 * `RoutePending` status that had unmounted before the page mounted (a different pending surface,
 * earlier, never at the same time) and a sibling section that had already settled were both counted
 * against the surface (m7-after-measurement.md, second reading). Two classes are therefore set
 * aside, and both are still listed in `regions` so nothing is hidden:
 *
 *  - `unmounted`: the region was gone by the reading (`connected === false`), so it was not speaking.
 *  - `shell`: a sentence on the shell's own announcer channel that is not a loading sentence (the
 *    navigator's "1 project loaded." on a deep link). It is another feature's result, not this
 *    surface's state; a loading sentence on that channel still counts.
 *
 * `expected` is how many the site should have: 1, or 0 where an enclosing StatusSection /
 * RoutePending speaks and the enclosing region is counted by the census itself.
 *
 * @param {{ kind: string, text: string, insideBusy: boolean, connected?: boolean, path?: string }[]} regions
 * @param {number} expected
 */
export function judgeSentences(regions, expected) {
  const isShell = (r) =>
    (r.path ?? '').includes('data-testid=announcer') && !/^Loading/.test(r.text);
  const unmounted = regions.filter((r) => r.connected === false);
  const shell = regions.filter((r) => r.connected !== false && isShell(r));
  const speaking = regions.filter((r) => r.connected !== false && !isShell(r));
  const insideBusy = speaking.filter((r) => r.insideBusy);
  return {
    count: speaking.length,
    texts: speaking.map((r) => r.text),
    insideBusy: insideBusy.map((r) => r.text),
    unmounted: unmounted.map((r) => r.text),
    shell: shell.map((r) => r.text),
    // Where each region sat and whether it was still mounted at the reading: a count says that
    // two regions held text, only this says whether they could have spoken together.
    regions: regions.map((r) => ({ text: r.text, connected: r.connected, path: r.path })),
    // Both halves of the contract: the right number of sentences, none of them inside an aria-busy
    // subtree (spec §4.7 rule 2).
    verdict: speaking.length === expected && insideBusy.length === 0 ? 'PASS' : 'FAIL',
  };
}
