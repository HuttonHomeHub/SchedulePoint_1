# ADR-0076: Wrong claims are a defect class, and three of them are computable

- **Status:** **Accepted** — 2026-08-05
- **Date:** 2026-08-05
- **Deciders:** Product owner (asked for process changes that stop the recurrence); this pass
  (classification, gates)
- **Extends:** ADR-0058 (drift control — computed gates and the reconciliation pass)

## Context

ADR-0058 established that documentation drift is a defect class with its own gates, and it was
written after four reconciliation passes found the same shape repeatedly. It closed what it could
compute — doc links, coverage ratchets, schema drift, the token-contrast matrix — and sent the rest
to a periodic human pass under the rule _verify the claim; do not trust the document_.

**That rule has now failed three times in one working session, in three distinguishable ways**, and
the failures are the reason this ADR exists. They are recorded here as classes rather than as
incidents, because the third one in particular is not a documentation problem at all.

### Class 1 — a count nobody re-derived

`CLAUDE.md`'s stage banner states six figures: API modules, Prisma models, migrations, web source
files, flag-scoped Playwright suites, ADRs. At the 2026-08-04 reconciliation pass **every one was
wrong**. The pass corrected them and added a sentence telling the reader to re-run the commands in
`docs/RECONCILE.md` §1 if the recount date was not today's.

By 2026-08-05 — one day later — the ADR count was wrong again, and so were four of the other five.

The instruction was correct advice that cannot work. A reader who trusts the number does not check
the date; a reader who checks the date has already been misled once and is now doing the work by
hand. ADR-0058's own rule says what to do here and the pass did not do it: a directory listing is
the most computable claim in the repository.

### Class 2 — a claim about a dependency's internals

SchedulePoint's docs and docblocks carry **34 distinct file-and-line citations** into `better-auth`
and `better-call`, and they are load-bearing rather than decorative:

- ADR-0074 hashes verification identifiers because `processIdentifier` returns the identifier
  unchanged with no `verification` key configured.
- ADR-0075 rejects an abort-on-send-failure design because sign-up answers a duplicate address with
  a synthetic 200 and no send.
- The mail adapter swallows a verification-send error because `/send-verification-email` ends its
  deliberately-uniform block with `if (error) throw error`.

**None of that code is in this repository, and nothing here was watching it.** A Dependabot minor
bump moves every one of those lines. The prose keeps reading as authoritative, the line numbers
keep looking precise, and the decisions resting on them are resting on nothing.

That is not a hypothetical: while writing the correction described in Class 3, this pass wrote
`better-auth@1.3.27` at `dist/api/create-context.mjs` **from memory**. The installed version is
`1.6.25` and the path is `dist/context/create-context.mjs`. The claim was three lines from the
grep that disproved it.

### Class 3 — a claim the author asserted and never checked

This is the one that is not about documentation, and it happened twice in the same milestone.

ADR-0075's brief asserted that "sign-up has no enumeration concern, so a design change is available
there". It was **wrong**, and it had already been repeated in a test docblock, a commit message and
a `TECH_DEBT` row before anybody opened `sign-up.mjs`. It was caught only because the analyst had
been instructed to verify claims rather than trust documents — including the ones in its own brief.
That is recorded in ADR-0075 §"A note on how this was decided".

One milestone later, the **same ADR's own risk table** said mail delivery has **"no request-path
cost"**. It does: `runInBackgroundOrAwait` awaits unless a background handler is configured, none
is configured, and `InvitationsService` awaits its send in the handler outright. Four endpoints sat
on a live SMTP round trip bounded only by nodemailer's ten-minute socket default. The claim was
false when written, in a risk table, in the document whose closing section is about exactly this
failure.

**The distinguishing feature of Class 3 is that it is not stale prose left by someone long gone. It
is a fresh assertion written the same day by the person applying the rule.** No amount of
periodicity reaches it — a reconciliation pass three months later re-reads a document, and a
plausible false statement re-reads as true.

**A third instance arrived the day after this ADR was accepted, and it is the most instructive of
the three.** ADR-0075's Consequences open "An operator **can** write an alert that fires", and the
release note built on that told the product owner to "update your mail alerting". There is no
alerting: no log shipping, no evaluator, and `docs/OBSERVABILITY.md:80` says so in its own heading
— "Monitoring & alerting — standard, **not yet implemented**". So the ADR's entire remedy, an
operator-facing signal, reaches a file on the host and no person. That is `docs/TECH_DEBT.md`
**#100**.

Three things about it are worth keeping:

- **It was found by a reader, not by a gate or a reviewer**, and found by the most ordinary
  question available — _how would I do this?_ Neither computed gate could have caught it: the
  counts were right and the citations were right. The claim was about the world outside the
  repository, which is where this class is hardest.
- **The false step was a modal verb.** "Can write an alert" is true. It was read, by its own
  author one message later, as "has an alert" — so the rule in §3 below needs to bite on
  _capability_ claims too, not only on flat assertions of fact. A sentence that is true of the
  system and false of the deployment is the same defect wearing better grammar.
- It is the second time in two days that a claim survived **because it was about the operator**
  rather than about code. Nothing in the repository models the deployment, so nothing contradicts
  a sentence about it.

## Decision

**Wrong claims are a defect class with three species, and each gets the strongest control its shape
allows.** Two are now computed gates; the third is not computable and gets an explicit process
step instead, honestly labelled as weaker.

### 1. Counts are computed (`pnpm check:counts`)

`scripts/check-counts.mjs` re-derives all six banner figures from the tree and fails if the prose
disagrees. Wired into CI beside the existing checks.

Deliberately narrow: it checks **counts**, not prose. "Substantially built" is a judgement and
stays a judgement. What it forbids is a number nobody re-derived. It also fails if the banner
sentence stops stating a figure at all, with a message saying to update the script rather than
delete the claim — otherwise the cheapest way to make it pass is to remove the number.

**Twice widened, both times because it passed while a copy of the same number was wrong.** The 2026-08-09
reconciliation pass added `README.md` (the front door said 73 ADRs against 85) and deleted two
internal copies that had no reason to hold a figure they did not own. Later the same day
`docs/ARCHITECTURE.md` was found saying **20 feature modules** against 22 — by reading it, not by
the gate, because it was not scanned and because its wording ("feature modules") differed from the
banner's ("API modules"). So the entries now carry **aliases**, and each pattern is matched against
**every occurrence** in a document rather than the first: `CLAUDE.md` states the module count twice,
and checking only the first left the second free to rot behind a green check — which is the exact
failure this ADR exists to remove, sitting inside its own gate. Both cases were verified red before
the fix landed.

### 2. Dependency-internal claims are registered and pinned (`pnpm check:claims`)

`scripts/dependency-claims.json` records every citation: package, path, line range, a short
**anchor** taken from the code that was actually read, and which files cite it.
`scripts/check-claims.mjs` enforces three things:

- **Version pin** — every claim was verified against a specific installed version. A moved version
  fails the whole set for that package, and the message says to re-read each location, because
  bumping the recorded version without reading turns the gate into a rubber stamp.
- **Anchor** — the recorded snippet must still be within the cited range. This catches a citation
  that was wrong _when written_, which a version pin alone cannot.
- **Completeness** — every `<file>.mjs:<line>` reference in `docs/` and the app sources must be in
  the register. A new citation cannot be added without recording what proves it.

Seeded with all 34 existing citations. **All 34 were checked against the installed source while
seeding, and all 34 are accurate** — which is worth stating, because the value of the gate is
prospective and it would be easy to read its introduction as implying they were not.

What it deliberately does **not** check: whether the prose _around_ the citation reads the code
correctly. A human wrote "this function awaits" beside a line, and only a human can say whether
that reading is right. The guarantee is narrower and still worth having: the line is where we said
it was, in the version we said we read it in.

#### Amendment, 2026-09-02 — the extension class is ONE list, and there is a third ownership category

_(`docs/TECH_DEBT.md` #240; the record is `docs/specs/claims-citation-scan/`.)_

Completeness above is written as "every `<file>.mjs:<line>` reference", and that is what shipped: both
recognisers ended `\.m?js`, spelled separately from the own-file exclusion's
`git ls-files '*.js' '*.mjs' '*.cjs'`. So **the matcher and the exclusion disagreed about what
JavaScript is** — it was never only a CSS hole — and a citation the matcher could not see was
invisible in **both** directions: never demanded when unregistered, and, if registered anyway,
reported as uncited and suggested for deletion. Both halves failed towards green, which is why the
gate never went red on it in four weeks.

Three things are decided here rather than left as an implementation detail.

**What counts as a citable file is one constant.** `CITED_EXTENSIONS` in
`scripts/lib/citation-patterns.mjs` feeds both recognisers _and_ the `git ls-files` arguments, and
`scripts/lib/citation-patterns.test.mjs` — chained into `check:claims`, so it runs first — asserts
the **derivation** rather than the values, which is the only form of the assertion that survives the
next admission. Admitting an extension takes three things: a dependency in this tree ships files with
it, a citation exists or is imminent, and the first-run cost has been measured. `.ts`/`.tsx` and
`.json` are refused with reasons recorded beside the constant.

**Widening one half alone is worse than leaving the hole**, and that is a measurement rather than a
judgement: patterns alone produces **87 findings on the first run**, nearly all this repository's own
stylesheets, because the exclusion cannot list a file class it does not know about. That is
ADR-0058's fails-on-day-one gate, which gets deleted rather than fixed. Widened together it produces
four, and all four were real — including `useBlocker.d.ts:35`, which ADR-0108's design calls its
single most consequential claim and which had been unregistered the whole time while its seven
`useBlocker.js` siblings were registered, purely because those end `.js`.

**A cited file has three possible owners, not two.** A dependency's (register it), ours (excluded —
no version to pin and nothing to rot), or **neither**: `FOREIGN_UNVERIFIABLE`, which today holds one
name, the previous Flask application's `auth.css`. No installed package resolves it and `git ls-files`
will never list it, so no register entry for it can exist — yet three of its line ranges are
load-bearing evidence in ADR-0077 §9.3 and `docs/DESIGN_SYSTEM.md`. Its admission rule is stated so it
cannot become a bin for citations nobody wanted to register: **no installed package can resolve it,
AND it is not in `git ls-files`.** Anything failing either half is a claim, and claims go in the
register.

What the amendment does **not** buy is the `ref`-string weakness recorded as `docs/TECH_DEBT.md` #181,
and this widening supplied a fresh illustration of it: `lucide-react.d.ts:342` still holds, at the
same line, across five minor versions — by coincidence, not by anything checking. The anchor is what
would catch that drift; the ref cannot.

### 3. Class 3 gets a process step, and is labelled as the weak one

There is no gate for "the author asserted something and never checked". The claim is prose, it is
about this repository's own behaviour, and it is _plausible_ — which is precisely why review does
not catch it.

The rule, added to `CLAUDE.md` §19 and `docs/PROCESS.md`:

> **A claim that decides something must carry its evidence.** When a spec, ADR, plan or risk table
> asserts a fact about behaviour — a cost, a guarantee, a failure mode, "no oracle here", "not on
> the request path" — the artefact names what was run or read to establish it. Not a citation to
> another document: the command, the file, or the test.
>
> **The brief is not evidence.** A claim inherited from the task that started the work gets checked
> like any other. Both Class 3 failures above entered through a brief.

This is deliberately about the **decision-bearing** claims and not every sentence. A rule that
applies everywhere is followed nowhere, and the two failures above were both in the small set of
statements that changed what got built.

## Consequences

- Two more CI steps. Both are pure filesystem reads; neither needs a database, a network or
  credentials, and they run in milliseconds.
- **A Dependabot bump of `better-auth` or `better-call` now fails CI**, and that is the intended
  cost rather than a side effect. The bump is exactly the moment the citations need re-reading, and
  the alternative is that nobody ever does.
- The claims register is a **new artefact to maintain**. It is kept honest by the completeness
  check rather than by discipline, and the gate warns (without failing) about registered claims
  nobody cites any more, since dead weight is what makes a register stop being read.
- Class 3 remains open in the sense that matters: it is mitigated by a rule, and rules are what
  ADR-0058 already showed to be insufficient on their own. This ADR does not pretend otherwise.
  What has changed is that the rule now names the specific failure — an unchecked assertion in a
  decision-bearing document — rather than the general exhortation that produced two of them.
- The CPM engine is not imported, no migration runs, and no product behaviour changes.

## A note on this ADR's own subject matter

Three things in this document were checked rather than asserted while writing it, and two of them
came back different from the first draft:

- The `better-auth` version and path (Class 2's own example) — wrong from memory, corrected by
  `find` and `grep`.
- `/request-password-reset`'s rate limit, cited in `TECH_DEBT` #99 as "3 per 10 s" from the
  sign-in rule. It is **3 per 60 s**, its own rule, and it is `enabled: options.isProduction`.
- That all 34 registered citations resolve to on-topic code — read, not assumed, because the gate's
  first run would otherwise have baked in whatever was there.

## References

- Extends ADR-0058 (drift control). Supersedes nothing.
- Prompted by ADR-0074 and ADR-0075, whose §"A note on how this was decided" is Class 3's first
  recorded instance and whose risk table is its second.
- Gates: `scripts/check-counts.mjs`, `scripts/check-claims.mjs`,
  `scripts/dependency-claims.json`.
