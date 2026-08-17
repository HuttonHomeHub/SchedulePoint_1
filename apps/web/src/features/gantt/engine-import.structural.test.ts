import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Nothing in the web client imports the CPM engine.**
 *
 * The Gantt-editing epic's parity argument (ADR-0034) is that `computeSchedule`'s input is
 * unchanged, because the client only reads columns the engine already wrote. That claim is prose
 * until something checks it, which is ADR-0058's whole subject — so this is the check.
 *
 * **Scope is the whole of `apps/web/src`, deliberately, and not `features/gantt/`.** The precedent
 * this is modelled on (`features/float-paths/float-paths-view-agnostic.structural.test.ts`)
 * self-scopes to its own directory because its concern *is* directory ownership — "is this feature a
 * peer of both views". This one's concern is not: "does anything reach the engine" has nothing to do
 * with which folder does the reaching, and a Gantt-scoped copy would be structurally blind to
 * `components/layout/workspace/use-plan-workspace-model.ts`, which is exactly where the epic's
 * write-path wiring lands. Told to me by the test-engineer review; the narrower version would have
 * passed while missing the only file that matters.
 *
 * **It is not redundant, and the record of why is worth keeping.** That same review first called it
 * a gate on a channel the module system already closes, "because the engine pulls in Prisma/Nest,
 * neither of which bundles for a browser". That is false:
 * `grep -rn "^import" apps/api/src/modules/schedule/engine/*.ts | grep -iE "nestjs|prisma"` returns
 * nothing across all 14 files, and the one transitive hop (`common/validation/calendar-date.ts` →
 * `class-validator`) is browser-safe. The engine is **pure** — that is ADR-0022's point, and why
 * `packages/engine-conformance` can consume it engine-free — so a relative import from here would
 * resolve and would bundle. The channel is open; this closes it.
 */

const WEB_SRC = join(import.meta.dirname, '..', '..');

/** Any path that reaches the API's schedule engine, however it is spelled. */
const ENGINE_IMPORT = /from\s+['"][^'"]*modules\/schedule\/engine[^'"]*['"]/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    if (!/\.tsx?$/.test(entry) || /\.test\.tsx?$/.test(entry)) return [];
    return [path];
  });
}

describe('the web client and the CPM engine', () => {
  it('scans a tree big enough for the assertion to mean something', () => {
    // A floor, not a count. Without it a moved directory or a broken walker would read as
    // "nothing imports the engine" — the failure mode `create-activity-gate.structural.test.ts`
    // records having to guard against.
    expect(sourceFiles(WEB_SRC).length).toBeGreaterThan(400);
  });

  it('imports nothing from it, anywhere in apps/web/src', () => {
    const offenders = sourceFiles(WEB_SRC)
      .filter((path) => ENGINE_IMPORT.test(readFileSync(path, 'utf8')))
      .map((path) => path.slice(WEB_SRC.length + 1));
    // Named individually: the list is the checklist.
    expect(
      offenders,
      `The engine is server-side. Read the persisted columns instead:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
