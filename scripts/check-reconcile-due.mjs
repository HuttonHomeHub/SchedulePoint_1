// @ts-check
/**
 * **Gate B — how many epics have shipped since the last reconciliation pass?**
 *
 * `docs/specs/drift-gates/`, closing `docs/TECH_DEBT.md` #220.
 *
 * `docs/RECONCILE.md` says the pass runs "at each epic boundary", with a three-month hard floor.
 * The floor works, because a date is a fact a person can check. The trigger is weaker, and the
 * reason is not that anybody forgets: **the only record of when the pass last ran was unsorted
 * prose with a contradicting summary line.** On 2026-08-30 a reader auditing that file
 * *specifically for staleness* got it wrong on the first attempt — read the table with `tail -8`,
 * noticed line order was not date order, corrected once, and stopped at the first correction
 * instead of sorting the column.
 *
 * **This WARNS and never blocks** (product-owner decision, 2026-08-30). A missed pass is a
 * documentation debt, not a broken build, and blocking a release on one is how a gate gets bypassed
 * with `--no-verify`. **The weakness is recorded rather than designed away: a warning is ignorable,
 * and that is exactly how #220 happened.** Escalation-to-failure was refused — a blocking gate with
 * extra steps arrives at the same bypass by a longer route.
 *
 * **The threshold is 8 ADRs, derived and not picked** — `docs/specs/drift-gates/m0-measurement.md`
 * shows the working: realised counts per interval `[0,1,1,2,3,3,6,7,8,11,12]`, p75 = 7.50, and T = 8
 * fires on 3 of 11 intervals while catching both occasions the register itself records as failures.
 * A 14-day backstop is kept and honestly labelled: it has never fired and never would have on this
 * history. It is insurance against ADRs ceasing to be the unit, since a period with no ADRs at all
 * sits below every count threshold and would otherwise leave this permanently silent.
 *
 * **An ADR is a proxy for an epic, not the thing** — some epics file none and some file two, so this
 * counts the wrong noun by a factor of about 1.7. That is acceptable only because it is stated.
 */

import { execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';

import { readRepoDoc, report, tableRows } from './lib/doc-register.mjs';

const DOC = 'docs/RECONCILE.md';
const ADR_THRESHOLD = 8;
const BACKSTOP_DAYS = 14;

/**
 * The newest date in the pass table's **date column**, read by cell index.
 *
 * Never by scanning the row's text: `RECONCILE.md`'s findings column is full of dates, and taking
 * the first one a regex meets is how a reader concluded the last pass was five days earlier than it
 * was. And never `tableRows[0]` either — **the table is not guaranteed sorted**, which is the
 * defect this gate exists because of, so the maximum is taken over every row.
 */
function lastPassDate(md) {
  const dates = tableRows(md, 'Passes run')
    .map((cells) => cells[0])
    .filter((c) => /^\d{4}-\d{2}-\d{2}$/.test(c))
    .sort();
  return dates.length > 0 ? dates[dates.length - 1] : null;
}

/**
 * ADRs filed since `since`, by **git add-date**, never the document's own `**Date:**` field —
 * ADR-0070 and ADR-0093 have no `Date` line at all, six use a different format, ADR-0050 has three,
 * and ADR-0071's is the one this repository records as filed two days late.
 *
 * `execFileSync` with a fixed argument array: no shell, and the only interpolated value is a date
 * already validated against `^\d{4}-\d{2}-\d{2}$` by the caller.
 */
function adrsSince(since) {
  const filed = [];
  for (const file of readdirSync('docs/adr')
    .filter((f) => /^\d{4}-.*\.md$/.test(f))
    .sort()) {
    const out = execFileSync(
      'git',
      ['log', '--diff-filter=A', '--format=%ad', '--date=short', '-1', '--', `docs/adr/${file}`],
      { encoding: 'utf8' },
    ).trim();
    if (out && out > since) filed.push({ file, date: out });
  }
  return filed;
}

function main() {
  const md = readRepoDoc(DOC);
  const last = lastPassDate(md);
  const warnings = [];

  if (last === null) {
    // Not a warning. If the table cannot be read, this gate is measuring nothing and says so.
    return report({
      name: 'check:reconcile-due',
      problems: [
        `${DOC}: no dated rows found in the "Passes run" table — the parse is broken, or the table is.`,
      ],
      population: 0,
    });
  }

  const since = adrsSince(last);
  const days = Math.floor((Date.now() - Date.parse(`${last}T00:00:00Z`)) / 86_400_000);

  if (since.length >= ADR_THRESHOLD) {
    warnings.push(
      `${since.length} ADRs have been filed since the last reconciliation pass (${last}), against a ` +
        `threshold of ${ADR_THRESHOLD}: ${since.map((a) => a.file.slice(0, 4)).join(', ')}.`,
    );
    warnings.push(`Run the pass — docs/RECONCILE.md — and add a row to its "Passes run" table.`);
  } else if (days >= BACKSTOP_DAYS) {
    warnings.push(
      `${days} days since the last reconciliation pass (${last}), against a ${BACKSTOP_DAYS}-day backstop. ` +
        `Only ${since.length} ADRs were filed in that time, so the ADR trigger did not fire — which is ` +
        'what the backstop is for: a quiet period leaves the count below every threshold.',
    );
  }

  return report({
    name: 'check:reconcile-due',
    warnings,
    // The population is the pass table, not the ADRs: zero ADRs is a legitimate reading, but a
    // table this cannot read means the gate measured nothing.
    population: 1,
    summary: `last pass ${last} (${days}d ago), ${since.length} ADRs since, threshold ${ADR_THRESHOLD}.`,
  });
}

process.exit(main());
