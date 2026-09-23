import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Every planner command takes the "before" snapshot, or says why not** (NetPoint-layout M3,
 * ADR-0153).
 *
 * An edit moves only the bar that caused it, and the rule can only tell which bar that was if it
 * saw the plan BEFORE the command's write (`autoResolve.begin`, called here as `beginLayoutEdit`).
 * A command path that forgets the call is invisible: nothing fails, the plan still recalculates,
 * and an overlap the edit made simply stays — exactly the report this epic opened on. So every
 * `editHistory.record(` in the workspace model is held to it: the function that records must call
 * `beginLayoutEdit(` or carry a `layout-exempt:` comment giving its reason.
 *
 * A second assertion closes the other door: every command constructor `commands.ts` exports is
 * recorded from the model, so a new constructor cannot be called from somewhere this scan does
 * not read.
 *
 * **What this cannot see**: a `beginLayoutEdit` placed AFTER the write it guards. The scan asks
 * whether the enclosing function calls it, not in what order; the unit and journey cases are what
 * pin the order, for the handlers they cover.
 */
const MODEL = resolve(__dirname, 'use-plan-workspace-model.ts');
const COMMANDS = resolve(__dirname, '../../../features/undo-redo/commands.ts');

/** A function head in the model: a handler, a memo method, or a `useCallback`. */
const HEAD = /^\s{2,8}(const \w+ = async \(|const \w+ = useCallback\(|\w+: async \()/;

type SiteVerdict = 'begin' | 'exempt' | 'missing';

function classifyRecordSites(source: string): { line: number; verdict: SiteVerdict }[] {
  const lines = source.split('\n');
  const sites: { line: number; verdict: SiteVerdict }[] = [];
  lines.forEach((text, i) => {
    if (!text.includes('editHistory.record(')) return;
    let j = i;
    while (j > 0 && !HEAD.test(lines[j] ?? '')) j -= 1;
    const body = lines.slice(j, i + 1).join('\n');
    const verdict: SiteVerdict = body.includes('beginLayoutEdit(')
      ? 'begin'
      : body.includes('layout-exempt:')
        ? 'exempt'
        : 'missing';
    sites.push({ line: i + 1, verdict });
  });
  return sites;
}

describe('auto-resolve census', () => {
  const model = readFileSync(MODEL, 'utf8');

  it('finds the record sites it exists to check — a scan that finds nothing passes everything', () => {
    // Nineteen at the time of writing. A floor rather than an equality, so adding a command does not
    // fail this for the wrong reason; the next case is the one that fails for the right one.
    expect(classifyRecordSites(model).length).toBeGreaterThanOrEqual(19);
  });

  it('every record site snapshots first or states why it need not', () => {
    const missing = classifyRecordSites(model).filter((s) => s.verdict === 'missing');
    expect(missing).toEqual([]);
  });

  it('exempts only what it has reasons for — lane-only writes that are resolved at the write', () => {
    const exempt = classifyRecordSites(model).filter((s) => s.verdict === 'exempt');
    // The lane drop (resolved before it writes) and Arrange (packs with no overlap by construction).
    expect(exempt).toHaveLength(2);
  });

  it('pinned positive case: a record with neither is reported', () => {
    const source = [
      '  const onTsldThing = async () => {',
      '    await write();',
      '    editHistory.record(thingCommand());',
      '  };',
    ].join('\n');
    expect(classifyRecordSites(source)).toEqual([{ line: 3, verdict: 'missing' }]);
  });

  it('every exported command constructor is recorded from the model', () => {
    const commands = readFileSync(COMMANDS, 'utf8');
    const constructors = [...commands.matchAll(/^export function (\w+Command)\(/gm)].map(
      (m) => m[1] as string,
    );
    expect(constructors.length).toBeGreaterThanOrEqual(16);
    const unreached = constructors.filter((name) => !model.includes(`${name}(`));
    expect(unreached).toEqual([]);
  });
});
