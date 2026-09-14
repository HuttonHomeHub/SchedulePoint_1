# M0 — the staff console, photographed

**Status:** Approved
**Taken:** 2026-09-14, `web@0.128.0` + `api@0.64.0`, Chromium, viewport 1646 × 1000 (full-page capture).
**Artefact:** `apps/web/.screenshots/1646/staff.png` (git-ignored by convention — this file is the
durable record).

The console had never been photographed by anything. This is the first picture of it, and it is the
baseline FC-1/FC-2/FC-3 are judged against.

## 1. The baseline numbers

| quantity                       |                                           measured |
| ------------------------------ | -------------------------------------------------: |
| Document height at 1646 × 1000 |                                       **3,690 px** |
| That, in viewport heights      |                                    **2.2 screens** |
| Content column                 | `max-w-4xl` = **896 px** inside a 1646 px viewport |
| Horizontal space unused        |                    **~750 px, 46 % of the window** |
| Panels                         |                                   8, in one column |
| Rows in "Unverified accounts"  |                            **63**, ~700 px of page |

## 2. What the picture confirms

The order diagnosed from the code is exactly what it looks like. Reading down: **Mail → Performance
→ Diagnostics → Retention → CSP → Installation → Unverified accounts → Staff activity.**

**Positions 2 and 3 are inert and they are expensive.** Performance renders a paragraph, three
buttons and "No readings recorded yet"; Diagnostics renders a paragraph and two buttons. Together
they take roughly **550 px of the most valuable space on the page** — between the panel that is
reporting a live failure and the panels that report standing conditions. Neither does anything until
somebody presses a button. This is the complaint, visible.

**And there is a live failure on it right now**, which is lucky rather than designed: Mail shows
`Failures, last hour 1`, an `ESOCKET`, and two amber chips (`Failure alerting: off`,
`Heartbeat: off`). That failure is **an artefact of this harness** — `onboard()` signs up the
ordinary shot account and the API tries to send it a verification mail while the SMTP sink is not
running, because the sink only runs inside the staff branch. Recorded rather than quietly enjoyed:
it means the baseline happens to show one unhealthy panel, and it is **not** the §4.7 unhealthy
recipe, which M5 still owes.

## 3. What the picture CORRECTS — and it is the spec's own recommendation

**The spec recommended one column and I put that to the product owner with a warning against two.
The picture says they were right and I was too conservative.**

The content column is **896 px in a 1646 px window**. Just under half the screen is empty margin,
down the full 3,690 px. The argument for one column was that side-by-side placement makes scan
order ambiguous on a screen read for alarm — that risk is real and stays real — but it was made
without knowing that the page currently throws away **46 % of the width** while costing the reader
2.2 screens of scrolling. Those are the two facts a layout decision turns on, and neither was in
evidence when the recommendation was written.

So CQ-1's answer stands on measurement rather than on deference, and §6's framing of it as "an
override" is **withdrawn**: it was a better-informed call than the recommendation it overrode.

What does not change is how it is judged. FC-1 — _every non-healthy condition named or counted
within the first viewport_ — still decides whether the two-column arrangement is right, and band A
still may not be gridded in a way that puts a condition in a right-hand column below the fold.

## 4. What M1 inherits

- **FC-2's baseline is 3,690 px.** Two columns will beat it comfortably, which is why FC-2 proves
  almost nothing here (spec §6) and FC-1/FC-3 carry the verdict.
- **"Unverified accounts" is the single largest panel** and is mostly this machine's own e2e junk.
  On a real installation it is a short list; the redesign must not tune itself to a fixture. Its
  height is a property of the test database, not of the product.
- The narrow column is why several panels' tables look cramped at 1646 while the window is half
  empty — a symptom of the measure, not of the tables.

## 5. Harness: how the shot was made to work

`#319` said the shot was missing. It was present (`shoot.mjs:570`) and **unsatisfiable**. Three
things were needed, and each is now in the skip message so the next person is not guessing:

1. **A knowable address.** `onboard()` mints `shoot-${Date.now()}-${width}@example.com`, and
   `STAFF_EMAILS` is read once before the API boots, so a timestamped address can never be in it.
   `SHOOT_STAFF_EMAIL` (default `ops@schedulepoint.test`, matching what
   `playwright.staff.config.ts` already allow-lists) replaces it, via a new `onboardStaff()`.
2. **A verified address.** The guard demands `emailVerified` independently of
   `AUTH_REQUIRE_EMAIL_VERIFICATION`, and the token is stored hashed, so the only route is to
   receive the mail. The harness now runs the same `SmtpSink` the journeys use.
3. **Its own browser context.** The shared signed-in page holds the non-staff identity;
   photographing it would have produced a picture of the guard's 404.

**Deviation from the approved plan, recorded with its reason.** The plan chose sub-option (ii) —
move `SmtpSink` to `.mjs` + a `.d.ts` — and rejected (i), running the harness under
`--experimental-strip-types`, without trying it. Measured on this repository's Node (22.22.2), (i)
works. It is taken because it is strictly smaller: the sink stays **one** implementation with its
types attached, and the three specs and one config that already import it are untouched. A `shoot`
script in `package.json` carries the flag, and without it the import throws loudly.

**One more precondition the plan did not name**, found by booting the API: `MAIL_FROM` is required
whenever `MAIL_SMTP_URL` is set, and the API refuses to start without it. Now in the skip message.
