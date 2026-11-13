import { expect, type Page, test } from '@playwright/test';
import { scaleSpec } from '@repo/seed/scale';

import { openNewPlan } from '../e2e-authoring/support';
import { holdThePen } from '../e2e-support/pen';
import { VIEWPORT_NOTICE_ACK_KEY } from '../src/components/layout/viewport-notice/viewport-notice-ack';

import { brief, planIdOf, readRows, settle, signUp } from './follow-logic-m0-support';
import { clearMeasurement, writeMeasurement } from './output';

/**
 * **Placed bar follows link, M0 / Task 0.3** (`docs/specs/placed-bar-follows-link/m0-measurement.md`):
 * the data questions, read from the REAL API through the page's own session, and the cost of the
 * snapshot diff the spec proposes.
 *
 * The placement is written with the same single `PATCH …/activities/:id` the drag persists
 * (`use-plan-workspace-model.ts`), so the API's answer is the product's answer; which GESTURES can reach
 * a state is a read of the gesture gates and is recorded in the measurement file, not claimed here.
 *
 * A harness, not a gate (ADR-0081 §3).
 */

type Reading = Record<string, unknown>;

const log = (msg: string): void => {
  // eslint-disable-next-line no-console
  console.log(`[follow-logic m0 data ${new Date().toISOString().slice(11, 19)}] ${msg}`);
};

interface Reply {
  status: number;
  body: unknown;
}

async function api(page: Page, method: string, path: string, body?: unknown): Promise<Reply> {
  return page.evaluate(
    async ({ m, p, b }: { m: string; p: string; b: unknown }) => {
      const res = await fetch(`/api/v1/${p}`, {
        method: m,
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        ...(b === undefined ? {} : { body: JSON.stringify(b) }),
      });
      const text = await res.text();
      let parsed: unknown = text;
      try {
        parsed = JSON.parse(text);
      } catch {
        // Not JSON: keep the text, it is the evidence.
      }
      return { status: res.status, body: parsed };
    },
    { m: method, p: path, b: body },
  );
}

const data = (r: Reply): Record<string, unknown> =>
  (r.body as { data: Record<string, unknown> }).data;

test.describe('follow-logic M0 data questions', () => {
  test.use({ actionTimeout: 8_000 });

  test('placed summary, placed started activity, constraint round trip', async ({ page }) => {
    test.setTimeout(600_000);
    const name = 'follow-logic-m0-data';
    clearMeasurement(name);
    const record: Reading = {};
    await page.addInitScript((key: string) => {
      window.localStorage.setItem(key, '1');
    }, VIEWPORT_NOTICE_ACK_KEY);
    await page.setViewportSize({ width: 1646, height: 1097 });
    const { orgSlug } = await signUp(page, Date.now() + 91, 'FollowData');
    await openNewPlan(page);
    await holdThePen(page);
    const org = `organizations/${orgSlug}`;
    const plan = planIdOf(page);

    const make = async (n: string, lane: number, days: number, extra: object = {}) => {
      const r = await api(page, 'POST', `${org}/plans/${plan}/activities`, {
        name: n,
        type: 'TASK',
        durationDays: days,
        laneIndex: lane,
        ...extra,
      });
      if (r.status !== 201)
        throw new Error(`create ${n}: ${String(r.status)} ${JSON.stringify(r.body)}`);
      return data(r) as { id: string; version: number };
    };
    const P = await make('P', 0, 5);
    const S = await make('S', 1, 3);
    const X = await make('X', 2, 2);
    const K = await make('K', 3, 2, { constraintType: 'SNET', constraintDate: '2026-02-02' });
    const dep = await api(page, 'POST', `${org}/plans/${plan}/dependencies`, {
      predecessorId: P.id,
      successorId: S.id,
      type: 'FS',
    });
    record['linkP_S'] = dep.status;
    const recalc = async (): Promise<void> => {
      const r = await api(page, 'POST', `${org}/plans/${plan}/schedule/recalculate`);
      if (r.status !== 200 && r.status !== 201) throw new Error(`recalc ${String(r.status)}`);
    };
    await recalc();
    const version = async (id: string): Promise<number> =>
      (await readRows(page, orgSlug)).find((r) => r.id === id)?.version ?? -1;

    // --- Q1a: can a WBS_SUMMARY hold a placement? Convert a placed, unlinked task into a summary
    // with the same PATCH the activity editor's type field sends.
    const placeX = await api(page, 'PATCH', `${org}/activities/${X.id}`, {
      visualStart: '2026-02-02',
      version: await version(X.id),
    });
    const toSummary = await api(page, 'PATCH', `${org}/activities/${X.id}`, {
      type: 'WBS_SUMMARY',
      version: await version(X.id),
    });
    await recalc();
    const afterSummary = (await readRows(page, orgSlug)).find((r) => r.id === X.id);
    record['summary'] = {
      placeStatus: placeX.status,
      convertStatus: toSummary.status,
      convertBody: toSummary.status === 200 ? 'ok' : toSummary.body,
      row: afterSummary ? brief(afterSummary) : null,
    };
    // A direct placement write on a summary, as the single PATCH accepts it.
    const placeSummary = await api(page, 'PATCH', `${org}/activities/${X.id}`, {
      visualStart: '2026-02-09',
      version: await version(X.id),
    });
    record['summaryDirectPlacePatch'] = {
      status: placeSummary.status,
      body: placeSummary.status === 200 ? 'ok' : placeSummary.body,
    };
    // The batch route, which the follow-logic offer would use, refuses a summary.
    const xRow = (await readRows(page, orgSlug)).find((r) => r.id === X.id);
    const batchSummary = await api(page, 'PATCH', `${org}/plans/${plan}/activities/placements`, {
      placements: [
        {
          id: X.id,
          version: xRow?.version ?? 0,
          constraintType: null,
          constraintDate: null,
          visualStart: null,
          laneIndex: null,
        },
      ],
    });
    record['summaryBatch'] = { status: batchSummary.status, body: batchSummary.body };
    await recalc();
    const afterDirect = (await readRows(page, orgSlug)).find((r) => r.id === X.id);
    record['summaryAfterDirectPlace'] = afterDirect ? brief(afterDirect) : null;

    // Can a placed summary be FLAGGED? Place it before the data date, which is a logic bound.
    await api(page, 'PATCH', `${org}/activities/${X.id}`, {
      visualStart: '2025-12-01',
      version: await version(X.id),
    });
    await recalc();
    const flaggedSummary = (await readRows(page, orgSlug)).find((r) => r.id === X.id);
    record['summaryPlacedBeforeDataDate'] = flaggedSummary ? brief(flaggedSummary) : null;
    // The per-object route the selection bar uses (single PATCH, `visualStart: null`) on that summary.
    const clearSummary = await api(page, 'PATCH', `${org}/activities/${X.id}`, {
      visualStart: null,
      version: await version(X.id),
    });
    await recalc();
    const clearedSummary = (await readRows(page, orgSlug)).find((r) => r.id === X.id);
    record['summaryClearedPerObject'] = {
      status: clearSummary.status,
      after: clearedSummary ? brief(clearedSummary) : null,
    };

    // --- Q1b: a started activity that is placed and flagged. S follows P; place S before P finishes,
    // then report progress on S (the call the Progress dialog makes).
    await api(page, 'PATCH', `${org}/activities/${S.id}`, {
      visualStart: '2026-01-06',
      version: await version(S.id),
    });
    await recalc();
    const sBefore = (
      await settle(
        page,
        orgSlug,
        (r) => r.find((x) => x.id === S.id)?.visualConflictReason === 'EARLIER_THAN_LOGIC',
        'S flagged',
      )
    ).rows.find((r) => r.id === S.id);
    const progress = await api(page, 'PATCH', `${org}/activities/${S.id}/progress`, {
      // The plan's data date is 2026-01-05 and an actual after it is refused (ACTUAL_AFTER_DATA_DATE).
      actualStart: '2026-01-05',
      percentComplete: 40,
      version: await version(S.id),
    });
    await recalc();
    const sAfter = (await readRows(page, orgSlug)).find((r) => r.id === S.id);
    record['started'] = {
      before: sBefore ? brief(sBefore) : null,
      progressStatus: progress.status,
      progressBody: progress.status === 200 ? 'ok' : progress.body,
      after: sAfter
        ? { ...brief(sAfter), actualStart: sAfter.actualStart, pct: sAfter.percentComplete }
        : null,
    };
    // Clearing the started row's placement through the batch: does the flag clear, and do the dates hold?
    const sRow = (await readRows(page, orgSlug)).find((r) => r.id === S.id);
    const batchStarted = await api(page, 'PATCH', `${org}/plans/${plan}/activities/placements`, {
      placements: [
        {
          id: S.id,
          version: sRow?.version ?? 0,
          constraintType: sRow?.constraintType ?? null,
          constraintDate: sRow?.constraintDate?.slice(0, 10) ?? null,
          visualStart: null,
          laneIndex: null,
        },
      ],
    });
    await recalc();
    const sCleared = (await readRows(page, orgSlug)).find((r) => r.id === S.id);
    record['startedClear'] = {
      batchStatus: batchStarted.status,
      beforeDrawn: sRow?.visualEffectiveStart?.slice(0, 10) ?? null,
      after: sCleared ? brief(sCleared) : null,
    };

    // --- Task 0.3 step 2 (runtime half): a row holding a placement AND a constraint, written back
    // with `visualStart: null` and the constraint round-tripped, keeps the constraint.
    await api(page, 'PATCH', `${org}/activities/${K.id}`, {
      visualStart: '2026-01-12',
      version: await version(K.id),
    });
    await recalc();
    const kRow = (await readRows(page, orgSlug)).find((r) => r.id === K.id);
    const batchK = await api(page, 'PATCH', `${org}/plans/${plan}/activities/placements`, {
      placements: [
        {
          id: K.id,
          version: kRow?.version ?? 0,
          constraintType: kRow?.constraintType ?? null,
          constraintDate: kRow?.constraintDate?.slice(0, 10) ?? null,
          visualStart: null,
          laneIndex: null,
        },
      ],
    });
    await recalc();
    const kAfter = (await readRows(page, orgSlug)).find((r) => r.id === K.id);
    record['constraintRoundTrip'] = {
      before: kRow ? brief(kRow) : null,
      batchStatus: batchK.status,
      after: kAfter ? brief(kAfter) : null,
      constraintKept:
        kRow?.constraintType === kAfter?.constraintType &&
        kRow?.constraintDate === kAfter?.constraintDate,
    };
    log(JSON.stringify(record));
    writeMeasurement(name, record);
    expect(record['constraintRoundTrip']).toBeTruthy();
  });

  /**
   * The cost of the spec's snapshot diff (Task 0.3 step 3), in the real Chromium, over a real
   * `scale-2000` plan's rows. **The function it times does not exist in the product yet**: this is a
   * stand-in written to the spec's own definition (4.6 / US-1: flagged now, not flagged before, placed,
   * not a summary, `visualStart` unchanged since the snapshot), and the reading says so.
   */
  test('snapshot diff cost at scale-2000', async ({ page }) => {
    test.setTimeout(300_000);
    const name = 'follow-logic-m0-diff-cost';
    clearMeasurement(name);
    const spec = scaleSpec({ activities: 2000 });
    const rows = spec.activities.map((a, i) => ({
      id: a.key,
      type: a.type,
      // Every activity placed: the worst case for the diff, which skips unplaced rows early.
      visualStart: `2026-02-${String((i % 27) + 1).padStart(2, '0')}`,
      visualConflictReason: i % 40 === 0 ? 'EARLIER_THAN_LOGIC' : null,
    }));
    await page.goto('about:blank');
    const result = await page.evaluate(
      ({ rows: input }) => {
        interface R {
          id: string;
          type: string;
          visualStart: string | null;
          visualConflictReason: string | null;
        }
        const before = input as R[];
        // After the edit: the first 50 not-yet-flagged placed rows become flagged (a 50-bar cascade,
        // the size FC-N5b measured auto-resolve at).
        let flip = 0;
        const after: R[] = before.map((r) => {
          if (flip < 50 && r.visualConflictReason === null && r.type !== 'WBS_SUMMARY') {
            flip += 1;
            return { ...r, visualConflictReason: 'EARLIER_THAN_LOGIC' };
          }
          return r;
        });
        const snapshot = (rs: R[]): Map<string, { early: boolean; placed: string | null }> => {
          const m = new Map<string, { early: boolean; placed: string | null }>();
          for (const r of rs) {
            m.set(r.id, {
              early: r.visualConflictReason === 'EARLIER_THAN_LOGIC',
              placed: r.visualStart,
            });
          }
          return m;
        };
        const strandedBy = (
          snap: Map<string, { early: boolean; placed: string | null }>,
          rs: R[],
        ): string[] => {
          const out: string[] = [];
          for (const r of rs) {
            if (r.visualConflictReason !== 'EARLIER_THAN_LOGIC') continue;
            if (r.visualStart === null || r.type === 'WBS_SUMMARY') continue;
            const was = snap.get(r.id);
            if (was === undefined || was.early || was.placed !== r.visualStart) continue;
            out.push(r.id);
          }
          return out;
        };
        const run = (): number => {
          const t0 = performance.now();
          const snap = snapshot(before);
          const found = strandedBy(snap, after);
          const t1 = performance.now();
          if (found.length !== 50)
            throw new Error(`diff found ${String(found.length)}, expected 50`);
          return t1 - t0;
        };
        for (let i = 0; i < 20; i += 1) run();
        const samples = Array.from({ length: 50 }, run).sort((a, b) => a - b);
        const q = (p: number): number =>
          samples[Math.min(samples.length - 1, Math.ceil(p * samples.length) - 1)] ?? NaN;
        return {
          n: input.length,
          samples: samples.length,
          p50: q(0.5),
          p95: q(0.95),
          max: samples[samples.length - 1],
          // Snapshot AND diff are timed together, which over-states what the settle alone pays
          // (the snapshot is taken at edit time).
          userAgent: navigator.userAgent,
        };
      },
      { rows },
    );
    log(JSON.stringify(result));
    writeMeasurement(name, { ...result, activities: rows.length });
    expect(result.p95).toBeGreaterThan(0);
  });
});
