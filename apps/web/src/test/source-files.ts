import { readdirSync } from 'node:fs';
import { join } from 'node:path';

/** `apps/web/src`, for the structural tests that read source text (vitest runs from `apps/web`). */
export const SRC_DIR = join(process.cwd(), 'src');

/** Every non-test `.ts`/`.tsx` file under `src/`, relative to it, with `/` separators. */
export function allSourceFiles(): string[] {
  return readdirSync(SRC_DIR, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f) && !f.includes('.test.') && !f.includes('.spec.'))
    .map((f) => f.split('\\').join('/'));
}

/**
 * Strip block and line comments so a docblock describing a rule cannot violate it — several gates
 * in this repository have been caught matching their own prose.
 */
export function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}
