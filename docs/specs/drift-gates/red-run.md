# M2-T3 — the red run, against the register as it stands

**Captured 2026-08-30, BEFORE M3 repairs a single row.** That ordering is the milestone:
the evidence of what was wrong has to exist before it is fixed, or the gate's value is a
claim rather than a record (ADR-0110 D5).

> ## ⚠ Every number below is an UNDERCOUNT, and the file is kept that way on purpose
>
> The gate that produced this output read `sections(md, 2)` — level-2 headings only — while
> `docs/TECH_DEBT.md:100-103` states the register's own convention as `### <number>. <title>`,
> **always**, with `##` being drift three rows had picked up. So this run saw _only the drifted
> rows_. Re-measured against the same commit (`a83a3302`) with the corrected parser:
>
> | figure                 | this run reported | truth   |
> | ---------------------- | ----------------- | ------- |
> | numbered detailed rows | 107               | **138** |
> | with a status          | 12                | **14**  |
> | A1 findings            | 95                | **124** |
> | total findings         | 118               | **147** |
>
> **This is not corrected in place, and re-running it would destroy the point.** The file records
> what the gate _reported_ on the day it ran; the gap between that and the truth is the D5 lesson in
> numbers, and it is the only surviving artefact of the defect. See ADR-0120 D5, and the fix in
> `806f4a7f`.

```
check:debt-status — REPORT ONLY (not yet armed; see M4)
107 detailed rows (12 with a status, 95 without), 42 compact-table rows, 24 ledgered, 3 section headings.

  ✗ A1: docs/TECH_DEBT.md:1445 "#106 — `render-model.ts` cannot become "barrel + core model"" has no **Status:** line.
  … 118 findings, summarised below; the full list is reproducible with
  node scripts/check-debt-status.mjs --report
```

## Findings by assertion

| assertion              | count | what it means                                     |
| ---------------------- | ----- | ------------------------------------------------- |
| A1                     | 95    | detailed rows with no column-0 `**Status:**` line |
| A2                     | 5     | a status token outside the four-word vocabulary   |
| A3                     | 17    | a heading annotated CLOSED / RESOLVED / ANSWERED  |
| A4b                    | 1     | a compact row whose number cell is prose          |
| A4, A5, A6, A7, A8, A9 | 0     | clean                                             |

**Total 118.**

## Reconciling against the spec's expected counts

| figure                    | spec said | measured | explained                                                                                                         |
| ------------------------- | --------- | -------- | ----------------------------------------------------------------------------------------------------------------- |
| detailed item rows        | 107       | **107**  | agrees                                                                                                            |
| rows with a status        | 13        | **12**   | the spec counted before `#220` was rewritten; 12 is the current truth by independent `grep -c '^\*\*Status:\*\*'` |
| rows without              | 94        | **95**   | follows from the line above                                                                                       |
| CLOSED-annotated headings | 17        | **17**   | agrees exactly                                                                                                    |
| compact-table rows        | 66        | **42**   | **the spec conflated two tables** — see below                                                                     |

**The compact-table figure was wrong and it changes an approved parameter.** 66 is 42 compact rows
**plus the 24 rows of the Closed-numbers ledger**, which is a permanent record that only ever grows.
A ratchet set at 66 would therefore have permitted **24 new compact rows** before it ever fired —
the gate would have existed, passed, and protected nothing, which is this repository's most-recorded
defect. `scripts/debt-register.json` sets it to **42**, with that reasoning in the file.

## Three defects in the instruments, found while taking this run

1. **Prettier silently destroyed a fixture.** `fixtures/traps.md` pinned "an indented field is prose,
   not a declaration"; prettier de-indented it at commit time, so the fixture kept its name and lost
   its content, and would have passed against a broken parser. `scripts/lib/fixtures/` is now in
   `.prettierignore` — a gate fixture is malformed on purpose, and formatting it destroys what it
   pins. Verified: `prettier --write` now leaves it byte-identical.
2. **The parser's backtick guard was over-broad.** It skipped any line containing a backtick,
   reasoning that a row quoting the field is discussing rather than declaring it — and ate two real
   declarations whose value cites a symbol. The `^` anchor alone is sufficient, because the prose
   case it defended against (`#219`'s own sentence) does not begin at column 0. Verified by fixture.
3. **The mutation harness lied.** A run reported "0 failing cases" for the fence mutation; the
   mutation had never applied, because shell quoting mangled the replacement. A harness that fails
   to mutate reports exactly the same false negative as a gate that cannot fail. All three mutations
   re-verified individually.

## What M3 must not do

Repair the register, then lower the ratchet in the same commit if any compact row converts. Do **not**
arm the gate here — `check:debt-status` is deliberately absent from `package.json`'s `check:*` keys,
because `scripts/prepush.sh` derives its roster from them and registering it now would make it
blocking against a file with 118 known findings. A gate that fails on day one gets deleted rather
than fixed (ADR-0058). Arming is M4, after the repair.
