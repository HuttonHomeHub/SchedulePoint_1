# M0 — The measurement

**Taken:** 2026-09-09 against the working tree at `a208dc11`.
**Method:** every figure below names the command that produced it. **No `head`, no `| head -n`** —
`docs/TECH_DEBT.md` #274's own defect was an instrument that truncated its input and reported the
remainder as the answer, and this document exists partly to avoid repeating it.

**Every figure here is provisional.** M1-T4 re-derives all of them with the gate as the instrument
and the two are compared; a disagreement is a finding about _this_ method, recorded rather than
silently overwritten.

---

## M0-T1 — The population

| Quantity                        | Count  | Command                                           |
| ------------------------------- | ------ | ------------------------------------------------- |
| directories under `docs/specs/` | **98** | `ls -d docs/specs/*/ \| wc -l`                    |
| `feature-spec.md`               | **88** | `ls docs/specs/*/feature-spec.md \| wc -l`        |
| `spec.md`                       | **3**  | `ls docs/specs/*/spec.md \| wc -l`                |
| directories with **neither**    | **7**  | loop, printed by name below                       |
| `implementation-plan.md`        | **90** | `ls docs/specs/*/implementation-plan.md \| wc -l` |

98 = 88 + 3 + 7. **No directory holds both** a `feature-spec.md` and a `spec.md`, so "the spec
document" is well defined for all 91 that have one.

### The seven with no spec document — and the finding

The spec's §2 named all seven. What it did not say is that **four of them are cited by an ADR**:

| Directory                 | Holds                        | Cited by                   |
| ------------------------- | ---------------------------- | -------------------------- |
| `canvas-decomposition`    | `plan.md`                    | **ADR-0078**               |
| `canvas-maximisation`     | `m0-measurement.md`          | **ADR-0113**               |
| `design-system-rewrite`   | `README.md`, `design.md`, +4 | **ADR-0097**               |
| `graphite`                | `design.md`, `m0-…`, +5      | **ADR-0099**, **ADR-0102** |
| `calendar-hours-per-day`  | `schema-design.md`           | —                          |
| `canvas-paint-loop-fixes` | `plan.md`                    | —                          |
| `workspace-visual-polish` | `README.md`                  | —                          |

**So the exemption register (M2-T3) has four occupants on day one, and they are not edge cases** —
they are four shipped epics whose ADRs cite a directory that has no spec document to read a header
from. The join must therefore have a stated rule for _cited, but nothing to read_, and it cannot be
a silent skip: a silent skip is how the estate reached this state.

---

## M0-T2 — The header forms, and the tokens

Swept **un-anchored** (`grep -m1 "Status:"`, no `^`, no line number), per the plan's own risk note
that an anchored regex under-reports and looks complete.

**All 91 spec documents have a status line.** There is no missing-header case to design for.

| Prefix form        | Count  |
| ------------------ | ------ |
| `- **Status:**`    | **87** |
| `> **Status:**`    | **2**  |
| bare `**Status:**` | **2**  |

Consistent with the spec's 85 / 2 / 1 over the 88 `feature-spec.md` files, plus the three `spec.md`.
`fieldValue()` in the shared parser anchors on the **bare** form — 2 of 91 — which is why §4.5's
refusal to reuse it stands.

**Line numbers.** 84 of 91 are at line 3; the rest at **8, 8, 9, 17, 18, 21 and 30**. A line anchor
would be wrong, and first-match-wins is required rather than convenient.

### Tokens

| Token        | Count  | Fold → (CQ-1, approved: fold and list every fold) |
| ------------ | ------ | ------------------------------------------------- |
| `Draft`      | **72** | Draft                                             |
| `Approved`   | **13** | Approved                                          |
| `approved`   | 1      | Approved — case only                              |
| `Proposed`   | 1      | Draft — not yet approved to start                 |
| `Reviewed`   | 1      | Draft — reviewed is not approved                  |
| `Awaiting`   | 1      | Draft — literally "awaiting approval"             |
| `Delivered`  | 1      | Accepted — the work shipped                       |
| `SUPERSEDED` | 1      | Superseded — case only                            |

91 total. Seven files are folded; the other 84 already use a vocabulary member.

### **Correction: the Draft count is 72, not 67**

#274 said 67, measured with `grep -l "Status:\*\* Draft"`. That literal misses a status headed
`**Status:** **Draft — awaiting approval.**` — **bold** Draft — which three files use
(`gantt-editing`, `revision-compare-changes`, `revision-compare-delta`), and it never looked at
`spec.md` at all.

**This is the fourth instrument in this area to under-report**, after the `head -40` truncation, the
Prettier-wrapped `#259` grep and the swallowed duration probe. It is also the direct argument for
§4.5's design: the gate **normalises a token** rather than matching a string, because every
string-matching count of this population so far has been wrong.

---

## M0-T3 — The join, and the blind spot with a number

Rule under test: _a spec directory named by any file in `docs/adr/` may not be headed `Draft`._

| Population                               | Count  | Of which `Draft` | Meaning                                |
| ---------------------------------------- | ------ | ---------------- | -------------------------------------- |
| cited by an ADR, **has** a spec document | **68** | **54**           | the gate's findings on day one         |
| cited by an ADR, **no** spec document    | **4**  | n/a              | the exemption register's occupants     |
| **not** cited, has a spec document       | **23** | **18**           | **structurally invisible** to the gate |

68 + 4 + 23 = 95, plus the three uncited file-less directories = 98. ✔

**The blind spot is 18 documents, not "some".** The spec estimated it from a 21-slug sample (7 cited,
14 not); the whole-estate figure is that **18 Draft specs are invisible** because no ADR names their
directory. That is 25% of the 72 — a quarter of the defect this gate cannot see, and §4.10 must say
so with that number rather than with a sample.

**#274's "50 shipped with an ADR" becomes 54.** Third measurement of that number (28 → 50 → 54), and
each correction moved it upward.

---

## M0-T4 — The two integration assumptions, **run** rather than read

The spec flagged both as read-not-run. Both are now run.

**(a) `prepush.sh` derives its gate list from `package.json`.** Executing its own derivation with a
`check:spec-status` entry spliced in: `derived now: 15 checks` → `with check:spec-status added: 16 →
PICKED UP automatically`. It also refuses an empty list (`refusing to report success on nothing`).
**Consequence: M1 needs a `package.json` script and no `prepush.sh` edit at all.**

**(b) `check:advisory-agreement` classifies by construction.** Run: `OK. 1 declared advisory gate(s)
(check:reconcile-due), and exactly those can exit 2.` It parses `ADVISORY_GATES=( … )` out of
`prepush.sh` and cross-checks against `report({ advisory })` calls in the `.mjs` files.
**Consequence: a gate that never calls `report({ advisory })` and is absent from `ADVISORY_GATES`
needs no entry anywhere** — which is what CQ's blocking choice requires, and it is now observed
rather than inferred.

---

## What M0 changes in the design

1. **The exemption register is load-bearing from the first commit**, with four named occupants
   (M2-T3), not a facility for hypothetical edge cases.
2. **§4.10's blind spot is 18 documents**, measured over the whole estate rather than sampled.
3. **The Draft population is 72**, and the fourth string-matching miscount is the argument for
   normalising a token.
4. **No `prepush.sh` change and no `check:advisory-agreement` change are needed** — both confirmed by
   execution.
5. **No line anchor, first-match-wins**, on evidence: seven status lines sit between lines 8 and 30.
