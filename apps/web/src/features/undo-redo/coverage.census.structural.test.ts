import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { COVERAGE, type Coverage } from './coverage';

/**
 * **Every plan-authoring write is undoable or on the written exclusion list** (undo-redo M3, spec
 * §4.6, ADR-0176 D6, ADR-0058's "a computed gate, not a promise").
 *
 * The dialog create, the outline moves, the steps, the assignments and the cross-plan links were all
 * writes Undo silently skipped, each found by somebody noticing — nothing connected "a mutation hook
 * was added" to "somebody decided whether it is undoable". This computes the set and fails the unit
 * suite (and therefore `pnpm prepush`) when a hook is in neither column of `coverage.ts`.
 *
 * **How a mutation hook is found: by structure, not by name.** The spec sketched a verb regex
 * (`use(Create|Update|Delete|…)…`), but a name says what its author called it, and `useCaptureBaseline`,
 * `useActivateBaseline` and `useCommitImport` are writes that no such list would have named. A hook
 * is a mutation hook when its body calls `useMutation(` — which is what makes it a write — and the
 * scope is the hooks CALLED from the plan workspace and the feature components it renders.
 *
 * **What this cannot see — it is a tripwire, not a classifier.** A write made some other way (a bare
 * `apiFetch` in an event handler, a hook that wraps a mutation hook and is the only thing called) is
 * invisible to it; and it proves that a decision was written down, not that a `recorded` entry's seam
 * is wired at every host (the model's own tests and the host-seam structural tests hold that).
 */

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * Where a write the planner makes in the plan workspace can be made from: the workspace itself and the
 * feature components it renders. Hierarchy and administration (clients, projects, members,
 * organisations, recently deleted, auth) are not plan authoring and are deliberately not here.
 */
const SCOPE = [
  'components/layout/workspace',
  'features/activities',
  'features/activity-copy',
  'features/baselines',
  'features/calendars',
  'features/cross-plan-dependencies',
  'features/dependencies',
  'features/earned-value',
  'features/gantt',
  'features/interchange',
  'features/notes',
  'features/plan-lock',
  'features/plans',
  'features/resources',
  'features/schedule',
  'features/schedule-health',
  'features/share',
  'features/tsld',
  'features/wbs',
];

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(path, out);
    else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

/** Comments out: a docblock that mentions `useFoo()` is not a call. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** Every hook that calls `useMutation(` in its own body, and the file that defines it. */
function mutationHooks(files: readonly string[]): Map<string, string> {
  const hooks = new Map<string, string>();
  for (const file of files) {
    const source = withoutComments(readFileSync(file, 'utf8'));
    const heads = [...source.matchAll(/^export function (use\w+)\(/gm)];
    heads.forEach((head, i) => {
      const end = heads[i + 1]?.index ?? source.length;
      if (/\buseMutation\(/.test(source.slice(head.index, end))) hooks.set(head[1] as string, file);
    });
  }
  return hooks;
}

/** The hooks among `hooks` that a file in `scopeFiles` (other than the one defining it) calls. */
function hooksCalledFrom(
  hooks: ReadonlyMap<string, string>,
  scopeFiles: readonly string[],
): Set<string> {
  const used = new Set<string>();
  for (const file of scopeFiles) {
    const source = withoutComments(readFileSync(file, 'utf8'));
    for (const [name, definedIn] of hooks) {
      if (file !== definedIn && new RegExp(`\\b${name}\\(`).test(source)) used.add(name);
    }
  }
  return used;
}

/** Hooks in use that the coverage list does not mention. */
const uncovered = (used: ReadonlySet<string>, coverage: Readonly<Record<string, Coverage>>) =>
  [...used].filter((name) => !(name in coverage)).sort();

/** Entries in the coverage list that no hook in use answers to. */
const stale = (used: ReadonlySet<string>, coverage: Readonly<Record<string, Coverage>>) =>
  Object.keys(coverage)
    .filter((name) => !used.has(name))
    .sort();

describe('undo coverage census', () => {
  const all = sourceFiles(SRC);
  const hooks = mutationHooks(all);
  const scopeFiles = all.filter((file) =>
    SCOPE.some((dir) => relative(SRC, file).startsWith(`${dir}/`)),
  );
  const used = hooksCalledFrom(hooks, scopeFiles);

  it('finds the hooks it exists to check — a scan that finds nothing passes everything', () => {
    // Seventy-odd mutation hooks in the app and fifty-odd reached from the plan workspace at the time
    // of writing. Floors rather than equalities, so adding a hook fails the next case and not this.
    expect(hooks.size).toBeGreaterThanOrEqual(60);
    expect(used.size).toBeGreaterThanOrEqual(45);
  });

  it('every mutation hook the plan workspace reaches is recorded or excluded with a reason', () => {
    expect(uncovered(used, COVERAGE)).toEqual([]);
  });

  it('every entry still names a hook the plan workspace reaches', () => {
    expect(stale(used, COVERAGE)).toEqual([]);
  });

  it('every recorded entry names a command builder that exists', () => {
    const builders = new Set(
      ['commands.ts', 'record-commands.ts'].flatMap((name) =>
        [
          ...readFileSync(join(dirname(fileURLToPath(import.meta.url)), name), 'utf8').matchAll(
            /^export function (\w+Command)\(/gm,
          ),
        ].map((m) => m[1] as string),
      ),
    );
    const ghosts = Object.entries(COVERAGE)
      .filter(([, entry]) => entry.status === 'recorded' && !builders.has(entry.seam))
      .map(([name]) => name);
    expect(ghosts).toEqual([]);
  });

  it('every exclusion carries a reason', () => {
    const bare = Object.entries(COVERAGE)
      .filter(([, entry]) => entry.status === 'excluded' && entry.reason.trim().length < 20)
      .map(([name]) => name);
    expect(bare).toEqual([]);
  });

  it('pinned positive cases: a hook with no decision is reported, and so is a dead entry', () => {
    const coverage: Record<string, Coverage> = {
      useKnown: { status: 'excluded', reason: 'Written down, for a reason.' },
      useGone: { status: 'excluded', reason: 'Nothing calls this any more.' },
    };
    const reached = new Set(['useKnown', 'useNewWrite']);
    expect(uncovered(reached, coverage)).toEqual(['useNewWrite']);
    expect(stale(reached, coverage)).toEqual(['useGone']);
  });
});
