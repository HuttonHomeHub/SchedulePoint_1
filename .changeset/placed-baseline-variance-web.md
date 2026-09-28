---
'@repo/web': minor
---

**Every baseline variance figure now says which dates it compares** (`docs/TECH_DEBT.md` #359,
US-2). The activities panel's variance summary reads "vs. \<baseline\> (placed dates): …" on a
baseline that recorded where bars were placed, or "(earliest dates): …" plus a plain sentence
explaining that the baseline predates placement capture and naming the remedy (capture a new
one) on an older baseline. The Baselines panel gains a **Compares** column showing "Placed
dates" or "Earliest dates" per row, and the printed Gantt programme's legend names the basis
beside its Baseline swatch whenever the variance column is printed. The activities table's float
variance column is relabelled **Total float variance**, distinguishing it from the adjacent
**Float left** (remaining float) column it sits beside. No wording renders when an older API
image (mid rolling-update) omits the basis field — nothing is guessed.
