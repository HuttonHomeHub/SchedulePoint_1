# M0-T2 — The BEFORE photographs, and what the harness can and cannot see

**Taken 2026-08-21** against `web-v0.96.0` + the ADR-0101 stopgaps, at 1646 / 1920 / 1280.
`.screenshots/` is git-ignored, so this file is the durable record of what was shot and what was not.

## The widening came first, deliberately

The task's sequencing is the whole point: **widen, then shoot**, so the BEFORE and AFTER sets are
comparable. A shot added later is a screen with no before.

**12 shots → 25.** What was added, and why each earned its place:

| Added                                                                | Why it was missing, and why it matters here                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forgot-password`, `reset-password`, `verify-email`, `accept-invite` | The pre-authentication surface is **six** routes and the harness had two. So `auth` — the one surface scope this epic may retire — was two-thirds unphotographed. All three token-bearing ones are shot **without** a token on purpose: that is the invalid-link state, which is a screen real people reach (an expired email, a truncated link) and the one a re-derivation forgets. |
| `audit-log`                                                          | A dense table with its own status vocabulary. Nothing in the shot list exercised the `-text` status tokens at volume.                                                                                                                                                                                                                                                                 |
| `project-detail`                                                     | Reachable only by id, which is why it needed `seedProgramme` to return the whole triple rather than just a plan.                                                                                                                                                                                                                                                                      |
| `clients-error`, `clients-loading`                                   | Every screen has three states and the harness had only ever seen the third. Produced by **intercepting the request**, not by contriving data — a 500 fulfilled, and a route that never resolves. That is what makes them deterministic rather than flaky.                                                                                                                             |
| `gantt`, `gantt-arrows`                                              | A peer view of the same plan (ADR-0059), never once photographed — half the product's schedule surface outside the instrument this epic is judged by. Arrows ship default-off (ADR-0095), so both states are shot.                                                                                                                                                                    |
| `plan-workspace-minimap`                                             | ADR-0100, landed the same day as this task. Its frame pair has **no ancestor** in the recovered palette and **no resolver** behind it.                                                                                                                                                                                                                                                |
| `share-guest`                                                        | The only screen a person outside the organisation ever sees. Session-less by construction, so it needs a token minted from the signed-in context and viewed from an anonymous one.                                                                                                                                                                                                    |
| `export-diagram`                                                     | **The artefact rather than the screen** — see below.                                                                                                                                                                                                                                                                                                                                  |

## The finding: the shot list stopped at what screens look like

`export-diagram` captures the **downloaded PNG**, not a picture of the menu that produced it. It was
added because the absence of exactly this shot is what let `docs/TECH_DEBT.md` **#158** ship: the
harness photographed twelve screens and never once looked at what the product _produces_, so a
printed programme with a near-black diagram inside white paper chrome went out to whoever a planner
hands it to.

**Confirmed on the first capture.** The exported PNG has a near-black ground under a title band whose
ink was derived for white paper. M0-T2's step 4 asked whether §0.2 was real; it is, it was raised
immediately as its own row rather than folded into this epic's benefits, and #158 now cites the
artefact rather than the token chain.

## Three probes, three wrong guesses — recorded because the pattern is the lesson

Each of these cost a run and each was resolved by **looking rather than reasoning**:

1. **`View` is `aria-haspopup="dialog"`, not a menu.** The first helper reached for
   `menuitemcheckbox` — the ADR-0031 taxonomy every other toolbar trigger uses — and timed out
   against a perfectly correct control. The panel is a popover of radio groups and checkboxes.
2. **The Gantt's arrow toggle is "Logic links", not "Dependencies".** And it is Gantt-only: the
   TSLD's View panel has no such entry, because on a time-scaled logic diagram the links _are_ the
   picture rather than an option.
3. **`plan-workspace-editor` needed `takePen`.** The shot before it releases the lease, and the
   lease is per plan, so every later shot of that plan inherits a shaded Edit. It passed under
   `--only` and failed in the full run — a shot list is **ordered state**, not independent pictures.

## What was dropped, and why — not left flaky

| Dropped                                                  | Reason                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/staff`                                                 | Needs `STAFF_EMAILS` set on the **API process**, and the harness does not start the API. Making it shootable means an env contract between two programs for one picture of a screen no customer sees. Recorded rather than bodged. If M3 wants it, set `STAFF_EMAILS` before the run and add the shot then.                                                                                           |
| The print **document** (as distinct from the export PNG) | It renders into a detached container and is handed to the browser's print pipeline (ADR-0059 M4), so there is no page state to photograph and no file to capture. The export PNG shares `resolvePrintPalette` with it, so it stands in as evidence for the palette — **but not for the pagination**, and this note exists so nobody reads a green `export-diagram` as covering the printed programme. |

## The harness's own limits — read this before comparing two runs

- **It mints a tenant per run and per width**, and paints the organisation's name into the header. A
  byte or hash comparison of two runs therefore reports "everything changed" for a milestone whose
  whole condition may be "nothing changed" (ADR-0099 M2 found this). Compare **by eye**, or by
  pixel-diff of regions that exclude the header.
- **It is not a test.** It asserts only that a shot is not a 404. A screen that renders correctly and
  looks wrong is a green run — which is the entire reason a person looks at the output.
- **One page per width, reused across shots.** State carries: the pen, an armed intercept, an open
  panel. Intercepts are disarmed after their shot for exactly this reason; anything else added later
  must do the same.
- **`networkidle` cannot settle behind the hung intercept**, so `clients-loading` uses a fixed
  settle. That is the right instrument for that one shot and the wrong one everywhere else, so it is
  branched rather than applied globally.

## What the BEFORE set shows, for the record

Two things worth naming now, because M1 and M2 will be judged against them:

1. **The sign-in card is already light corporate** — white card, navy primary, amber ring — and the
   screen a reader lands on one click later is entirely dark. The two shots are consecutive in the
   list and the discontinuity is the epic's clearest single justification.
2. **The diagram reads as one colour.** In a pure chain every activity is critical, so the canvas,
   the minimap and the guest view all paint one red mass on near-black. That is correct behaviour and
   a fair picture of the problem: criticality is carrying the whole visual load, which is what CQ-3's
   categorical ramp exists to relieve.
