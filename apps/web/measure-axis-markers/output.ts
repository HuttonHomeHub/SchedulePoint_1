import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where this harness writes its readings — a fixed directory and a caller-supplied *name*, never a
 * caller-supplied path (the `measure-toolbar/output.ts` precedent, after CodeQL correctly flagged
 * an env-driven destination as `js/path-injection`).
 */
const OUTPUT_DIR = join(process.cwd(), 'measure-output');

export function writeMeasurement(name: string, data: unknown): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '');
  const path = join(OUTPUT_DIR, safe.endsWith('.json') ? safe : `${safe}.json`);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}
