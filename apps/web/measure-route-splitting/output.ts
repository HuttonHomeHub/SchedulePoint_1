import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Where this harness writes its readings — a fixed directory and a caller-supplied *name*, never a
 * caller-supplied path (the `measure-toolbar/output.ts` precedent, after CodeQL flagged an
 * env-driven destination as `js/path-injection`).
 */
const OUTPUT_DIR = join(process.cwd(), 'measure-output');

export function writeReading(name: string, ext: 'json' | 'md', body: string): string {
  const safe = name.replace(/[^A-Za-z0-9._-]/g, '');
  const path = join(OUTPUT_DIR, `${safe}.${ext}`);
  mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(path, body);
  return path;
}
