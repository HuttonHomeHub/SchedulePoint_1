import { mkdirSync, writeFileSync } from 'node:fs';
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
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}
