# Graphite M5-T1 — does the reduced strip fit? Measured: no.

**Run 2026-08-20.** Harness: `apps/web/measure-toolbar/graphite-strip.spec.ts`, extended to 1024,
960 and 768 and now **composing** the reduced strip from the same real cloned controls rather than
arithmetic'ing it from per-item widths — which is what M0's own caveats said M5 owed.

## Verdict: outcome 3. The strip does not fit at 1280, so it narrows before anything is deleted.

`m5-design.md` wrote its three outcomes down before the run, so the result could not be
rationalised afterwards. This is the third: **the strip narrows further before anything is deleted.
It is not shaved for a seventh epic.**

| Viewport | Available | Reduced strip |    Slack | Fits   |
| -------: | --------: | ------------: | -------: | :----- |
|      768 |       720 |           920 | **−200** | no     |
|      960 |       912 |           932 |  **−20** | no     |
|     1024 |       976 |           970 |       +6 | yes¹   |
| **1280** |  **1232** |    **1322.9** |  **−91** | **no** |
|     1440 |      1392 |        1449.5 |      −58 | no     |
|     1646 |      1598 |        1473.5 |     +125 | yes    |
|     1920 |      1872 |        1517.5 |     +355 | yes    |

¹ Six pixels is noise, not a fit.

**The result is non-monotonic, and that is the shape of the answer rather than a measurement
error.** At 1024 and below the `▾` triggers are icon-only and cost ~26 px each; from 1280 up they
are labelled and cost ~170 px each (S11's own rule: a trigger is labelled in a roomy band). So the
strip is cheapest at the widths where it has least room and dearest where it has most, and there is
a trough at 1280–1440 where it fits neither way.

## The first run was wrong, and how it was wrong is the point

The first run reported the strip fitting at every width from 960 up, with 96–576 px of slack. It
was excluding three of its own subjects: `zoom`, `baseline-overlay` and `over-allocation` are
`isVisible`-gated and did not render in the measured plan (no baseline captured, no resource
assigned), so `itemsMissing` listed them and the total simply left them out — **141 px at the
narrow bands and 221 px at the wide ones**, which flips the answer at three of seven widths.

That is the ADR-0097 closure harness's failure exactly: a verdict produced from a measurement that
quietly excluded part of its subject. The fix is to **charge** them — `zoom` at the widest measured
labelled trigger, the two toggles at the measured icon width, both upper bounds of their class,
which is the direction an estimate inside a fit decision has to err. Seeding them instead would
mean capturing a baseline and assigning a resource inside a width harness, which is a lot of
plan-building for three controls whose widths their neighbours already give.

It was caught because the harness reports `itemsMissing` and somebody read it. It should not depend
on that: a fit harness that silently omits a gated control is one shipped defect away from
authorising exactly the deletion this measurement refuses.

## What ADR-0099 has to change

Its Consequences say the width ladder, the band floors, the hysteresis, `CHROME_RESIDUAL_PX` and
the `⋯` "become unnecessary and are deleted with the row they served". **On these numbers they do
not.** A ladder is what makes one row fit across a width range, and the range 768–1920 needs one.
The claim was written from the mockup, before M0 measured anything, and it is corrected rather than
quietly dropped.

**What M5 still delivers, and it is most of the value:** three command rows become one. The four
mode segments leave for the rail (a mode is not a command — ADR-0091's own thesis), five
document-level commands fold into `Plan ▾`, and `look` + `do` merge. The ladder survives to do the
job it was built for, on one row instead of two.

## Next, and it is a measurement again

Two further moves are justified by what the things **are**, not by the arithmetic — but the
arithmetic is why they are being made now rather than later:

- **The project-finish read-out leaves the strip for the plan identity row.** ADR-0099 D4 sends it
  to the status bar, and M5 deferred that only because the status bar is M7 — but the identity row
  already exists, already carries the plan's facts (breadcrumb, status badge, edit pencil) and
  already has room. A finish date is a fact about the plan, not a command. **−127 px.**
- **`Filter` folds into the search field.** One find surface, not two controls a hand's width apart.
  **−92 px.**

Both then get **re-measured**, not added up. M0's caveat is the standing rule here: a reduced
figure computed from per-item widths is a hypothesis, and this document exists because the last one
was wrong.
