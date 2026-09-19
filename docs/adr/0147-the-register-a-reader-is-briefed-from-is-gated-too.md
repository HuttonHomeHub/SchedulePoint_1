# ADR-0147 — The register a reader is briefed from is gated too

- **Status:** Accepted
- **Date:** 2026-09-19
- **Supersedes:** nothing
- **Amends:** ADR-0110 (D6 gated the ADR index; this extends the same rule to `CLAUDE.md` §16)
- **Spec:** [`docs/specs/adr-register-coverage/`](../specs/adr-register-coverage/)

## Context

`docs/TECH_DEBT.md` #291 records **ten instances** of one thing: an ADR that is Accepted, filed in
`docs/adr/`, listed in `docs/adr/README.md` and cited by `docs/ROADMAP.md` — and **absent from
`CLAUDE.md` §16**, with `pnpm prepush` green throughout. ADR-0132, ADR-0135, ADR-0049, ADR-0122,
ADR-0144, ADR-0145 and ADR-0146 each went that way. Every repair was by hand. Three were found by a
person doing the comparison manually, one by a specialist review, one by somebody who happened to
open the file for an unrelated reason. **Not one was found by a gate.**

The pattern is stable enough to state as a mechanism rather than a coincidence: an ADR filed at the
end of an epic reaches the two documents that **fail loudly** and misses the one that does not. §16
is not a nice-to-have index — it is the register every human and every agent is briefed from, so an
ADR absent from it is invisible to the audience that matters most, while remaining perfectly
present everywhere a tool looks.

ADR-0110 D6 met this exact shape one document along and wrote the rule down: _a rule repaired by
hand and left ungated recurs at the next opportunity_. It then gated `docs/adr/README.md` — the
index a reader rarely opens — and not §16, because widening a shared gate is an ADR-0105 trigger
and wanted its own spec. That deferral was correct twice. This discharges it.

## Decision

### D1 — `check:adr-coverage` reads three registers, not two

The gate keeps its existing subject (`docs/ROADMAP.md` coverage, the index in both directions, dead
exemptions) and gains seven assertions over `CLAUDE.md` §16: an ADR with no entry (**A1**), an entry
naming no file (**A2**), a duplicate (**A3**), an unlocatable or empty section (**A4**), the
control (**A5**), a non-canonical entry (**A6**), and the exemption boundary (**A7**).

**It extends the existing script rather than adding a gate**, which is what keeps `ci-roster.json`
and `check:ci-roster` out of the blast radius: no `check:*` key is added, and `check:adr-coverage`
already has its CI step.

### D2 — A1 is an entry parser, never a substring search

`ADR-\d{4}` occurs **750 times** in `CLAUDE.md` against 146 entries, because entries cite one
another constantly. So `claudeMd.includes('ADR-0122')` is satisfied by prose inside a **different**
ADR's entry — which is not a hypothesis but the recorded mechanism by which ADR-0049 and ADR-0122
were "present" while being absent from the register, and were correctly counted as missing.

A §16 entry is therefore defined explicitly and testably: **a list item at column 0 whose first
content is a bolded id**, `^- \*\*ADR-(\d{4})\*\*`. Measured: 146 of 146 entries take exactly that
form, and no line anywhere in the file takes an indented or `*`-marker variant. The status
parenthetical most entries carry is deliberately **not** required, because ADR-0001 through
ADR-0005 carry none and a rule that fails on day one against correct entries gets deleted rather
than fixed (ADR-0058).

### D3 — Find generously, refuse strictly, and keep them separate passes

ADR-0124 D1's rule, applied literally. A generous pass (`^\s*[-*]\s+\*{0,2}ADR-(\d{4})`) decides
whether an ADR is **present**; the canonical form decides whether it is **well formed**. So a
reformatted entry produces one actionable A6 — "write it at column 0 in the canonical form" —
rather than a false A1 saying the ADR is missing.

On today's estate the two passes agree exactly: both find 146, so the split buys **nothing now**.
It is built anyway, because the alternative on the day somebody reformats §16 is 146 findings
claiming every ADR is missing from a file where every ADR is present, which is precisely how a gate
gets deleted rather than fixed.

### D4 — The control measures a different quantity by a different method

**A5 is the assertion this decision is most likely to get wrong, and ADR-0120 records exactly how.**
That ADR's A9 was written to answer "did we read less than we think?" and compared heading counts
against heading counts — both sides sharing one blind spot, so it could only ever agree with itself,
and it passed through a red run, a repair pass and an arming while reading only 88 of 119 rows.

So A5 does not re-count §16 with the same parser. It scans the **whole document** for the canonical
bullet, **without calling `sections()` at all**, and requires that set to equal the in-section set.
Its docblock states what it is and is not: it catches an entry that has escaped the section, and a
section whose bounds have moved (`docs/TECH_DEBT.md` #231's defect, where a section ran 1,115 lines
past its end and read its neighbour's fields). It does **not** catch the section being parsed too
generously — that is the suite's job, via the fixture reproducing the ADR-0049/0122 shape.

### D5 — §16 has no exemptions at all, and A7 is what makes that a checked claim

`scripts/adr-coverage.json` carries **43** roadmap exemptions, and **17 of them justify themselves
by pointing at §16** ("CLAUDE.md §16 is the register for these"). For that slice, the §16 entry is
the **only** coverage claim this repository makes about the ADR. An exemption that also suppressed a
§16 finding would therefore let that claim be verified by citing itself.

`registerFindings` is not given the exemption map, so suppression is not something it can do — the
guarantee is structural before it is tested. A7 pins it anyway, because the next person to thread
`exempt` in for a good reason will not know that.

### D6 — Blocking, not advisory

ADR-0120 D2's rule: exit 1 when the remedy is an edit to the file that failed, exit 2 when the
remedy is somebody's judgement. Writing a missing bullet is the first. Two further facts settle it
rather than leaving it to taste: **`advisory` is per-gate, not per-assertion**
(`scripts/lib/doc-register.mjs`), so declaring this gate advisory would downgrade the roadmap and
index assertions that have blocked since ADR-0110 D6; and the `warnings` channel returns **2
unconditionally**, which under `prepush.sh`'s inverted default blocks anyway, for a reason nobody
could see. The gate pushes no warnings, and a structural test says so.

### D7 — Checked, not generated

The tempting alternative is to generate §16 from the ADR files. It is refused, and the decisive
halves are measurable rather than aesthetic. §16 is **deliberately not in numerical order** —
ADR-0057 sits after ADR-0146, and ADR-0085/0086/0087 sit between ADR-0103 and ADR-0106 — so a
generator must impose an order and reflow ~4,900 lines, destroying `git blame` for the register. And
several entries are the best account of a decision **anywhere in this repository**, with no field in
the ADR to generate them from.

The measured defect is **absence**, not inaccuracy. This gate closes absence and says so: it cannot
tell a placeholder entry from a real one, and a §16 entry that is present but wrong stays a human's
problem.

## Consequences

- **`docs/TECH_DEBT.md` #291 closes**, and with it the standing manual step in `docs/RECONCILE.md`
  that asked a person to compare `docs/adr/*.md` against §16 by hand. That step had been performed
  correctly and had still missed two ADRs on 2026-09-10.
- **This ADR's own §16 entry is the gate's first real exercise**, which is why M2 armed before M3
  filed it.
- **The gate found a defect on the way that nobody had reported.** Its R1 branch tested
  `reason !== undefined`, so `"0147": ""` exempted an ADR from roadmap coverage while recording
  nothing about why. It is now R5, with its own finding rather than falling through to R1, because
  "your exemption is empty" and "this ADR is not in the roadmap" are different repairs. ADR-0136
  records the licence gate's identical blank-reason rule having no test; here the rule did not
  exist. It was found by a **pinned positive case** (ADR-0093) rather than by a failure.
- **Two more defects closed with the restructure.** Every loop in the gate was `for (… of adrs)`, so
  an empty roster printed `ADR coverage OK (0 of 0 …)` and exited 0 — a green gate that had checked
  nothing, inside the one register gate whose five siblings all use `report()`'s population refusal.
  And it was the **only** register gate with no `.test.mjs` sibling, so none of its three shipped
  assertions had ever been verified red (ADR-0110 D5).
- **The plan's before/after oracle could not be used, and the departure is recorded rather than
  glossed.** M1-T1 asked for the suite to be written against today's gate and to pass unedited
  through the restructure. That was impossible: the gate read a module-scope `root` and called
  `process.exit` inline, so it could not be pointed at a fixture — which is the same fact that had
  kept it untested. The oracle is replaced by the weaker but real one of a named mutation per case.
- **Two mutations taught something worth keeping.** The first A7 mutation filtered `adrs` at the
  call site: it broke R1-negative, R2 and the real-estate control and said **nothing** about the
  assertion it was aimed at — a mutation that breaks its neighbours has not tested its subject. And
  the fixture helper originally withheld both the roadmap mention and the index row, so R1's case
  reported `['R1', 'R3a']` and would have been satisfied by a gate that had lost R1 entirely: a
  helper that fires two assertions at once cannot tell you which one works.
- **The arming sequence is adapted, and the adaptation is stated.** ADR-0120 D5's order — report
  only, sweep, arm, watch it fail — assumes a dirty estate. This one is clean in both directions
  (146 files, 146 entries, no orphans, no duplicates), so a report-only milestone would have
  reported zero findings and proved nothing. The red run is produced by deliberate **mutation** and
  committed labelled as such, and the clean baseline is committed beside it, because two hand
  comparisons have reported clean and been wrong.
- **What it costs:** 66 / 62 / 65 ms over three runs, reading ~5,900 more lines. `pnpm prepush` is
  dominated by lint, typecheck and unit tests; this is not a measurable part of it.
- **Nothing about the running application changes.** The CPM engine is not imported, no migration
  runs and `apps/` contributes zero files to the diff.
