import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **Every production `<TsldPanel>` host states its basis explicitly** (ADR-0163 spec §4.8,
 * M2-T2). `TsldPanel`'s `barDateSource` prop defaults to `'early'` — deliberately, because 78 test
 * mounts across 35 suites rely on that default and changing it is out of proportion to this fix —
 * but a REAL screen inheriting `'early'` by omission is exactly the defect this epic exists to
 * close: it shipped once already (the guest view, before ADR-0163), silently, because nothing
 * checked that every host had made a choice.
 *
 * **The tag reader must handle balanced braces**, because a naive `/<TsldPanel[^>]*>/` ends at the
 * FIRST `>` a sibling attribute's expression contains — an arrow function body with a comparison
 * (`onX={() => a > b}`) or a nested JSX element closes the match early and the scan silently stops
 * reading the rest of the tag, including a `barDateSource=` that comes after it. That exact hole is
 * recorded in ADR-0145 (a container-query scan making the same mistake over `className=`
 * expressions) — copied here rather than re-derived, because two implementations of "read a JSX
 * tag" would drift the way `docs/adr/0065-…` warns a second `routeOrthogonal` would.
 *
 * **A census over an empty glob passes** (ADR-0093/0108's shape: a green suite cannot tell "no
 * violations" from "nothing was scanned"), so this carries a pinned positive case: it must find at
 * least 2 hosts, which is the measured count on this tree
 * (`components/layout/workspace/plan-workspace-toolbar.tsx`, `features/share/components/
 * GuestPlanView.tsx`) — if a refactor drops that to fewer, the scan has stopped reading the tree
 * and the "0 violations" result below is worthless.
 *
 * **Verified red** by (a) removing `barDateSource` from `GuestPlanView.tsx`'s `<TsldPanel>` call,
 * (b) adding a fixture host whose `barDateSource=` attribute sits after a sibling `onX={() => …}`
 * expression (the naive-regex hole), and (c) pointing the glob at a directory with no `.tsx` files
 * at all, which must fail on the pinned count rather than reporting a clean pass.
 */
const ROOT = 'src';

/**
 * Every `<TsldPanel …>` opening tag in a source string, with balanced `{}` — so an embedded `>`
 * inside an attribute expression (an arrow function, a comparison, a nested element) does not end
 * the match early.
 */
export function tsldPanelOpeningTags(source: string): string[] {
  const out: string[] = [];
  for (const match of source.matchAll(/<TsldPanel(?=[\s/>])/g)) {
    const start = match.index ?? 0;
    let i = start + match[0].length;
    let depth = 0;
    for (; i < source.length; i += 1) {
      const ch = source[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth <= 0) {
        i += 1;
        break;
      }
    }
    out.push(source.slice(start, i));
  }
  return out;
}

function strip(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

describe('every production <TsldPanel> host states its bar-date basis (ADR-0163)', () => {
  const files = execFileSync('git', ['ls-files', ROOT], { cwd: process.cwd(), encoding: 'utf8' })
    .split('\n')
    .filter((path) => /\.tsx$/.test(path) && !/\.test\.tsx$/.test(path));

  const hosts = files.flatMap((path) =>
    tsldPanelOpeningTags(strip(readFileSync(path, 'utf8'))).map((tag) => ({ path, tag })),
  );

  /** The pinned positive case (ADR-0093/0108): a scan finding nothing has stopped reading the tree. */
  it('finds the production hosts that exist', () => {
    expect(
      hosts.length,
      'the scan found fewer than 2 <TsldPanel> hosts — it has stopped reading the tree',
    ).toBeGreaterThanOrEqual(2);
  });

  it('passes barDateSource= explicitly at every host, rather than inheriting the unit-suite default', () => {
    const silent = hosts.filter(({ tag }) => !/\bbarDateSource=/.test(tag)).map(({ path }) => path);

    expect(
      silent,
      "a production <TsldPanel> host with no barDateSource= inherits the `'early'` default meant " +
        'only for unit suites — state the basis explicitly (barDateSourceFor(lateOverlayActive))',
    ).toEqual([]);
  });
});
