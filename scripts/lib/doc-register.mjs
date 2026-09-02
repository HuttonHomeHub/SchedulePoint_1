// @ts-check
/**
 * Shared Markdown-register parsing for the repository's documentation gates (`docs/specs/drift-gates/`).
 *
 * **Every match in this module is anchored at column 0, and that is the whole design.** This
 * repository has now shipped *six* recorded instances of a scan matching its own explanatory prose
 * rather than the thing it was written to check:
 *
 * 1. `docs/TECH_DEBT.md` #219's own classifier matched the word "closed" inside a row explaining
 *    that a *neighbouring* row "will otherwise read as closed when it is half closed".
 * 2. `reset-fills.structural.test.ts` matched the docblock explaining why a treatment must not use
 *    `bg-card`.
 * 3. The ADR-0097 weight ratchet counted `font-medium` inside its own docblocks, so writing down
 *    reasoning pushed the gate towards failing.
 * 4. The sizing ratchet scanned raw text, so *documenting* an arbitrary value counted as using one.
 * 5. `typeface-reach.structural.test.ts`'s doc check matched its own correction notes.
 * 6. **Live today**: an unanchored `grep` for `**Status:**` in `docs/TECH_DEBT.md` returns 14 where
 *    the truth is 13, because row #219 — the row that *asks for* this gate — quotes the string.
 *
 * So: fenced blocks are stripped before anything is read, fields are recognised only at column 0,
 * and headings are matched on the heading line alone. A gate that cannot tell a document's subject
 * from its commentary is worse than no gate, because it is trusted.
 *
 * Node built-ins only, by design — a documentation gate that needs an install is a gate that gets
 * skipped.
 */

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, resolved from this file rather than from `process.cwd()`. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/** Exported so a gate's subprocesses run against the same tree its documents were read from. */
export const REPO_ROOT = ROOT;

/**
 * Read a repository document as text, by a path **relative to the repository root** — never to the
 * caller's working directory.
 *
 * This is the shape `check-counts.mjs` and `check-doc-links.mjs` already use, and it is not
 * housekeeping: `prepush.sh` exists because the same ten gates run from `apps/web` produced ten
 * "command not found" failures indistinguishable from ten real ones. A relative read is the quieter
 * version of that — run from the wrong directory it does not fail, it reads a *different file*, or
 * a stale copy, and reports confidently about it. Proven while testing this module: run from a
 * scratch directory holding a copy of `docs/RECONCILE.md`, the gate read the copy.
 */
export function readRepoDoc(path) {
  return readFileSync(resolve(ROOT, path), 'utf8');
}

/**
 * Remove fenced code blocks, replacing each line with an empty one so **line numbers survive**.
 *
 * A finding that cannot say which line it is about sends the reader to grep, and the whole point of
 * these gates is to be cheaper than reading. Handles ``` and ~~~, fences longer than three
 * characters, and info strings. An unterminated fence swallows the rest of the document — which is
 * correct and deliberate: that is what a Markdown renderer does, so a gate that disagreed would
 * report on text no reader ever sees.
 */
export function stripFences(md) {
  const out = [];
  /** @type {string | null} */
  let closing = null;
  for (const line of md.split('\n')) {
    if (closing === null) {
      const open = /^(\s{0,3})(`{3,}|~{3,})/.exec(line);
      if (open) {
        closing = open[2][0].repeat(open[2].length);
        out.push('');
        continue;
      }
      out.push(line);
    } else {
      // A closing fence is the same character, at least as long, and carries no info string.
      const close = new RegExp(`^\\s{0,3}${closing[0]}{${closing.length},}\\s*$`).test(line);
      out.push('');
      if (close) closing = null;
    }
  }
  return out.join('\n');
}

/**
 * Split a document into sections at a given heading level.
 *
 * Returns `{ heading, body, line }` with **1-based** line numbers, so a finding can cite
 * `file:line` the way every other tool in this repository does. Fences are stripped first, so a
 * `## ` inside a code block is not a section — that is not hypothetical, the register holds 16
 * fenced blocks.
 *
 * **A section ends at the next heading of the same level OR SHALLOWER** (`docs/TECH_DEBT.md`
 * #231). It used to end only at the same level, so a `###` row followed by `##` headings ran
 * past every one of them to the next `###` and picked up whatever fields it met on the way.
 * That is not a hypothetical either: `#117` carried no `**Status:**` line at all while
 * `check:debt-status` reported "71 with a status, 0 without", because its body ran 1,115 lines
 * and read `#118`'s.
 *
 * The change makes a **shallower** heading significant to a deeper section for the first time,
 * and this repository's documents contain shell comments beginning `# ` — five in
 * `docs/RECONCILE.md` alone. Those are inside fenced blocks, so `stripFences` above already
 * blanks them and the hazard is covered. **That cover is load-bearing rather than incidental**,
 * which is why `doc-register.test.mjs` pins both halves: a `# ` inside a fence ends nothing, and
 * a `# ` outside one ends a `##` section. Without those cases the dependency is invisible and
 * the next person to touch `stripFences` breaks this silently.
 */
export function sections(md, level = 2) {
  const marker = '#'.repeat(level);
  const lines = stripFences(md).split('\n');
  const found = [];
  const boundaries = [];
  for (let i = 0; i < lines.length; i += 1) {
    // Column 0 only. An indented heading is not a heading, and a `##` mid-sentence never was one.
    const depth = /^(#{1,6}) /.exec(lines[i])?.[1].length;
    if (depth === undefined) continue;
    // 0-based, and it is the index of the boundary heading itself — `slice` excludes it, so a
    // body never keeps the heading that ends it. The first version pushed `i + 1` here and every
    // body carried its own terminator; the fixture case below caught it, which is why it exists.
    if (depth <= level) boundaries.push(i);
    if (lines[i].startsWith(`${marker} `)) {
      found.push({ heading: lines[i].slice(marker.length + 1).trim(), line: i + 1, start: i + 1 });
    }
  }
  return found.map((s) => ({
    heading: s.heading,
    line: s.line,
    body: lines.slice(s.start, boundaries.find((b) => b >= s.start) ?? lines.length).join('\n'),
  }));
}

/**
 * The value of a `**Field:**` line, or `null`.
 *
 * **Column 0, and the field must open the line — that anchor is the ONLY guard.** `#219` contains
 * the literal `**Status:**` inside a sentence asking for this gate; an unanchored search finds it
 * and reports a status the row does not have. The anchor already excludes it, because prose does
 * not begin a line with the field.
 *
 * **Inline code spans are deliberately NOT stripped**, and this docblock claimed for some time that
 * they were — a false sentence in the shared module, three lines above the comment recording why
 * (`docs/TECH_DEBT.md` #231's epic found it). Stripping was tried and removed as actively wrong:
 * see the comment inside the loop below. Do not "restore" it.
 */
export function fieldValue(body, field) {
  for (const raw of body.split('\n')) {
    // **The `^` anchor is the whole guard, and a broader one was actively wrong.**
    // This first skipped any line containing a backtick, reasoning that a row quoting the field is
    // discussing it rather than declaring it. That over-matched: it ate two REAL declarations whose
    // value happens to cite a symbol (`**Status:** ... (ADR-0083 M7 — \`scheduleRefusal\`)`), and the
    // gate then under-reported the register by two rows. The prose case it was defending against —
    // #219's "a \`**Status:**\` line on every row" — does not begin at column 0, so the anchor
    // already excludes it. Verified by fixture: `Row two` stays null with this guard gone.
    const m = new RegExp(`^\\*\\*${field}:\\*\\*\\s*(.*)$`).exec(raw);
    if (m) return m[1].trim();
  }
  return null;
}

/**
 * The rows of the first Markdown table under `headingText`, as arrays of trimmed cells.
 *
 * Cells are read **by index**, never by matching text against the whole row — a date in a prose
 * column is a date, and `docs/RECONCILE.md`'s findings column is full of them. The separator row is
 * dropped; a row is anything starting with `|` at column 0.
 */
export function tableRows(md, headingText) {
  const section =
    sections(md, 2).find((s) => s.heading.includes(headingText)) ??
    sections(md, 3).find((s) => s.heading.includes(headingText));
  if (!section) return [];
  const rows = [];
  for (const line of section.body.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line
      .split('|')
      .slice(1, -1)
      .map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator
    rows.push(cells);
  }
  return rows;
}

/**
 * The exit-code convention, owned here so two gates cannot drift on it.
 *
 * - **0** — clean.
 * - **1** — blocking. *The remedy is an edit to the file that failed.*
 * - **2** — advisory. *The remedy is somebody's judgement.*
 *
 * That discriminator is the whole rule, and it is written down because the tempting alternative —
 * "how important is it?" — has no stable answer and would let a future gate return 2 for something
 * that ought to block.
 *
 * **It refuses to report success over an empty population.** A gate whose subject vanished reports
 * green and reads as "checked", which is this repository's most-recorded failure: ADR-0108's census
 * passed its "nothing unclassified" assertion because its glob matched zero files, and ADR-0093
 * records a suite that could not distinguish "the duplicate is gone" from "the capability is gone".
 * Passing `population: 0` is therefore a *blocking* finding, not a pass.
 *
 * **`advisory: true` lowers every blocking exit to 2 and is the only way a gate is allowed to
 * promise it never blocks.** Not because an advisory gate's findings matter less — the empty
 * population above still prints, and still refuses to say OK — but because a promise kept by each
 * branch remembering to keep it is not kept. Note the cost, since `prepush.sh` is the only consumer
 * that reads 2 as WARN: **pnpm itself treats exit 2 as failure**, so `pnpm check:reconcile-due` run
 * directly reports a failed script. That is a fair reading of "this needs attention" and a poor
 * reading of "this does not block"; the convention lives inside the pre-push runner.
 */
export function report({
  name,
  problems = [],
  warnings = [],
  population = null,
  summary = '',
  advisory = false,
}) {
  const say = (s) => process.stdout.write(`${s}\n`);
  // **`advisory` is enforced here, once, rather than at every return.** A gate whose contract is
  // "this never blocks" cannot keep that promise by having each of its own branches remember to —
  // `check:reconcile-due` had four exits and one of them (an uncaught `git` failure) returned 1,
  // reported by `prepush` as FAIL, which is precisely the outcome its docblock promised was
  // impossible. Declaring the gate advisory makes the floor structural: this function has no path
  // that returns 1 for it.
  const blocking = advisory ? 2 : 1;

  // **Findings print BEFORE the population verdict, and printing them after was a live defect.**
  // The first version returned on `population === 0` above this loop, so a caller that had composed
  // a precise problem message for exactly that case — "the parse is broken, or the table is" —
  // watched it discarded in favour of the generic line. The caller knows why its population is
  // empty; this function only knows that it is.
  for (const p of problems) say(`  ✗ ${p}`);
  for (const w of warnings) say(`  ⚠ ${w}`);

  if (population === 0) {
    say(
      `${name}: ${advisory ? 'WARN' : 'FAIL'} — the population is empty, so this run checked nothing.`,
    );
    say('  A gate with no subject reports green and reads as "checked". Refusing to.');
    return blocking;
  }
  if (problems.length > 0) {
    say(
      `${name}: ${advisory ? 'WARN' : 'FAIL'} — ${problems.length} finding(s). ${summary}`.trimEnd(),
    );
    return blocking;
  }
  if (warnings.length > 0) {
    say(`${name}: WARN — ${warnings.length} finding(s). ${summary}`.trimEnd());
    return 2;
  }
  say(`${name}: OK. ${summary}`.trimEnd());
  return 0;
}
