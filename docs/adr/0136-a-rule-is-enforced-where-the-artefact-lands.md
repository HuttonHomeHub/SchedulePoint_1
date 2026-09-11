# ADR-0136: A rule is enforced where the artefact lands, and the roster is derived

- **Status:** **Accepted** — 2026-09-11
- **Date:** 2026-09-11
- **Deciders:** product owner (CQ-1 to CQ-4, all four defaults; "drive M3 to M5 to completion");
  this pass (the four gates' shapes, and every measurement that changed one)
- **Extends:** ADR-0058 (replace vigilance with something computed), ADR-0093 (a census needs a
  pinned positive case), ADR-0105 (a shared gate is a full-spec trigger), ADR-0110 D5 (a gate is
  finished when the defect it names has made it fail), ADR-0120 (a documented obligation with no
  computed observer), ADR-0124 (find generously, refuse strictly)
- **Supersedes:** nothing.
- **Spec:** [`docs/specs/delivery-gates/`](../specs/delivery-gates/)

## Context

This repository's strongest habit is that **when a rule matters, it gets a computed gate** — a route
census, a contrast matrix, a claims register, a build contract, a spec-status gate. Four rules were
outside that habit, and they share one shape: **each was stated in prose and enforced nowhere, or
enforced only where enforcement does not happen.**

The second half is the interesting one, and `CLAUDE.md` §9 is its clearest instance. It says
Conventional Commits are "enforced by commitlint (git hook + expected in PR titles)". commitlint
runs in exactly one place — a local `commit-msg` hook — which is bypassable with `--no-verify` and,
more to the point, **sees the wrong messages**. `main` is squash-merged with the pull-request title
as the subject (§8), so the hook validates branch commits that the squash **discards**, and the one
message that survives into `main`'s history is the one nothing checks at all. "Expected in PR
titles" is an expectation with no observer.

The other three were plain absences. There was **no bundle-size budget** — `docs/FRONTEND_QUALITY.md`
published two numbers and admitted in the same paragraph that they were "advisory and unmeasured",
while `apps/web` carries jsPDF, a canvas painter, a Gantt, an interchange parser and a seed
generator. There was **no dependency licence check** at all, over a tree that ships inside two
container images published to a public registry. And `docs/TECH_DEBT.md` **#244** recorded that CI's
gate roster is hand-written while `prepush.sh` derives its own — a condition that had already failed
**twice**, in the same file, for the same reason: `check:advisory-agreement` shipped enforced only
locally, that was fixed by adding a step, and the condition simply **moved** to `check:browser-safe`,
which was fixed the same way a fortnight later. #244 refused to close on either fix, and its own
sentence is the sharpest in the register: _"A row naming its instance rather than its rule decays
into a false negative."_

They are one epic rather than four because **#244's gate is the gate that protects the other
three**. Once the two rosters must agree, a `check:*` script added without a CI step fails loudly —
so the epic's own later milestones structurally cannot repeat the defect its first milestone closes.
That is not a preference about ordering; it is the reason the ordering is not negotiable, and it was
exercised for real (D1 below).

## Decision

### D1 — The two rosters are asserted equal, and an absence needs a written reason

`pnpm check:ci-roster` derives the population from `package.json`'s root `check:*` scripts and from
`.github/workflows/ci.yml` — **parsed as YAML, not scanned as text** — and asserts the two sets
against each other in both directions. A gate that runs nowhere in CI fails; a CI step naming a
script that does not exist fails; and the only way out is an entry in
[`scripts/ci-roster.json`](../../scripts/ci-roster.json) carrying a reason, with the gate's own
message saying in as many words that **"Not yet" is not a reason**.

There is exactly one exemption today — `check:reconcile-due`, which is advisory by product-owner
decision (ADR-0120) and whose presence here is **derived rather than trusted**, because
`check:advisory-agreement` already asserts the advisory set against the code and would fail on an
entry for a gate that is not advisory.

This closes #244 against its **rule** rather than its instance, which is what that row spent two
fixes asking for.

**It was exercised on this epic's own last milestone, which is the point of building it first.**
M4 added `check:licenses` to `package.json` and, in a separate step, to `ci.yml`; between those two
edits the roster gate refused, naming the script. That is a milestone being stopped by the gate the
same epic shipped three commits earlier, and it is recorded here because it is the only evidence
that the sequencing argument was real rather than tidy.

**The gate's own blind spot is in its docblock rather than implied**: its population is root
`check:*` scripts, so a rule enforced by something that is not one — a workflow, a hook, a test — is
invisible to it. M3 then found the narrower version of that: a `check:*` script living in a
**workspace** (`apps/web`, because it needs a production build and making a five-second
`pnpm prepush` wait thirty seconds for one is how a gate gets bypassed). Exempting it would have
blinded the roster to a workspace step naming a genuinely renamed script, so workspace gates are
resolved against their own `package.json` instead.

### D2 — The PR title is validated as the commit subject it becomes, suffix and all

`.github/workflows/pr-title.yml` runs the repository's own `commitlint` against
`"<title> (#<number>)"` — the string GitHub's squash dialog actually produces.

**Checking the bare title would be green over commits it does not cover, and that is measured
rather than argued.** 88 of `main`'s last 100 subjects carry the ` (#N)` suffix, and one of the four
historic failures in that window is **94 characters as a title and 101 as the commit**: legal as
typed, illegal as what it becomes. The real pull-request number is used rather than an allowance for
one, so the string checked is the string that lands.

It is a **separate workflow rather than a job in `ci.yml`**, because it must run on `edited` and
`ci.yml` runs on `push`: a title corrected after a red run would otherwise stay red until somebody
pushed a dummy commit, which teaches people to ignore the check. It uses `pull_request`, never
`pull_request_target`; declares `permissions: {}`; and reads the title from `env:` rather than
interpolating it into a `run:` block, because a pull-request title is attacker-controlled input.

Two blind spots are stated rather than solved: **the release PR is never checked** (Changesets
writes its title, and it is a known-good constant), and **a title edited after the merge queue takes
it** is outside what any `pull_request` event can see.

`chore(deps-dev)` — Dependabot's title for a development update — is admitted to `scope-enum`
(CQ-1(a)) rather than collapsed into `chore(deps)` or exempted. Collapsing loses a distinction
`main`'s history currently records; exempting bot PRs would put a silent skip on exactly the pull
requests nobody reads carefully.

### D3 — The bundle's subject is the initial static entry graph, and the floor is measured

`apps/web/scripts/check-bundle-size.mjs` measures the **entry chunk plus the transitive closure of
its static imports**, gzipped, against a number in
[`apps/web/bundle-budget.json`](../../apps/web/bundle-budget.json). Dynamic imports are excluded and
reported separately: a `jspdf` behind an `await import()` costs the first paint nothing, and counting
it would make the number describe a download nobody performs.

**The quantity was wrong in the document, by 33 kB.** `docs/FRONTEND_QUALITY.md` recorded "the
initial bundle" as the entry **chunk**. The honest first-paint cost is the entry **graph**, and the
difference is the whole point: measured on 2026-09-11 in bytes, the entry chunk is **370,899** and
the graph is **404,744** across three chunks, because the entry statically imports a 33,477-byte
`paint` chunk (and a 368-byte runtime). A budget set against the smaller figure would have been a
budget against a download that does not happen.

**Bytes, because the units were the epic's own drift finding.** `docs/FRONTEND_QUALITY.md`'s
2026-09-11 edit compared its new figure against the one recorded there on 2026-09-10 and said they
were the same measurement. They are not: the earlier figures came from Vite's own build reporter
(kB = 1000 bytes) and the new ones from `bundle-report-plugin.ts` divided by 1024 while labelled
"kB", so the sentence compared two instruments in two units. Gzip level was checked and ruled out —
level 9 moves these assets ~0.2 %, not ~3 % — and `pnpm-lock.yaml` is untouched between the two
dates, so the vendor chunks did not change. **The 33 kB headline survives in either unit** (33,845
bytes; 33.05 KiB) because it is entry-versus-graph from one instrument in one run; only the
cross-instrument sentence was wrong, and it is corrected in place. `bundle-budget.json` was already
in bytes, which is why the gate itself was never affected.

The floor is **measured, not chosen** (ADR-0058). That document's never-measured ~200 kB would have
failed on day one, and a gate that fails on day one gets deleted rather than met. Budget is floor
× 1.05 (CQ-2(a)), with the ratio labelled **in the file** as a judgement rather than a measurement,
and a raise carrying a one-line `raisedBecause` — a budget quietly moved up is one that never says
no.

**The must-stay-lazy assertion could not have fired as first written, and that was found by doing
the thing rather than simulating it.** The plan predicted that a real `import 'jspdf'` at the entry
would trip both the size assertion and the "jsPDF is not in the entry graph" one. Done for real,
only the size one fired: a static import is **inlined by Rollup into the entry chunk**, so no chunk
carries that name and a name-based scan goes quiet at exactly the moment it was written to fire. It
reads the module graph now — `packages` per chunk, from Rollup's own `moduleIds`, which is what a
chunk is made of rather than what it is called.

The reporter is a `generateBundle` hook writing **outside** `dist/`, so it is never served, and
`dist/assets` is byte-identical with it on or off — asserted rather than assumed. It is deliberately
**not** a root `check:*` script (D1's blind spot, stated there).

### D4 — Licences are an allow-list, and the default answer is no

`pnpm check:licenses` reads the whole resolved tree and refuses any package whose licence is not
named in [`scripts/licence-policy.json`](../../scripts/licence-policy.json) with written reasoning.

**An allow-list, never a deny-list.** A deny-list is silent about the licence nobody thought of,
which is precisely the one that matters — so anything the policy does not name, **including a
licence the parser cannot resolve** (a `WITH` exception, a nested mix, a missing `license` field), is
unknown, and unknown fails.

Measured first, because a policy written from instinct is an allow-list shaped to whatever happened
to be installed: **918 resolved packages across 17 distinct identifiers, no copyleft, no UNKNOWN,
and zero packages with a missing `license` field**. So `exempt` ships empty, and the file says in as
many words that this is a measurement rather than an oversight. The spec's E14 figure of 1,112
packages is drift and is not carried forward.

Two of the seventeen are not obviously permissive and are allowed **with their reasoning written
down rather than waved through**. MPL-2.0 (five packages) is file-level weak copyleft: the obligation
attaches to modified MPL files, not to the work that links them, and all five are consumed
unmodified — the entry says plainly that a fork into this repository stops being covered. CC-BY-4.0
is `caniuse-lite`, a build-time dataset whose data does not reach the bundle.

Whole tree, one tier, blocking (CQ-3(a)): not `--prod` only, because a build tool can contaminate
its output, and one tier because `report()`'s advisory flag lowers a gate's **whole** exit code, so
carrying a dev tier as a warning would downgrade the runtime findings with it.

Three blind spots are in the gate's docblock: it reads the **manifest-declared** licence, it sees
packages rather than vendored source, and it says nothing about whether attribution or NOTICE
obligations are actually being met.

### D5 — Every assertion is verified red by a named mutation, and the sweep refuses an unknown population

ADR-0110 D5's rule, applied across the epic: **49 cases in four suites** — 14 for the roster, 17
commitlint fixtures, 6 for the PR-title workflow, 12 for the licence gate — plus the bundle gate's
**7 assertions**, which have no suite of their own and were verified against real production builds
instead (D3's blind spot, and the reason B2 had to be verified twice: once wrongly against a
hand-edited report, then properly against a build). The mutations are not hypothetical: each is a
specific edit to the gate, applied, run, and reverted.

**The sweep itself had to be fixed first, and that is the most transferable thing here.** An earlier
run reported **nine false greens** — every one of them a run that had died loading a reporter that
does not exist in this vitest version, whose non-zero exit the sweep read as "the suite passed".
The guard is that a verdict is refused unless the number of cases that **ran** equals the number the
suite declares. It immediately caught two further miscounts.

Two assertions were then found not to discriminate, both by that sweep rather than by reading:
the licence gate's workspace skip could be widened from `@repo/` to **every scoped package** and stay
green, because the suite's only fixture for it was a `@repo/` name; and the rule that an exemption
with a **blank reason** admits nothing had no test at all, so `exempt: { pkg: '' }` — the shape
somebody reaches for when they want the gate quiet rather than when they have checked — would have
worked. Both are pinned now, and both mutations go red.

### D6 — The gate pass found the epic's own thesis failing on the epic's own first gate

Five specialists over the combined diff. The performance review passed with nothing blocking,
having re-derived every figure from two clean builds — `entryGraph.gzip = 404744` byte-for-byte on
both, all seven assertions live-mutated, and the byte-identity of `dist/assets` with the reporter on
and off confirmed by `sha256sum` rather than taken from the commit message. The other four blocked.

**Three of the five found the same defect independently, and it is D1's own subject: the advisory
cross-check was specified and never built.** D2 of the spec says the advisory set is read out of
`prepush.sh` and never restated, and the shipped gate did not read that file at all — "advisory"
had been folded into the exempt map. Reproduced rather than argued: add `run: pnpm
check:reconcile-due` to `ci.yml` **and** delete its `ci-roster.json` entry — the natural pair of
edits, because an entry reading "need not run in CI" looks redundant the moment it does — and both
`check:ci-roster` and `check:advisory-agreement` report **OK**, while a product-owner decision that
this gate warns and never blocks silently becomes a blocking CI gate. GitHub Actions has no
advisory mode; it treats exit 2 as a failed job. The single-edit version was caught only by
coincidence, because the one advisory gate happened also to hold the one exemption.

**`ci-roster.json`'s own comment claimed the derivation already existed** — "an entry here for a
gate that is NOT advisory fails `check:advisory-agreement` instead" — and it was false: that gate
reads `prepush.sh` and each gate's source, and has never heard of `ci-roster.json`. ADR-0076 Class
3, inside the epic closing that class. The parse is now **shared** rather than copied
(`scripts/lib/advisory-gates.mjs`), because a second copy is the duplication #244 exists to remove
— and it would have been a copy of the weaker version, since that parse carries two hardenings that
each record having shipped wrong. Extracting it revealed that **neither hardening was tested by
anything**: the mutation sweep dropped the comment-strip and narrowed to double quotes and the
roster suite stayed green both times. They are pinned now.

**Two reviews blocked on M3 having no committed tests**, and were right in a way the ADR's own
first draft got wrong: it claimed "25 assertions" verified red, a figure that counted nothing in
particular. Seven of them were verified by hand against real builds with nothing left behind, and
the two helper functions were worse than untested — `staticClosure`'s cycle guard had never been
exercised and **its failure mode is a hang rather than a red test**. The gate is now injectable
(`runGate({ report, budget })`, the shape its three sibling gates already take) with a suite of 13
and a nine-mutation sweep. The suite lives at the repository root because
`apps/web/vitest.config.ts` restricts `include` to `src/**`, so a suite beside the gate would have
run nowhere — found by the same review.

**The security review found the licence gate's workspace skip to be an assumption dressed as an
assertion, and measuring settled it harder than either reading had.** `if (name.startsWith('@repo/'))
continue;` was justified on the ground that those are our own private, unpublished packages —
except `pnpm licenses list --json` reports the **resolved dependency tree** and does not list
workspace packages at all (918 entries, zero of them `@repo/`). So the branch could never fire for
one of ours, and the only thing it could ever have admitted is a package that is **not** ours
wearing our scope: dependency confusion, waved through silently, by the gate whose whole design is
that unknown fails. It is a finding now, not a skip.

**Two more assertions were found not to discriminate, both by a sweep rather than by reading**, and
the second is worth the sentence: the bundle gate's empty-population case asserted only the exit
code, and with no chunks the entry-package set is necessarily empty too, so B2's own refusal
returned 1 whether or not the population check existed. The two cannot be made independent —
packages come from chunks — so the case reads the sentence the refusal prints instead.

Folded besides: the render-blocking **CSS** was computed by the reporter and read by nothing, under
a docblock claiming the gate covered everything the browser parses before it renders (B6 now
asserts it, budget measured the same way as the JS one); the `ci.yml` comment block this epic's own
M4 orphaned from its step, in a file whose load-bearing property is that its comments belong to
their steps; the PR-title workflow's action pins, three major versions behind the rest of the
repository; and the echoed title now has newlines stripped **for the echo only**, because the value
reaching commitlint must still fail if it carries one. Two findings are recorded rather than rushed
(`docs/TECH_DEBT.md` #298), both because they change shared mechanisms and folding a shared-gate
change into an epic's last milestone is what ADR-0105 exists to stop.

## Consequences

**Positive.** Every commit subject on `main` is a valid Conventional Commit because something
checked. The web bundle has a number, and growing it is a visible act with a written reason. The
licence position of the published images is a fact. #244 closes against its rule, so it cannot decay
into a false negative a third time, and every gate added after this epic is covered on the day it is
written rather than a fortnight later.

**Negative, and stated rather than glossed.** The roster gate can only see root `check:*` scripts.
The PR-title workflow cannot see the release PR or a post-merge-queue edit. The bundle budget
measures the static entry graph and therefore says nothing about a route chunk a reader downloads a
moment later. And the licence gate reads manifests: a package whose `license` field disagrees with
its own LICENSE file is reported as its field says, and vendored source is invisible to it. Each of
those is in the relevant gate's own docblock, where somebody debugging it will read it.

**Three GitHub settings are outside this repository and are therefore not enforced by it.** The
`PR title` check must be added to branch protection's required status checks on `main`, and
"Default to PR title for squash merge commits" must be confirmed. Until both are done the workflow
reports and does not block, and the subject it validates is not guaranteed to be the subject that
lands. The third was named by the M5 security review and belongs with them: **"require approval for
first-time contributors"** is the setting that decides whether a fork's pull request runs CI at all
— and a fork's PR can carry its own `commitlint.config.js`, or a lockfile whose install runs a
postinstall script. All three are owner actions, recorded here so "shipped" does not read as
"enforced".

**No product behaviour changes at all.** The CPM engine is not imported, no migration runs, and no
user-facing surface is touched. `apps/api` and `apps/web/src` contribute **zero files** to the
diff: the web half is a build hook, a budget file, a gate and one `vite.config.ts` line.
