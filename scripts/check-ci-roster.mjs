#!/usr/bin/env node
/**
 * **Every root `check:*` gate runs in CI, or is exempt with a written reason** (`docs/TECH_DEBT.md`
 * #244).
 *
 * The gates in this repository are its memory. A gate that exists, passes locally and is never run
 * by CI is worse than no gate: it reads as coverage on every PR that does not run `pnpm prepush`,
 * and the one thing nobody checks is the list of things that get checked.
 *
 * ## The trap this is built around, which is LIVE rather than hypothetical
 *
 * `#244`'s own recommended remedy was a one-liner grepping `ci.yml` for each gate's name. Run
 * today, that reports **`check:reconcile-due` as covered** — and its only occurrence in the whole
 * file is a comment at `:75-77` saying it is *deliberately absent*. So the naive check passes over
 * the single genuine absence in the roster, by reading the sentence that documents it.
 *
 * That is why **R6 is the load-bearing assertion and not a defensive extra**, and why comments are
 * stripped before anything is matched. Four gate names appear inside comments in `ci.yml` today.
 *
 * ## Why this parses text rather than YAML, reversing the spec's D3
 *
 * `docs/specs/delivery-gates/feature-spec.md` §4.1 D3 chose a real YAML parse, on the stated
 * ground that `yaml` is already in the lockfile and therefore free. It is in the lockfile — at a
 * single version, 2.9.0, resolved transitively through `@changesets/cli` — and it is **not
 * importable from the root**: `import('yaml')` from a root script throws `ERR_MODULE_NOT_FOUND`
 * under pnpm's strict layout. Measured, not assumed. So declaring it is a real new root dependency,
 * and §2 is clear that every dependency is a liability.
 *
 * The stronger reason is that **a YAML parse would not have removed the work**. It hands back a
 * `run:` block's body as a string, shell comments included — so a gate name mentioned in a shell
 * comment inside a `run:` step still has to be stripped by hand. The parser solves the half that is
 * easy and leaves the half that is the defect. Both approaches need comment-stripping; only one
 * needs a dependency.
 *
 * Its residual risk is named and made loud rather than accepted: a `#` inside a quoted string would
 * make naive stripping eat real content. There is none in `ci.yml` today (measured), and R8 below
 * **refuses to run** rather than misreading the file if one ever appears.
 *
 * ## The converse direction (`docs/TECH_DEBT.md` #299, `docs/specs/ci-command-roster/`)
 *
 * R1–R4a ask whether every `prepush` gate runs in CI. R9–R13 ask the other way: **every `run:`
 * command in a checked CI job is a fixed `prepush` stage, a root `check:*` gate, or carries a
 * written reason in `scripts/ci-roster.json`'s `ciOnly`.** Two CI-only commands (the web bundle
 * budget, `format:check`) were each found by a red pull request after `prepush` passed; ADR-0160's
 * rule that a gate CI runs is a gate prepush runs was prose until this.
 *
 * Refused rather than read (R13), because each would let a command through unseen: a `run:` whose
 * value continues on a deeper-indented line (`&& …` joined by the shell), flow-style steps
 * (`- {run: …}`), a quoted `"run":` key, a block scalar, and `working-directory:` in a checked job
 * (it makes `pnpm lint` a different command). A `run:` is read only at the step's own mapping
 * level, so an `env:`/`with:` entry named `run` is not a command. The prepush stage parser matches
 * only `run "<label>" pnpm <script>` at the start of a line and fails closed otherwise: a stage
 * written any other way is not a stage, so CI repeating it is a finding.
 *
 * ## What this deliberately does NOT check
 *
 * Other workflows (`pr-title.yml`, CodeQL), `uses:` steps, and block-scalar `run:` bodies (refused
 * by R13 rather than read). That the CI step is correct, that it runs in a job that actually
 * executes, or that the workflow is triggered at all. It checks that the two rosters name the same gates. A step that is present
 * and broken is a different failure with a different owner, and claiming otherwise would make this
 * gate's green mean more than it does.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { parseAdvisoryGates } from './lib/advisory-gates.mjs';
import { report } from './lib/doc-register.mjs';

const NAME = 'check:ci-roster';

/** The gate's own source, for the R5 self-scan. Exported so the suite reads what the CLI runs. */
export const SELF = 'scripts/check-ci-roster.mjs';

/** Keep only the entries whose reason is a non-empty string — a blank reason is no reason. */
function reasoned(map) {
  return Object.fromEntries(
    Object.entries(map ?? {}).filter(([, why]) => typeof why === 'string' && why.trim() !== ''),
  );
}

/**
 * The fixed stages `prepush.sh` runs, read from its `run "<label>" pnpm <script>` lines rather than
 * restated. The derived `run "$gate" pnpm "$gate"` loop does not match: its script is quoted.
 */
function parsePrepushStages(text) {
  const stages = new Set();
  for (const line of text.split('\n')) {
    const m = /^\s*run\s+"[^"]+"\s+pnpm\s+([a-z][a-z0-9:-]*)\s*$/.exec(line);
    if (m) stages.add(`pnpm ${m[1]}`);
  }
  return stages;
}

/**
 * Jobs and their `run:` values from comment-stripped workflow text: the 2-space-indented keys under
 * `jobs:`. Text-based like the rest of this gate (see the docblock for why not YAML).
 */
function parseJobs(stripped) {
  const jobs = [];
  let inJobs = false;
  let current = null;
  let stepColumn = -1;
  let pendingRun = null;
  const refuse = (line, why) => current?.refusals.push({ line, why });
  const indentOf = (text) => text.length - text.trimStart().length;
  stripped.split('\n').forEach((text, index) => {
    const line = index + 1;
    if (/^jobs:\s*$/.test(text)) {
      inJobs = true;
      return;
    }
    if (!inJobs) return;
    if (/^\S/.test(text)) {
      inJobs = false;
      current = null;
      return;
    }
    const job = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(text);
    if (job) {
      current = { name: job[1], runs: [], refusals: [] };
      jobs.push(current);
      pendingRun = null;
      stepColumn = -1;
      return;
    }
    if (!current || text.trim() === '') return;
    const indent = indentOf(text);
    // A plain scalar continues on any deeper-indented line: `run: pnpm lint` followed by
    // `  && curl …` is ONE command to the shell, and reading only the first line passed it.
    if (pendingRun && indent > pendingRun.column && !pendingRun.block) {
      refuse(
        line,
        'continues the `run:` above it across lines. Write one command per `run:`, on one line',
      );
      return;
    }
    pendingRun = null;
    const dash = /^(\s*)-\s+/.exec(text);
    if (dash) stepColumn = (dash[1] ?? '').length + 2;
    if (/^\s*-\s*\{/.test(text) || /\{[^}]*\brun\s*:/.test(text)) {
      refuse(line, 'is a flow-style step, whose `run:` this gate cannot read. Use block style');
      return;
    }
    if (/^\s*(?:-\s+)?["']run["']\s*:/.test(text)) {
      refuse(line, 'quotes the `run` key, which this gate would silently drop. Write it unquoted');
      return;
    }
    if (/^\s*(?:-\s+)?working-directory\s*:/.test(text)) {
      refuse(line, 'sets `working-directory`, which makes the `run:` commands a different command');
      return;
    }
    const run = /^(\s*(?:-\s+)?)run:\s*(.*?)\s*$/.exec(text);
    // Only the step's own mapping: an `env:` or `with:` entry named `run` sits deeper.
    if (run && (run[1] ?? '').length === stepColumn) {
      const value = run[2] ?? '';
      current.runs.push({ value, line });
      pendingRun = { column: stepColumn, block: /^[|>][-+]?$/.test(value) };
    }
  });
  return jobs;
}

/**
 * Run the whole gate against a repository root, and return the exit code.
 *
 * Exported — and the CLI below is a two-line caller — so the suite drives the REAL wiring,
 * `report()` included. `stack-record.structural.test.ts` asserted against a private mirror of the
 * logic it was named for and would have stayed green through the regression its own docblock
 * described; the sibling gates in this directory take this shape for that reason.
 */
export function runGate(root) {
  const read = (p) => readFileSync(join(root, p), 'utf8');
  const problems = [];

  const pkg = JSON.parse(read('package.json'));
  const declared = Object.keys(pkg.scripts ?? {}).filter((k) => k.startsWith('check:'));

  /**
   * **A `check:*` in CI is not necessarily a ROOT script, and this gate assumed it was.**
   *
   * Found by `docs/specs/delivery-gates/` M3: `check:bundle-size` lives in `apps/web`, and CI
   * invoked it as `pnpm --filter @repo/web check:bundle-size`, so R2 reported a CI step for a script
   * that does not exist — true of the root manifest and false of the repository.
   *
   * **No live CI step uses this branch since ADR-0160.** The bundle budget now runs through the root
   * gate `check:web-bundle`, which prepush runs too; the reason it was kept out of prepush ("a
   * five-second `pnpm prepush`") did not survive measurement. The branch stays, with its tests,
   * because the next workspace-level gate will need it, and deleting it would leave R2 wrong about
   * that step on the day it lands.
   *
   * Exempting it would have been the quick answer and the wrong one: the gate would then be blind
   * to a workspace step naming a script that really had been renamed. So workspace scripts are
   * resolved where they live, and R2 keeps its teeth in both places.
   */
  const workspaceScripts = new Map();
  for (const dir of ['apps', 'packages']) {
    let entries = [];
    try {
      entries = readdirSync(join(root, dir), { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const manifest = JSON.parse(read(join(dir, entry.name, 'package.json')));
        if (typeof manifest.name === 'string') {
          workspaceScripts.set(manifest.name, new Set(Object.keys(manifest.scripts ?? {})));
        }
      } catch {
        // A directory without a manifest is not a workspace package.
      }
    }
  }

  let workflow;
  try {
    workflow = read('.github/workflows/ci.yml');
  } catch {
    // Fail closed and say so. A missing workflow would otherwise make `inCi` empty and every
    // declared gate look unwired — a true-sounding flood of findings with one real cause.
    problems.push(
      '.github/workflows/ci.yml could not be read, so nothing below is a statement about CI.',
    );
    return report({ name: NAME, problems, population: declared.length });
  }

  /**
   * **R8 — refuse rather than misread.** Naive `#`-to-end-of-line stripping is correct only while
   * no `#` sits inside a quoted string. That holds in `ci.yml` today and is not a property anybody
   * maintains, so the gate checks it and stops. A gate that quietly starts reading its subject
   * wrong is the failure this whole file is about.
   */
  const lines = workflow.split('\n');
  const quoted = lines.findIndex((line) => /(['"])[^'"]*#[^'"]*\1/.test(line));
  if (quoted >= 0) {
    problems.push(
      `.github/workflows/ci.yml line ${quoted + 1} has a '#' inside a quoted string, so stripping ` +
        'comments by line would eat real content. This gate refuses to guess: quote it ' +
        'differently, or teach this check to parse YAML properly.',
    );
    return report({ name: NAME, problems, population: declared.length });
  }

  /** Comments gone — YAML's and the shell's alike, which is the same rule and the same defect. */
  const stripped = workflow.replace(/#[^\n]*/g, '');

  // Workspace invocations first, so their gate names are not then counted as root ones.
  const workspaceCalls = [...stripped.matchAll(/--filter\s+(\S+)\s+(check:[a-z][a-z0-9-]*)/g)].map(
    (m) => ({ workspace: m[1], gate: m[2] }),
  );

  for (const { workspace, gate } of workspaceCalls) {
    const scripts = workspaceScripts.get(workspace);
    if (scripts === undefined) {
      problems.push(
        `.github/workflows/ci.yml runs ${gate} in workspace ${workspace}, which is not a package ` +
          'in apps/ or packages/.',
      );
    } else if (!scripts.has(gate)) {
      problems.push(
        `.github/workflows/ci.yml runs ${gate} in ${workspace}, which declares no such script. ` +
          'A renamed or deleted gate leaves a CI step that fails for a reason nobody expects.',
      );
    }
  }

  const workspaceGateNames = new Set(workspaceCalls.map((c) => c.gate));
  const inCi = new Set(
    [...stripped.matchAll(/\bcheck:[a-z][a-z0-9-]*/g)]
      .map((m) => m[0])
      .filter((name) => !workspaceGateNames.has(name)),
  );

  let exempt = {};
  let ciOnlyConfig = {};
  try {
    const roster = JSON.parse(read('scripts/ci-roster.json'));
    exempt = roster.exempt ?? {};
    // A missing `ciOnly` reads as empty maps, which fails closed: every CI-only command is then a
    // finding, rather than the whole converse check being skipped.
    ciOnlyConfig = roster.ciOnly ?? {};
  } catch {
    problems.push(
      'scripts/ci-roster.json is missing or unreadable. It is where an exemption lives; without ' +
        'it a deliberate absence is indistinguishable from a forgotten one.',
    );
  }

  // **The ADVISORY set, read out of `scripts/prepush.sh` and never restated** — the spec's D2, and
  // the one decision this gate shipped without. Three of the five M5 specialist reviews found the
  // gap independently, and it reproduces: add `run: pnpm check:reconcile-due` to `ci.yml` AND
  // remove its `ci-roster.json` entry — the natural pair of edits, since an entry saying "need not
  // run in CI" looks redundant once it does — and the gate reported OK, silently converting a
  // product-owner decision (ADR-0120: this gate WARNS and never blocks) into a blocking CI gate by
  // the back door. R4 caught the single-edit version only by coincidence, because the one advisory
  // gate happens also to hold the one exemption.
  //
  // `scripts/ci-roster.json`'s own comment CLAIMED this was already derived — "an entry here for a
  // gate that is NOT advisory fails check:advisory-agreement instead" — which was false: that gate
  // reads `prepush.sh` and each gate's source and has never heard of `ci-roster.json`. A
  // decision-bearing claim asserted and not checked (ADR-0076 Class 3), inside the epic closing
  // that class. The claim is now true because the derivation exists.
  let advisory = new Set();
  try {
    advisory = parseAdvisoryGates(read('scripts/prepush.sh'));
  } catch (error) {
    problems.push(
      `the advisory set could not be read from scripts/prepush.sh: ${
        error instanceof Error ? error.message : error
      }\n      Every assertion about advisory gates below is over that set, so an unreadable one ` +
        'is refused rather than treated as empty.',
    );
  }

  // **A note on the R numbers, because the spec's and the code's diverged.** `feature-spec.md` D4
  // labels the ADVISORY assertions R3/R4 and has no label for the exempt map's own consistency;
  // this file labelled the exempt-map checks R3/R4 and had no advisory assertions at all. The M5
  // test-engineer review found a reader auditing spec-against-code has to reverse-engineer the
  // mapping. Rather than renumber shipped labels, the advisory pair lands as **R3a/R4a** below and
  // this comment is the mapping: spec R3 = code R3a, spec R4's advisory half = code R4a, and code
  // R3/R4 are the stale-entry and contradiction checks the spec folded into R4's second half.
  //
  // R1 — every declared gate is in CI, or exempt with a reason.
  for (const gate of declared) {
    if (inCi.has(gate)) continue;
    // Advisory is a sufficient reason in itself, read from the one place that declares it.
    if (advisory.has(gate)) continue;
    const reason = exempt[gate];
    if (typeof reason === 'string' && reason.trim() !== '') continue;
    problems.push(
      `${gate} is a root check:* script and runs in no CI step.\n` +
        '      Two remedies, and they are not interchangeable: add the step to ' +
        '.github/workflows/ci.yml, or — if it is deliberately not a CI gate — add it to ' +
        'scripts/ci-roster.json with the reason. "Not yet" is not a reason.',
    );
  }

  // R2 — CI does not run a gate that no longer exists.
  for (const gate of inCi) {
    if (declared.includes(gate)) continue;
    problems.push(
      `.github/workflows/ci.yml runs ${gate}, which is not a check:* script in package.json.\n` +
        '      A renamed or deleted gate leaves a CI step that fails for a reason nobody expects.',
    );
  }

  // R3 — an exemption for a gate that does not exist is stale.
  for (const gate of Object.keys(exempt)) {
    if (declared.includes(gate)) continue;
    problems.push(
      `scripts/ci-roster.json exempts ${gate}, which is not a check:* script any more. Delete the ` +
        'entry: a stale exemption is an exemption nobody is reading.',
    );
  }

  // R4 — an exemption for a gate that IS in CI is a contradiction.
  for (const gate of Object.keys(exempt)) {
    if (!inCi.has(gate)) continue;
    problems.push(
      `scripts/ci-roster.json says ${gate} need not run in CI, and .github/workflows/ci.yml runs ` +
        'it. One of the two is wrong, and the file with the reason in it is the one to read first.',
    );
  }

  // R3a — an ADVISORY gate may not run in CI. This is the assertion the back door needed, and it
  // is independent of `ci-roster.json` by construction: it compares CI against `prepush.sh`, so
  // deleting the exemption cannot make it go quiet. GitHub Actions treats exit 2 as an ordinary
  // job failure, so a step here turns "warns, never blocks" into "blocks" with nothing saying so.
  for (const gate of advisory) {
    if (!inCi.has(gate)) continue;
    problems.push(
      `${gate} is declared ADVISORY in scripts/prepush.sh and .github/workflows/ci.yml runs it.\n` +
        '      CI has no advisory mode — it treats exit 2 as a failed job — so the step converts a ' +
        'deliberate "warns, never blocks" decision into a blocking gate. Remove the step, or ' +
        'remove the gate from ADVISORY_GATES and mean it.',
    );
  }

  // R4a — an advisory gate needs no `ci-roster.json` entry to justify its absence, but it must not
  // be justified TWICE. Two reasons for one absence are two places to update, and the day they
  // disagree the reader cannot tell which is current.
  for (const gate of Object.keys(exempt)) {
    if (!advisory.has(gate)) continue;
    if (!declared.includes(gate)) continue;
    problems.push(
      `${gate} is declared ADVISORY in scripts/prepush.sh AND carries a reason in ` +
        'scripts/ci-roster.json. The advisory declaration is sufficient on its own and is the one ' +
        'a reader will find; delete the roster entry rather than maintaining two answers.',
    );
  }

  // R9–R13 — the converse: what CI runs that `prepush` does not.
  const ciOnly = {
    jobs: reasoned(ciOnlyConfig.jobs),
    commands: Object.fromEntries(
      Object.entries(reasoned(ciOnlyConfig.commands)).map(([k, v]) => [
        k.trim().replace(/\s+/g, ' '),
        v,
      ]),
    ),
  };
  let prepushStages = new Set();
  try {
    prepushStages = parsePrepushStages(read('scripts/prepush.sh'));
  } catch {
    // Already reported above as an unreadable advisory set; the stages come from the same file.
  }
  const jobs = parseJobs(stripped);
  const checkedCommands = new Set();
  let checkedJobs = 0;
  if (prepushStages.size === 0) {
    problems.push(
      'no fixed stage could be parsed from scripts/prepush.sh (`run "<label>" pnpm <script>`), so ' +
        'every comparison below would be against an empty set. Refused rather than guessed (R13).',
    );
  } else if (jobs.length === 0) {
    problems.push('.github/workflows/ci.yml has no `jobs:` key this gate can read (R13).');
  } else {
    for (const job of jobs) {
      if (job.name in ciOnly.jobs) continue;
      checkedJobs += 1;
      for (const { line, why } of job.refusals) {
        problems.push(`.github/workflows/ci.yml line ${line}: job ${job.name} ${why} (R13).`);
      }
      let commands = 0;
      for (const { value, line } of job.runs) {
        if (/^[|>][-+]?$/.test(value)) {
          problems.push(
            `.github/workflows/ci.yml line ${line}: job ${job.name} has a block-scalar \`run:\` ` +
              'this gate cannot read command by command. Write one command per `run:` (R13).',
          );
          continue;
        }
        commands += 1;
        const command = value.replace(/\s+/g, ' ');
        checkedCommands.add(command);
        const asRoot = /^pnpm (check:[a-z][a-z0-9-]*)$/.exec(command);
        if (prepushStages.has(command)) {
          continue;
        }
        // A root gate is derived by `prepush` from package.json; an undeclared one is R2's finding.
        if (asRoot) continue;
        if (command in ciOnly.commands) continue;
        const runForm = /^pnpm run (check:\S+)$/.exec(command);
        problems.push(
          `.github/workflows/ci.yml line ${line}: job ${job.name} runs \`${command}\`, which ` +
            'scripts/prepush.sh does not (R9).\n' +
            (runForm
              ? `      \`pnpm run ${runForm[1]}\` is not matched as \`pnpm ${runForm[1]}\`; write the ` +
                'short form.\n'
              : '') +
            '      Two remedies: make it a root check:* script so prepush derives it, or add it to ' +
            'scripts/ci-roster.json ciOnly.commands with the reason a contributor need not run it.',
        );
      }
      if (commands === 0) {
        problems.push(
          `.github/workflows/ci.yml: checked job ${job.name} has no \`run:\` command this gate can ` +
            'read. List it under ciOnly.jobs with a reason if it is deliberately not prepush work (R13).',
        );
      }
    }
    if (checkedJobs === 0) {
      problems.push(
        'every job in ci.yml is listed under ciOnly.jobs, so nothing is checked (R13).',
      );
    }
    for (const entry of Object.keys(ciOnly.commands)) {
      if (prepushStages.has(entry)) {
        problems.push(
          `scripts/ci-roster.json lists \`${entry}\` under ciOnly.commands, and ` +
            'scripts/prepush.sh runs it. One of the two is wrong; delete the entry (R12).',
        );
        continue;
      }
      if (checkedCommands.has(entry)) continue;
      problems.push(
        `scripts/ci-roster.json lists \`${entry}\` under ciOnly.commands, and no checked CI job ` +
          'runs it. Delete the entry: a stale reason is one nobody is reading (R11).',
      );
    }
    for (const entry of Object.keys(ciOnly.jobs)) {
      if (jobs.some((j) => j.name === entry)) continue;
      problems.push(
        `scripts/ci-roster.json lists job ${entry} under ciOnly.jobs, and ci.yml has no such job. ` +
          'Delete the entry (R11).',
      );
    }
  }

  return report({
    name: NAME,
    problems,
    // R7 — the population. An empty roster satisfies every loop above perfectly, and a green run
    // could not then tell "every gate is wired" from "there are no gates" (ADR-0093).
    population: declared.length,
    summary:
      `${declared.length} check:* gates, ${declared.filter((g) => inCi.has(g)).length} in CI, ` +
      `${Object.keys(exempt).length} exempt by written reason; ${checkedCommands.size} CI ` +
      `commands in ${checkedJobs} checked job(s), ${Object.keys(ciOnly.commands).length} CI-only ` +
      `by written reason, ${Object.keys(ciOnly.jobs).length} job(s) outside prepush's remit.`,
  });
}

// The CLI. Guarded so importing this module for the suite does not exit the process.
if (
  resolve(process.argv[1] ?? '') === resolve(new URL(SELF, new URL('..', import.meta.url)).pathname)
) {
  process.exit(runGate(new URL('..', import.meta.url).pathname));
}
