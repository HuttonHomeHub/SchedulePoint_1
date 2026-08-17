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

| suite                         | result    | detail                                                                            |
| ----------------------------- | --------- | --------------------------------------------------------------------------------- |
| `notes`                       | **fails** | `locator.click` times out at `e2e-notes/notes.spec.ts:22` — the first interaction |
| `edit`                        | **fails** | all 3 specs: `keyboard-edit`, `pen-handoff`, `pen-smoke`                          |
| `sub-day`                     | **fails** | both specs                                                                        |
| `programme`                   | **fails** | 1 spec                                                                            |
| `assignment-lag`              | **fails** | 1 spec, after a 2-minute timeout                                                  |
| `activity-editor`             | **fails** | 11 of 11, 2026-08-14 — 10 `locator.click` timeouts, 1 visibility                  |
| base (`playwright.config.ts`) | **fails** | 8 of 17, 2026-08-14 — the other 9 pass; 5 click timeouts, 2 visibility, 1 value   |

**Seven of seven need a real conversion, not a configuration edit** — new selectors against the
surviving surface. Completed 2026-08-14; the table above is now measurement throughout.

### What the last two probes settled, including about the first five

**The total is 27** — base 8, `activity-editor` 11, `edit` 3, `sub-day` 2, and one each for `notes`,
`programme`, `assignment-lag`.

**That figure was already in circulation, and it was an inference.** ADR-0090 M6 and
`scripts/flag-retirement.json`'s deferral reason both stated "all seven were probed, 27 specs"
while this table said `_unprobed_` twice and closed by forbidding exactly that inference. The two
probes above now say the inference was **numerically right** — 8 and 11, precisely as guessed from
counting `test(` calls. That is worth recording plainly rather than quietly: **being right is not
the same as having measured, and a correct guess does not retrospectively validate the method.**
The claim was corrected on 2026-08-14 before these probes ran, on the grounds that it was
unestablished; it stays corrected, because the reason it was wrong to assert has not changed.

**The failure modes are conversions, not rewrites.** Every one of the 19 is a `locator.click`
timeout, a `toBeVisible` or a `toHaveValue` — controls that moved (the activities panel is collapsed
by default, `Capture baseline` is behind `Analysis ▸ Baselines…`, `plans.spec.ts` looks for an
`Activities` heading the surviving surface does not have). Nothing crashed and nothing hung.

**And they answer a worry two reviews raised.** Both flagged that after retirement the base journeys
land in a flag combination no config exercises today — `VITE_CANVAS_WORKSPACE` on, with
`VITE_TSLD_EDITING` and `VITE_PLAN_EDIT_LOCK` still pinned off, and `CANVAS_AUTHORING_ENABLED`
newly true because it is derived from the retiring flag. **Nine of base's seventeen specs passed
through that exact combination unchanged**, and the eight failures are all "the control moved"
rather than "the page is broken". So the combination renders and works; it is unproven only in the
sense that no config had asserted it before, which these runs now have.

## 3. The order to do it in

1. Probe each of the remaining six with a bare pin-flip, recording pass/fail here. A suite that
   passes unchanged is a config edit; one that fails is a conversion with a scope.
2. Convert the failures, running each locally (`scripts/e2e-local.sh web:<suite>`) to green **against
   the shipping surface with the flag on**.
3. Only then remove the flag from `apps/web/src/config/env.ts` and `vite-env.d.ts`, delete
   `LegacyPlanLayout` and `src/routes/plan-detail.tsx`'s legacy branch, move the flag into
   `scripts/flag-retirement.json`'s `retired` list with a batch, ratchet `classACap` 1 → 0, and close
   `docs/TECH_DEBT.md` #122.

## 4. The off-ramp is taken, with the number that justifies it

M6's own plan states the off-ramp up front: _"This is the largest conversion cost in the estate. If it
threatens M1–M4, it is deferred — and the trigger is **re-recorded with a reason**… Deferring is a
decision; ignoring is a defect."_

**27 spec conversions across seven harnesses, three of which must first be shown to work pen-free**,
is that threat made concrete. M1–M5 are complete, gated and in review; bolting a 27-spec conversion
onto that pull request would hold a finished, independently valuable change behind a mechanical job
whose size was unknown when the milestone was scheduled and is now measured.

So M6 is **deferred, not dropped**, and the trigger is re-recorded in `scripts/flag-retirement.json`
and `docs/TECH_DEBT.md` #122 with this measurement attached — whoever picks it up starts from a
survey and seven probe results rather than from a file list.

**What the deferral does not cost.** `VITE_CANVAS_WORKSPACE` is already default-on and, per ADR-0088
D1, **cannot be switched off on any deployed container** — `docker-publish.yml` passes no `VITE_`
build arg, so every published image carries it on. Nothing about the running product depends on this
decision. What survives is the second product in the source tree, and the seven harnesses that still
exercise it.
