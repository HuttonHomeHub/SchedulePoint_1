import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where the measurement harness writes its readings.
 *
 * **A fixed directory and a caller-supplied *name*, never a caller-supplied path.** These specs
 * originally took the whole destination from `process.env.MEASURE_OUT`, which CodeQL correctly
 * flagged as `js/path-injection` — four high-severity alerts, one per spec. A harness is not
 * production code and the variable is set by whoever runs it, but a security gate is not something
 * to argue with or suppress (CLAUDE.md §19.7), and the variable bought nothing: every caller wanted
 * "put the JSON somewhere I can read it", which a known directory answers.
 *
 * The name is reduced to `[A-Za-z0-9._-]`, so it cannot traverse or escape whatever is passed.
 */
const OUTPUT_DIR = join(process.cwd(), 'measure-output');

export function writeMeasurement(name: string, data: unknown): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '');
  const path = join(OUTPUT_DIR, safe.endsWith('.json') ? safe : `${safe}.json`);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(
    path,
    JSON.stringify({ measuredAt: new Date().toISOString(), ...(data as object) }, null, 2),
  );
  return path;
}

/**
 * Delete a measurement before the run that produces it.
 *
 * **A run that dies leaves its LAST answer on disk, and a reader cannot tell.** This cost real time
 * on 2026-08-24: the vertical-stack harness's API server failed to boot, Playwright reported the
 * failure, and the previous run's JSON — hours old — was still sitting there. Read back, it showed
 * a deck height identical to the pre-change one, which reads exactly like "the change had no
 * effect" and would have sent the next hour into redesigning something that may already have been
 * fixed. Three of the day's four instrument failures were this same shape: an instrument that
 * produced nothing and a reader who could not tell.
 *
 * Called at the TOP of a spec, so the file's absence is the honest state until a run replaces it —
 * which makes a stale read impossible rather than merely unlikely. `measuredAt` above is the second
 * half: when a file IS present, it says when.
 */
export function clearMeasurement(name: string): void {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '');
  const path = join(OUTPUT_DIR, safe.endsWith('.json') ? safe : `${safe}.json`);
  rmSync(path, { force: true });
}
