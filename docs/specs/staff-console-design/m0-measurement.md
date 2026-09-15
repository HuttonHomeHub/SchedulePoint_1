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

---

# M0 completed — the unhealthy shot, three widths, and the FC-3 baseline

**Taken:** 2026-09-14, same build. **Artefact:** `apps/web/.screenshots/1646/staff-unhealthy.png`
(1646 × 5553).

Everything above was taken on **one width in one state**, and the design review found that this left
**FC-1 with no instrument at all** (spec §8.16): FC-1 is judged on the §4.7 unhealthy recipe, and the
single unhealthy panel in the picture above is disclosed there as a harness artefact, explicitly not
the recipe. That is closed here, along with the three-width sweep and the FC-3 readings.

## 6. The unhealthy baseline — measured at three widths

API booted on the §4.7 recipe: `MAIL_SMTP_URL` unset, `MAIL_ALERT_URL` / `HEARTBEAT_URL` unset,
`RETENTION_SWEEP_ENABLED=false`, 68 unverified accounts present.

| quantity                    |              1280 |              1440 |              1646 |
| --------------------------- | ----------------: | ----------------: | ----------------: |
| Document height             |      **5,553 px** |      **5,553 px** |      **5,553 px** |
| …in viewport heights (1000) |       5.6 screens |       5.6 screens |   **5.6 screens** |
| Content column              |        **848 px** |        **848 px** |        **848 px** |
| Unused horizontal space     | 432 px (**34 %**) | 592 px (**41 %**) | 798 px (**48 %**) |
| Table width                 |        **798 px** |        **798 px** |        **798 px** |

**The three columns are identical, and that is the finding.** Every number except the margin is the
same at 1280 as at 1646: the page does not respond to width **at all** above 896 px. It is not that
the layout adapts badly — there is no adaptation to observe. So the 46 % recorded in §1 is
**48 %** at 1646 measured properly, and it is 34 % even on a 1280 laptop.

## 7. FC-1 FAILS on today's console — 3 of 5, at every width

Measured as the scroll-position of each condition's own sentence, against a 1000 px fold:

| condition                                        |     y | verdict               |
| ------------------------------------------------ | ----: | --------------------- |
| `MAIL_SMTP_URL` unset — "No mail transport…"     |   194 | above the fold        |
| `MAIL_ALERT_URL` unset — "Failure alerting: off" |   325 | above the fold        |
| `HEARTBEAT_URL` unset — "Heartbeat: off"         |   325 | above the fold        |
| `RETENTION_SWEEP_ENABLED=false` — "…is disabled" | 1,562 | **below by 562 px**   |
| 68 unverified accounts                           | 2,445 | **below by 1,445 px** |

**This is the epic's justification, measured rather than asserted.** Three of the five conditions are
above the fold only because they all belong to the **same panel**, which happens to sit first. The two
that belong to other panels are both below it — one by more than a screen and a half. An operator
opening this console to answer _"is anything wrong?"_ is told about mail and must scroll past two
inert panels to learn that **nothing has been deleted from any table since the sweep was switched
off**.

Identical at all three widths, for the reason §6 gives: there is no responsive behaviour to differ.

## 8. FC-3's baseline is a measurement now, not a ceiling

The review's B8 was right to ask. Read from the **real instrument** — both ceilings temporarily
dropped to 0 so the assertion message reports the true count, then reverted (a figure taken with a
_copy_ of an instrument measures the copy, ADR-0124):

| ratchet                                  | ceiling | **measured** |
| ---------------------------------------- | ------: | -----------: |
| `weightSites()` outside `components/ui/` |     173 |      **173** |
| arbitrary sizing values                  |      17 |       **17** |

**Both sit exactly on their ceilings**, so the previous epic did ratchet to its own measurement and
FC-3 — _"falls from 173"_ — is well-defined. It would not have been if either read 171, and nobody
had checked.

## 9. FC-4's baseline is 798 px, not 848

Spec §8.1 costed the layout in **container** widths (848 px today). The **table** is what FC-4
guards, and a card's own padding takes 50 px of it. Measured, every table on the page is **798 px**.
So FC-4 is stated against 798, and the three arrangements compare like this:

| arrangement                                   | container |    **table** |            vs today |
| --------------------------------------------- | --------: | -----------: | ------------------: |
| today, `narrow`                               |    848 px |   **798 px** |                   — |
| two **equal** columns at 1646 (`full`)        |    787 px |   **737 px** | **−61 px (−7.6 %)** |
| span-by-demand, `wide`, a table spanning both |  1,488 px | **1,438 px** | **+640 px (+80 %)** |

The review's conclusion is unchanged and its arithmetic is confirmed: equal columns regress every
table on the page. The gain from span-by-demand is **+80 %**, slightly better than the +75 % §8.1
estimated from container widths.

**One table in the code does not appear in this picture and is not missing.** `staff.tsx:398` defines
a **five**-column CSP table; on this database there are no violations, so the panel renders "No
violations recorded" and no table. It is the widest table the console can produce and the one with
the least margin for narrowing — judge FC-4 against the four that render, and remember the fifth.

## 10. FC-2's baseline drifts upward on its own, and the epic must not quote it as a win

§4 recorded **3,690 px** for the healthy state. The healthy shot re-taken today measures
**4,245 px** — the same build, the same width, the same state, **+555 px**. Nothing about the product
changed. "Unverified accounts" and "Staff activity" are both fed by tables that only **grow**, and
`staff activity` grows by roughly seven rows _every time the console is opened_ — including by this
harness.

So **FC-2 compares two numbers taken at different times against a database that is monotonically
increasing**, which means a redesign could beat it while being taller, or be penalised while being
shorter. §6 already said FC-2 proves almost nothing because two columns halve the page by
construction; this is a second, independent reason, and it is the stronger one. **If FC-2 is judged
at all, the before and after must be measured in the same sitting** — stash the change, measure,
restore — and the verdict says so. It is not the condition that decides this epic: **FC-1 does, and
it fails today.**

## 11. The non-vacuity control was vacuous, and running it is the only way that was ever going to

show

The control was written as _"at least two of four recipe conditions are present"_, and **it passed
against the healthy API**, finding `Failure alerting: off` and `Heartbeat: off`. Both are
**empty by default on every boot** — CLAUDE.md §17 records them as compose edits on the host — so
they are true whether or not the recipe was ever applied. A control written to stop a hierarchy
assertion being judged over an empty set, satisfied by two conditions that carry no information.
The gate-that-cannot-see-the-defect shape (ADR-0093, ADR-0108, ADR-0121, ADR-0131), inside the gate
written to prevent it.

Fixed by splitting the probes: `conditions` holds only what the recipe **turns on** — the two that
discriminate between the boots — and **every one must be present**; `ambient` is reported for the
record and can satisfy nothing. **Re-verified red** against the healthy API, where it now names the
two it is missing.

**And it earned its keep within the hour.** The first attempt to boot the unhealthy API failed with
`EADDRINUSE` — a stale server from the earlier run still held port 3000 — while `curl` on
`/health` answered **200** from that old process. Every signal said the stack was ready. The control
is what would have refused the picture; the ADR-0099 rule (a sweep measures the tree it runs
against) is what made me look. Both servers are now killed by port before a shot, not by remembered
pid.

## 12. The measurement harness lied once, and the guard is recorded

`measure-staff.mjs`'s first run reported **`FC-1: 0 of 5 -> FAIL`** at all three widths, with
`document height : 1000 px`. It had signed in with the wrong password, stayed on the auth screen, and
found none of the five conditions **because it was not looking at the console** — then printed a
verdict about a page it had never loaded, in the format of a real result. An instrument that cannot
tell _"the condition is absent"_ from _"I am on the wrong screen"_ is worse than none, because
somebody acts on it. It now asserts the `<h1>` reads "Staff console" and **throws** otherwise, with
the message saying that nothing below it is a measurement. Same rule as the shot's own guard, which
already had it.
