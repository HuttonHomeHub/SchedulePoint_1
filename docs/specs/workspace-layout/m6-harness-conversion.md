# M6 — the seven flag-off harnesses, surveyed

_Groundwork for M6-T1, which the pre-approval review required be decomposed per suite before
execution rather than run as a file list. `VITE_CANVAS_WORKSPACE` is the estate's last Class A flag
(ADR-0088); retiring it means every harness that pins it off must first be green against the
**surviving** workspace._

The rule this exists to honour is ADR-0084 batch 1: that batch retired three flags and CI caught two,
because **a whole `playwright*.config.ts` can BE a flag-off harness** and the plan had named only the
unit parity suites. Six editing specs then sat clicking controls the now-unconditional pen shades,
until they timed out.

---

## 1. What each config pins

| config                                 | `VITE_CANVAS_WORKSPACE` | also pins pen off                                    | notes                                                                                                            |
| -------------------------------------- | ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `playwright.config.ts` (base)          | false                   | **yes** (`VITE_TSLD_EDITING`, `VITE_PLAN_EDIT_LOCK`) | its own comment says this keeps "the read-only TSLD surface and the role-only (no-pen) editing journeys" covered |
| `playwright.edit.config.ts`            | false                   | no (both `true`)                                     |                                                                                                                  |
| `playwright.sub-day.config.ts`         | false                   | no (both `true`)                                     |                                                                                                                  |
| `playwright.programme.config.ts`       | false                   | **yes**                                              | docblock: "canvas + pen off, so the journey is pen-free"                                                         |
| `playwright.assignment-lag.config.ts`  | false                   | no (both `true`)                                     |                                                                                                                  |
| `playwright.activity-editor.config.ts` | false                   | no (both `true`)                                     |                                                                                                                  |
| `playwright.notes.config.ts`           | false                   | **yes**                                              | docblock: "notes are not pen-gated anyway"                                                                       |

**The plan said two of the seven were the deliberately pen-free kind. There are three** — the **base**
config is one too, and it is the largest journey set in the repository. The plan lists it first among
the ordinary conversions. Worth knowing before scheduling the work: its pen pins are the same
deliberate simplification, and its own comment says so.

## 2. Probed: does a bare pin-flip work?

**`notes` — no.** Flipping `VITE_CANVAS_WORKSPACE` to `'true'` and running
`scripts/e2e-local.sh web:notes` fails on the first interaction: `locator.click` times out after 30 s
at `e2e-notes/notes.spec.ts:22`. So this suite needs a genuine **conversion** — new selectors against
the surviving surface — not a configuration edit, and the plan's instruction to establish that
per-suite before touching the flag is correct rather than cautious.

That is one measurement, not a survey: the other six are unprobed and must each be flipped and run
the same way before any of them is called ready. **Do not infer from `notes` that the rest need
conversion, or that they don't.**

## 3. The order to do it in

1. Probe each of the remaining six with a bare pin-flip, recording pass/fail here. A suite that
   passes unchanged is a config edit; one that fails is a conversion with a scope.
2. Convert the failures, running each locally (`scripts/e2e-local.sh web:<suite>`) to green **against
   the shipping surface with the flag on**.
3. Only then remove the flag from `apps/web/src/config/env.ts` and `vite-env.d.ts`, delete
   `LegacyPlanLayout` and `src/routes/plan-detail.tsx`'s legacy branch, move the flag into
   `scripts/flag-retirement.json`'s `retired` list with a batch, ratchet `classACap` 1 → 0, and close
   `docs/TECH_DEBT.md` #122.

**The off-ramp stays open** (M6's own "stated up front"): if this threatens M1–M4, it is deferred and
the trigger is **re-recorded with a reason** in `scripts/flag-retirement.json` and `#122` — not
silently left to rot. Deferring is a decision; ignoring is a defect.
