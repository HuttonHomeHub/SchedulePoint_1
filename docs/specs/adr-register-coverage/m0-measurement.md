# M0 — the ADR register's state on the day the work starts

**Taken:** 2026-09-19, against `c25b0a29`.
**Why it exists:** every figure in `feature-spec.md` is re-derived here rather than inherited.
`docs/TECH_DEBT.md` #291's own "133 ADR files" was stale inside the commit that wrote it, and the
row annotates that rather than rewriting it — so this document records the command as well as the
answer (CLAUDE.md §19.11).

---

## 1. The estate, both directions (M0-T1)

Measured with one script over `docs/adr/` and `CLAUDE.md`, comparing the two **sets** and not the
two counts — #291 records two hand comparisons that checked one direction and undercounted.

| Quantity                                                         | Measured                    |
| ---------------------------------------------------------------- | --------------------------- |
| Files in `docs/adr/` matching the gate's `^\d{4}-.*\.md$` filter | **146**                     |
| Files that filter excludes                                       | `README.md`, `_template.md` |
| Canonical `- **ADR-NNNN**` bullets in `CLAUDE.md`                | **146**                     |
| Files with no §16 entry                                          | **0**                       |
| §16 entries naming no file                                       | **0**                       |
| Ids appearing more than once                                     | **0**                       |

`## 16. Architectural decisions` is `CLAUDE.md:351`; the next `## ` heading is `:5254`. Every one of
the 146 canonical bullets falls inside that range (first `:355`, last `:5228`), and **zero** fall
outside it. That equality is A5's baseline, and A5 is what notices if it ever stops holding.

**The estate is clean in both directions, and the gate is still absent.** That is the whole finding:
nothing here has been checked by anything, three times running a person has found it clean, and
three times it has drifted again within days.

## 2. The naive-check trap, and the exemption dependency (M0-T2)

Derived by a second scan, independent of §1.

- **`ADR-\d{4}` occurs 750 times in `CLAUDE.md` against 146 entries.** So `includes('ADR-0122')` is
  satisfied by prose inside another entry — which is exactly how ADR-0049 and ADR-0122 came to be
  "present" while being absent from the register, and correctly counted as missing. A presence
  check written the obvious way would sail past the two hardest recorded instances.
  _(The spec predicted ~698 from a reading four hours earlier. 750 is the live figure and the
  difference is this session's own commits — recorded rather than reconciled to the prediction,
  since the prediction was never the thing being measured.)_
- **`scripts/adr-coverage.json` carries 43 exemptions, and 17 of them justify themselves by pointing
  at §16** ("CLAUDE.md §16 is the register for these"). For that slice, the §16 entry is the only
  coverage claim the repository makes about the ADR, and it is the one nothing checks — so the
  roadmap gate's exemptions currently rest on an unverified assertion about another document. A7 is
  what turns that into a checked one.
- **ADR-0049 and ADR-0122 both carry their own canonical bullets today**, added by hand during the
  2026-09-13 sweep. Nothing stops them being lost again.

## 3. A generous pass costs nothing today, and that is why it is worth having

The generous matcher (`^\s*[-*]\s+\*{0,2}ADR-(\d{4})`) finds **146** — identical to the canonical
146, with no spurious matches anywhere in the file. So on today's estate the two passes agree
exactly, and ADR-0124 D1's split (_find generously, refuse strictly_) buys nothing **now**. It is
built anyway, because the day an entry is reformatted the alternative is 146 findings reading
"this ADR is not in the register" against a file where every ADR is present — which is the failure
mode that gets a gate deleted rather than fixed (ADR-0058).

## 4. The mutation-produced red run

See §5, appended after M2-T2. There is no natural red state to commit (spec §4.8), so ADR-0120 D5's
"arm it and watch it fail" has to be adapted: the red run is produced by deliberate mutation and is
labelled as such, and this clean baseline is committed beside it — because two hand comparisons have
reported clean and been wrong.

---

## 5. The mutation-produced red runs (M0-T3, appended after M2-T3)

**These are mutations, not findings. The estate was clean before and after each one.** Every edit
below was applied to a real `CLAUDE.md`, the gate run, and the file restored from a backup.

### Mutation 1 — ADR-0146's bullet deleted from §16

This is `docs/TECH_DEBT.md` #291's defect exactly, reproduced.

```text
  ✗ A1: ADR-0146 has no entry in CLAUDE.md §16.
    §16 is the register every human and every agent is briefed from — an ADR absent from
    it is invisible to the audience that matters most. Add a bullet in the form
    `- **ADR-0146** _(status)_ — …`.
check:adr-coverage: FAIL — 1 finding(s). … 145 of 146 in CLAUDE.md §16.
```

Run under `scripts/prepush.sh` the line reads **`FAIL  check:adr-coverage`**, not `WARN` — which is
the difference between registered and enforced, and the reason `ADVISORY_GATES` is untouched. The
suite's own real-estate control went red alongside it, so both halves noticed.

### Mutation 2 — an entry for an ADR with no file

```text
  ✗ A2: CLAUDE.md:5114 carries an entry for ADR-0999, which has no file in docs/adr/.
check:adr-coverage: FAIL — 1 finding(s). … 147 of 146 in CLAUDE.md §16.
```

The summary's `147 of 146` is worth noticing: the counts are derived from two different populations
and are not constrained to agree, so a reader sees the contradiction as well as the finding.

### Mutation 3 — ADR-0146 entered twice

```text
  ✗ A3: ADR-0146 has 2 entries in CLAUDE.md §16 (lines 5114, 5115). One decision, one entry.
```

A set comparison is structurally blind to this, and the register's ten hand repairs are exactly
where duplicates come from.

## 6. Cost

`node scripts/check-adr-coverage.mjs`: **66 / 62 / 65 ms** over three consecutive runs, reading
~5,900 more lines than before. `pnpm prepush` is dominated by `lint`, `typecheck` and `test`; this
gate is not a measurable part of it.

## 7. What the assertions cost to verify

Every assertion was verified **red against a named mutation** (ADR-0110 D5) — 17 mutations across
two sweeps, each naming the case it broke and each restored afterwards. Two are worth recording:

- **The first A7 mutation did not test A7.** It filtered `adrs` at the call site, which broke
  R1-negative, R2 and the real-estate control and said nothing about the assertion it was aimed at.
  A mutation that breaks its neighbours has not tested its subject. The faithful one takes two
  edits — thread `exempt` into `registerFindings`, then skip exempt ids in the A1 loop — and only
  A7's case goes red under it. The guarantee is structural first: the function is not given the
  exemption map at all.
- **The fixture helper hid a case that could not discriminate.** `bare` originally withheld both
  the roadmap mention and the index row, so R1's fixture reported `['R1', 'R3a']` and would have
  been satisfied by a gate that had lost R1 entirely, as long as it still had R3a. A helper that
  fires two assertions at once cannot tell you which one works.
