# M0-T1 — The falsification condition, written before the run

**Written 2026-08-30, before any measurement was taken.** That ordering is the whole point of this
file and is the reason it is a commit of its own: ADR-0097 Landing C's harness produced a verdict
from an `undefined` (`undefined >= 120` is `false` — the right answer from a missing number) and
reported PROCEED off a 37 px placeholder plan name. A rule written after seeing a number is not a
rule.

---

## What the candidate is predicted to cost

**A prediction to be checked, not the answer.** `Toolbar.tsx:199`'s inter-group chrome is
`ml-1 border-l pl-2`; on Tailwind's 4 px scale that is 4 + 1 + 8 = **13 px**, on top of the parent's
existing `gap-1`.

|                   | between `Visual mode` and `Diagram` |
| ----------------- | ----------------------------------- |
| today             | 4 px                                |
| with the divider  | 17 px                               |
| **predicted net** | **+13 px**                          |

Everything else is predicted unchanged. If the run disagrees with this arithmetic, **the run wins
and the disagreement is the finding** — that is the recorded pattern on this surface, not an
exception to it.

---

## The verdict rule

> **PROCEED with the divider** if and only if, on a populated plan with a **long** plan name and a
> **real** project crumb, with the **pen held**, measured in Chromium:
>
> 1. at **1646** and **1920** the live header row is **one line** with the candidate chrome
>    present; **and**
> 2. `aboveCanvas` with the candidate **equals** `aboveCanvas` without it at 1646 and 1920 — an
>    equality, not a bound. ADR-0115 records a `<= 120 px` bound that could not tell the fixed state
>    from the broken one; **and**
> 3. at **1440** and **1280**, `aboveCanvas` does not grow; **and**
> 4. the mode cluster is **one line** at every measured width.
>
> **WITHDRAW the divider and ship the accessible names alone** if any of 1–4 fails. That fallback is
> safe in the direction that matters: names without a divider is not a WCAG exposure, whereas a
> divider without names would create one (feature-spec §4.7). The visual half then gets its own
> design pass rather than being forced.
>
> **The measurement is VOID and re-run if** the fixture's plan name is short (ADR-0097 Landing C's
> harness reported "307 px of slack, PROCEED" from a 37 px placeholder), or the pen is not held
> (ADR-0115: every reading was taken in the one state where the schedule region renders nothing), or
> the probe reports a band it cannot locate (ADR-0091 M7: a missing band was `.filter()`ed out rather
> than throwing, and every surviving number stayed plausible).

**The product owner has pre-approved the WITHDRAW branch** (2026-08-30, feature-spec §1 Q2), with the
cost stated: half of `docs/TECH_DEBT.md` #201 stays open and a sighted planner still meets one
undifferentiated four-way group. So a WITHDRAW verdict does **not** stop to ask; it shrinks the scope
and reports.

---

## The figures the run must report, so the decision is legible either way

Baseline **and** candidate, at **1280 / 1440 / 1646 / 1920**:

| figure              | why it is here                                                             |
| ------------------- | -------------------------------------------------------------------------- |
| `container`         | the width the row actually has, which is not the viewport                  |
| `headerRowRequired` | what the row's occupants need                                              |
| `perOccupant.mode`  | the cluster this change touches, isolated                                  |
| live `lines`        | the failure mode is a second line, not a truncation                        |
| `aboveCanvas`       | what a second line costs the diagram — measured 36 → 84 px, i.e. **48 px** |

Each figure is printed beside **the node's own text**, because
`m1-merged-probe.spec.ts:104-112` and `:178-186` record that probe measuring something under another
thing's name three times in one file.

---

## Why this milestone exists at all

Every width expectation on this surface has been contradicted by its own measurement: ADR-0090 M4
(three of three figures wrong), ADR-0091 D4 (withdrawn), ADR-0092 M4/M5 (withdrawn), ADR-0093 (the
width argument withdrawn), ADR-0097 Landing C (withdrawn on its own falsification condition),
ADR-0113 (two of four ideas did not exist as work), ADR-0114 (164 px freed bought **zero** height),
ADR-0115 (58 px to save 36). **Eight epics, all in the same direction.**

The change proposed here is ~13 px on a **wrapping** row whose height is a function of its width. The
prior on this surface is not that 13 px is free.
