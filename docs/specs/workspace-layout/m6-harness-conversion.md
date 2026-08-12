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

Each row below is a bare pin-flip (`VITE_CANVAS_WORKSPACE` → `'true'`) followed by
`scripts/e2e-local.sh web:<suite>`, with the config restored afterwards.

| suite                         | result     | detail                                                                            |
| ----------------------------- | ---------- | --------------------------------------------------------------------------------- |
| `notes`                       | **fails**  | `locator.click` times out at `e2e-notes/notes.spec.ts:22` — the first interaction |
| `edit`                        | **fails**  | all 3 specs: `keyboard-edit`, `pen-handoff`, `pen-smoke`                          |
| `sub-day`                     | **fails**  | both specs                                                                        |
| `programme`                   | **fails**  | 1 spec                                                                            |
| `assignment-lag`              | **fails**  | 1 spec, after a 2-minute timeout                                                  |
| `activity-editor`             | _unprobed_ |                                                                                   |
| base (`playwright.config.ts`) | _unprobed_ | the largest set; probe it last                                                    |

**Five of five probed so far need a real conversion, not a configuration edit** — new selectors
against the surviving surface. That is a materially larger job than "flip seven pins", and it is
exactly what the plan's instruction to establish it per-suite was for. The two remaining are still
unprobed and must be run the same way; **do not infer their result from these five.**

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
