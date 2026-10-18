// @ts-check
/**
 * The pure verdict logic of `measure-loading-shapes.mjs` (docs/specs/loading-skeletons, M0), kept
 * apart from the browser so it can be proved with fixtures — the `measure-activities-panel.judge.mjs`
 * arrangement. Nothing here touches a page.
 *
 * Three questions, each with the tolerance the approved spec states and nowhere else:
 *
 *  - SC-2 — did an ANCHOR (a heading, a label, a column heading) move between the pending and the
 *    settled picture? |delta| <= 1 px on each axis, less the classes the 2026-10-18 amendment
 *    reports and does not grade (see `judgeAnchors`).
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
 * @typedef {{ key: string, top: number, left: number, width: number, afterTable?: number,
 *   mode?: string, table?: number, col?: number }} Anchor
 * @typedef {{ rows: number, bodyHeight: number }} TableShape
 * @typedef {{ anchors: Anchor[], skeletons: number, settledCells: number, tables?: TableShape[] }} Snapshot
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

/** The actions column's heading is 0 px wide while pending: a skeleton has no actions to draw. */
const ACTIONS_HEADING = 'th Actions';

/**
 * Whether the shift of everything below table `t` is the rows arriving and nothing else. Two
 * things must both hold, so a pending block that is simply a different height is not waved through:
 * the shift equals the change in the bodies of the tables above it (each within 1 px), and every
 * one of those tables' placeholder rows was as tall as a settled row is (each within 1 px) — so the
 * whole change is (settled rows - placeholder rows) x row height. Returns the evidence either way.
 *
 * @param {Snapshot} pending
 * @param {Snapshot} settled
 * @param {number} t index of the last table above the anchor
 * @param {number} dy the anchor's shift
 */
function rowGrowth(pending, settled, t, dy) {
  const before = pending.tables ?? [];
  const after = settled.tables ?? [];
  if (before.length !== after.length) {
    return {
      explained: false,
      why: `${String(before.length)} tables pending, ${String(after.length)} settled`,
    };
  }
  let bodyChange = 0;
  let residual = 0;
  // Carried into the record so a reader can see rows and heights, not only the verdict.
  const perTable = [];
  for (let i = 0; i <= t; i += 1) {
    const p = before[i];
    const s = after[i];
    if (!p || !s || s.rows === 0)
      return { explained: false, why: `table ${String(i)} settled with no rows to measure` };
    perTable.push({ pending: p, settled: s });
    bodyChange += s.bodyHeight - p.bodyHeight;
    residual += Math.abs(p.rows * (s.bodyHeight / s.rows) - p.bodyHeight);
  }
  const tables = t + 1;
  const explained =
    Math.abs(dy - bodyChange) <= ANCHOR_TOLERANCE_PX * tables &&
    residual <= ANCHOR_TOLERANCE_PX * tables * 3;
  return {
    explained,
    perTable,
    bodyChange,
    residual: Math.round(residual * 10) / 10,
    why: explained ? 'row count' : 'not row count alone',
  };
}

/**
 * SC-2, as amended 2026-10-18 (product owner; the original wording is kept in the spec). Anchors are
 * matched by key (tag + text). A matched anchor either holds (|delta| <= 1 px), or is one of three
 * classes that are REPORTED and not graded, each with the evidence on the row, or fails:
 *
 *  - `reportedX`: a column heading on an `auto` / `bounded` / undeclared column moved sideways. Its
 *    width is a function of data a skeleton cannot hold, exactly as SC-3 treats it. Its vertical
 *    position is still graded.
 *  - `followsUpstream`: a heading on a `fit` column moved sideways by exactly the summed width change
 *    of the columns to its left, every one of which is `auto` / `bounded` / undeclared. It did not
 *    move on its own account; the arithmetic is on the row. (A reading of the amendment, not
 *    its text — see the spec note.)
 *  - `growthBelow`: it sits below a table and the whole shift is the rows arriving (`rowGrowth`).
 *    The spec: growth below the last placeholder is not a defect. NOT applied when the shift cannot
 *    be shown to be row-count alone.
 *
 * An anchor that exists settled and not pending is `absentWhilePending`. Two kinds are
 * `absentByConstruction` and reported, never silently passed: the subject's h1 on a detail page
 * (`subjectHeading`) and the actions heading. One that sits below a table appears below the last
 * placeholder and is `appearsBelow`. Anything else absent fails.
 *
 * `NOTHING_GRADED` when no anchor could be compared: a page whose only anchors are absent by
 * construction says nothing about stability, and is not a pass.
 *
 * @param {Snapshot} pending
 * @param {Snapshot} settled
 * @param {{ subjectHeading?: boolean, columns?: { pending: {mode: string, width: number}[], settled: {mode: string, width: number}[] } }} [options]
 */
export function judgeAnchors(pending, settled, options = {}) {
  const before = new Map(pending.anchors.map((a) => [a.key, a]));
  /** @type {{ key: string, dx: number, dy: number, ok: boolean, class?: string, evidence?: unknown }[]} */
  const moved = [];
  /** @type {string[]} */
  const absentWhilePending = [];
  /** @type {{ key: string, why: string }[]} */
  const absentByConstruction = [];
  /** @type {string[]} */
  const appearsBelow = [];
  const over = (n) => Math.abs(n) > ANCHOR_TOLERANCE_PX;
  const cols = options.columns;
  for (const after of settled.anchors) {
    const was = before.get(after.key);
    if (!was) {
      if (after.key === ACTIONS_HEADING) {
        absentByConstruction.push({
          key: after.key,
          why: 'zero-width heading while pending: no actions to draw',
        });
      } else if (options.subjectHeading && after.key.startsWith('h1 ')) {
        absentByConstruction.push({
          key: after.key,
          why: 'the subject’s name is data a skeleton cannot hold',
        });
      } else if ((after.afterTable ?? -1) >= 0) {
        appearsBelow.push(after.key);
      } else {
        absentWhilePending.push(after.key);
      }
      continue;
    }
    const dx = after.left - was.left;
    const dy = after.top - was.top;
    /** @type {{ key: string, dx: number, dy: number, ok: boolean, class?: string, evidence?: unknown }} */
    const row = { key: after.key, dx, dy, ok: true };
    if (over(dy)) {
      const t = after.afterTable ?? -1;
      const growth = t >= 0 ? rowGrowth(pending, settled, t, dy) : undefined;
      if (growth?.explained) {
        Object.assign(row, { class: 'growthBelow', evidence: growth });
      } else {
        row.ok = false;
        if (growth) row.evidence = growth;
      }
    }
    if (row.ok && over(dx)) {
      if (after.mode !== undefined && after.mode !== 'fit') {
        row.class = 'reportedX';
      } else if (after.mode === 'fit' && cols && after.table === 0 && after.col !== undefined) {
        const left = cols.settled.slice(0, after.col);
        const change = left.reduce(
          (sum, c, i) => sum + (c.width - (cols.pending[i]?.width ?? 0)),
          0,
        );
        const onlyNonFit = left.every(
          (c, i) => c.mode !== 'fit' || !over(c.width - (cols.pending[i]?.width ?? 0)),
        );
        if (onlyNonFit && !over(dx - change)) {
          row.class = 'followsUpstream';
          row.evidence = { summedWidthChangeToTheLeft: change };
        } else {
          row.ok = false;
        }
      } else {
        row.ok = false;
      }
    }
    moved.push(row);
  }
  const failing = moved.filter((m) => !m.ok);
  const reported = moved.filter((m) => m.ok && m.class !== undefined);
  const graded = moved.filter((m) => m.ok && m.class === undefined);
  return {
    compared: moved.length,
    failing,
    reported,
    absentWhilePending,
    absentByConstruction,
    appearsBelow,
    verdict:
      failing.length > 0 || absentWhilePending.length > 0
        ? 'FAIL'
        : graded.length === 0
          ? 'NOTHING_GRADED'
          : 'PASS',
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
