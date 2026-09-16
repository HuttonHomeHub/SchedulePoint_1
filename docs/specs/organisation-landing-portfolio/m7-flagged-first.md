# M7 — flagged plans first, measured before and after

**Status:** Approved — built. FC-1 is **met for the first time since it was written**: 7 of 7 at
both 1646 and 1920.

**Taken:** 2026-09-16, build `web 0.132.0 · api 0.65.0` (read off the shell footer, not assumed).
Both runs used `apps/web/scripts/measure-overview.mjs` **in one sitting**, three minutes apart,
against one fixture generator — so the difference this reports is a property of the change and not
of the machine.

---

## 0. Why this was opened

M6 left Q7 below the fold and named it a content decision rather than a width one. The product owner
asked for the content decision: order flagged plans first.

Reading the code to do it turned up that M6 had been **wrong about which rule was in the way**, and
the correction is the first finding rather than a footnote — see §4.

## 1. Before — the flag is sixth, 398 px below the fold

| Q   | Question                                  | Answering element              |     1646 |     1920 |
| --- | ----------------------------------------- | ------------------------------ | -------: | -------: |
| Q5  | When does each programme finish?          | "No finish date yet"           |      769 |      769 |
| Q6  | Has that moved against what we committed? | "No activities yet"            |      791 |      791 |
| Q7  | Is anything flagged in the schedule?      | "1 constraint broken by logic" | **1398** | **1378** |

**6 of 7 above the fold at both widths.** The fixture holds exactly one flagged plan
(`violating` — a `MANDATORY_START` before the network's own earliest, ADR-0035 §7), and five plans
with nothing wrong with them had been touched more recently, so it sorted sixth.

## 2. After — `orderByFlaggedFirst`

| Q   | Answering element                                   |    1646 |    1920 |
| --- | --------------------------------------------------- | ------: | ------: |
| Q5  | "Finishes 13 Feb 2026"                              |     789 |     779 |
| Q6  | "No baseline to measure against — capture one to …" |     791 |     791 |
| Q7  | "1 constraint broken by logic"                      | **831** | **811** |

**7 of 7 above the fold at both widths.** Bar: 7 of 7. **FC-1 MET.**

Q5 and Q6 changed which row answers them, and both improved without being aimed at: the section's
first statement used to come from a plan with no activities ("No finish date yet", "No activities
yet") and now comes from a real programme with a real finish date. That is a consequence of the
promotion rather than a second change.

## 3. What it cost: nothing measurable

|                                      |    Before |     After |
| ------------------------------------ | --------: | --------: |
| Page content height @ 1646           |  1,451 px |  1,451 px |
| "Where the work stands" top / height | 642 / 809 | 642 / 809 |
| "Recently changed" top / height      | 642 / 749 | 642 / 749 |
| Section content width @ 1646 / 1920  | 647 / 730 | 647 / 730 |
| FC-4 at 1440 / 1280                  | 544 / 464 | 544 / 464 |
| `…/overview` requests per load       |         1 |         1 |

Every figure identical. The change reorders an array of at most eight rows; it adds no request, no
row and no pixel.

**What it does cost, stated rather than buried.** Since M6 these two sections sit **side by side**
rather than stacked, so their orders now disagree where a reader can see both at once. Accepted:
they answer different questions, and matching orders bought agreement by making one of them answer
neither. The screenshot at §6 is what that looks like.

## 4. The M6 claim that was wrong, and why it was not harmless

`m6-two-column.md` §"FC-1 is 6 of 7" said the flag sat sixth "because that section is ordered by
**movement magnitude** and a flagged plan can sit anywhere in it".

It is ordered by **recency**. `overview.service.ts` builds `orderedStanding` by mapping over
`recentlyChanged`, and `findRecentlyChanged` is `ORDER BY changed_at DESC, p.id ASC`. There is no
movement-magnitude ordering anywhere in the module and there never was.

ADR-0076 Class 3 — a decision-bearing claim asserted without reading the file. It is not a
cosmetic error: it named the wrong rule as the one that would have to change, inside the sentence
explaining why the question was being deferred, so a reader picking this up would have gone looking
for a sort that does not exist. Corrected in place in that document rather than quietly dropped.

## 5. The decisions

**The rank is a boolean.** Not a count, not a severity. A plan with four visual conflicts is not
more urgent than one with a broken constraint; the four flag kinds are not comparable; and ranking
them would be precisely the invented opinion the argument this overturns was right to warn about.
Within each group the recency order survives untouched, because `Array.prototype.sort` has been
required to be stable since ES2019 — so the reader gets recency applied twice rather than lost.

**The predicate has one home.** `isFlagged` reads `flagsOf`'s **output**, not the raw counts.
`flagsOf` is where "which counts are worth showing" is decided — it omits zeroes, and a future flag
joins its table. A predicate written against `PlanStandingRow` would restate that decision, and the
two would drift the first time the table grew: a row would render a flag and sort as healthy, or
sort as flagged and render nothing (ADR-0065, ADR-0121).

**It sorts the DTOs, not the rows.** `flags` does not exist until `toStanding` has run `flagsOf`,
which is what makes the previous decision free rather than something held together by care.

**The order is stated on the DTO.** It is now a contract a consumer could reasonably rely on, so it
is written where a consumer reads rather than only in the service that produces it.

**Both mutations were verified red before the green was trusted** (ADR-0110 D5):

| Mutation                               | What went red                                                                                    |
| -------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `return [...rows]` — promotion removed | 3 cases, incl. the service-level `['a','b','c','d','e','f']` against `['f','a','b','c','d','e']` |
| rank by summed flag count              | 2 cases, incl. `['many-flags','one-flag']` against `['one-flag','many-flags']`                   |

The four remaining new cases guard different properties (no-op when none or all are flagged, the
input is not mutated, and `isFlagged` composed on `flagsOf`'s real output) and are deliberately
insensitive to both mutations.

## 6. Photographs

Written by the harness, not committed — this repository has no image pipeline (ADR-0077 §3) and a
screenshot of a seeded fixture goes stale the moment either changes. Re-take with both dev servers
up, and **with `DATABASE_URL` pointing at the database the API is using**:

```
DATABASE_URL=postgresql://app:app@localhost:5432/app_test?schema=public \
SP_SHOT_DIR=/tmp/landing-shots node apps/web/scripts/measure-overview.mjs
```

That last part is a trap this milestone hit: `local-psql.mjs` defaults to the `app` database while
`scripts/e2e-local.sh` migrates and serves `app_test`, so the fixture seeds through the API into one
database and ages its invitation in another. It fails loudly (`expected "UPDATE 1", got "UPDATE 0"`)
rather than measuring a half-applied fixture, which is that guard doing its job.
