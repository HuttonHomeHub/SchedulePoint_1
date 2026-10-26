# Evidence for the regenerated levelling hashes (#539)

Taken 2026-10-26 against the parent engine (`9a750756`, the commit before the change) and the engine in
the tree, by `apps/api/scripts/measure-milestone-levelling-movement.mts`. Re-run it with the commands in
that file's docblock; it computes all 60 contended seeds and the eight hot-resource shapes under both
engines and prints a row only where the levelled output differs.

**Result.** Of the 60 contended seeds exactly three differ (12, 52 and 57), which are the three hashes that
were replaced; the other 57 are byte-identical. Every changed row is one of:

- **seed 12:** `A056`, a START_MILESTONE on its own calendar whose neighbour is on the plan calendar: a
  cross-calendar seam, the class the change is for. Its late offsets move one working day later.
- **seed 52:** `A134`, a START_MILESTONE on its own calendar with two plan-calendar neighbours (a seam),
  its predecessor `A124` (plan calendar, float +1,380 minutes, a reported field, because the milestone's
  late instant is no longer rolled back), and the levelled starts that float bounds. No single-calendar
  row has a reported field moved: the generator's milestone is a seam, and the spec's promise (a
  single-calendar network is unchanged in every reported field) holds. Seed 57 and the hot-resource plan
  have no seam and move only in-memory instants.
- **seed 57 and the hot-resource shapes:** only `passOnStartInstant`, `passOnFinishInstant` and
  `leveledStartInstant` on zero-span rows, none of which is persisted or on a response. Every summary is
  equal.

The script exits non-zero if a reported field moves on a zero-span row with no seam. It did not.

```text
== contended seed 12 (158 activities, passC false)
  net A056 START_MILESTONE d=0 seam=true: lateStartOffset 48960 -> 51120; lateFinishOffset 48960 -> 51120
  lev A056 START_MILESTONE d=0 seam=true: lateStartOffset 48960 -> 51120; lateFinishOffset 48960 -> 51120
== contended seed 52 (150 activities, passC false)
  net A124 TASK d=4320 seam=true: lateStartOffset 64800 -> 66180; lateFinishOffset 69120 -> 70500; totalFloat 59040 -> 60420; lateFinish "2026-02-21" -> "2026-02-22"; remainingFloatMinutes 59040 -> 60420
  net A134 START_MILESTONE d=0 seam=true: lateStartOffset 69120 -> 70500; lateFinishOffset 69120 -> 70500
  lev A004 TASK d=10080 seam=false: leveledStartOffset 244500 -> 241620; leveledStartInstant 29704020 -> 29701140; leveledFinishOffset 254580 -> 251700; levelingDelay 244500 -> 241620; leveledStart "2026-06-23" -> "2026-06-21"; leveledFinish "2026-06-30" -> "2026-06-28"
  lev A005 TASK d=4320 seam=false: leveledStartOffset 263220 -> 264600; leveledStartInstant 29722740 -> 29724120; leveledFinishOffset 267540 -> 268920; levelingDelay 263220 -> 264600; leveledStart "2026-07-06" -> "2026-07-07"; leveledFinish "2026-07-09" -> "2026-07-10"
  lev A009 TASK d=720 seam=false: leveledStartOffset 263160 -> 264540; leveledStartInstant 29722680 -> 29724060; leveledFinishOffset 263880 -> 265260; levelingDelay 263160 -> 264540; leveledStart "2026-07-06" -> "2026-07-07"; leveledFinish "2026-07-07" -> "2026-07-08"
  lev A040 TASK d=2880 seam=false: leveledStartOffset 263880 -> 265260; leveledStartInstant 29723400 -> 29724780; leveledFinishOffset 266760 -> 268140; levelingDelay 263880 -> 265260; leveledStart "2026-07-07" -> "2026-07-08"; leveledFinish "2026-07-09" -> "2026-07-10"
  lev A046 TASK d=1440 seam=false: leveledStartOffset 270960 -> 272340; leveledStartInstant 29730480 -> 29731860; leveledFinishOffset 272400 -> 273780; levelingDelay 270960 -> 272340; leveledStart "2026-07-12" -> "2026-07-13"; leveledFinish "2026-07-13" -> "2026-07-14"
  lev A049 TASK d=10080 seam=true: leveledStartOffset 245880 -> 244500; leveledStartInstant 29705400 -> 29704020; leveledFinishOffset 255960 -> 254580; levelingDelay 245880 -> 244500; leveledStart "2026-06-24" -> "2026-06-23"; leveledFinish "2026-07-01" -> "2026-06-30"
  lev A053 TASK d=5760 seam=false: leveledStartOffset 254580 -> 255960; leveledStartInstant 29714100 -> 29715480; leveledFinishOffset 260340 -> 261720; levelingDelay 254580 -> 255960; leveledStart "2026-06-30" -> "2026-07-01"; leveledFinish "2026-07-04" -> "2026-07-05"
  lev A064 TASK d=4320 seam=false: leveledStartOffset 263880 -> 265260; leveledStartInstant 29723400 -> 29724780; leveledFinishOffset 268200 -> 269580; levelingDelay 263880 -> 265260; leveledStart "2026-07-07" -> "2026-07-08"; leveledFinish "2026-07-10" -> "2026-07-11"
  lev A065 TASK d=2880 seam=false: leveledStartOffset 266760 -> 268140; leveledStartInstant 29726280 -> 29727660; leveledFinishOffset 269640 -> 271020; levelingDelay 266760 -> 268140; leveledStart "2026-07-09" -> "2026-07-10"; leveledFinish "2026-07-11" -> "2026-07-12"
  lev A072 TASK d=8640 seam=false: leveledStartOffset 245880 -> 254580; leveledStartInstant 29705400 -> 29714100; leveledFinishOffset 254520 -> 263220; levelingDelay 245880 -> 254580; leveledStart "2026-06-24" -> "2026-06-30"; leveledFinish "2026-06-30" -> "2026-07-06"
  lev A107 TASK d=2880 seam=false: leveledStartOffset 268200 -> 269580; leveledStartInstant 29727720 -> 29729100; leveledFinishOffset 271080 -> 272460; levelingDelay 268200 -> 269580; leveledStart "2026-07-10" -> "2026-07-11"; leveledFinish "2026-07-12" -> "2026-07-13"
  lev A123 TASK d=5760 seam=true: leveledStartOffset 255960 -> 244500; leveledStartInstant 29715480 -> 29704020; leveledFinishOffset 261720 -> 250260; levelingDelay 255960 -> 244500; leveledStart "2026-07-01" -> "2026-06-23"; leveledFinish "2026-07-05" -> "2026-06-27"
  lev A124 TASK d=4320 seam=true: lateStartOffset 64800 -> 66180; lateFinishOffset 69120 -> 70500; totalFloat 59040 -> 60420; lateFinish "2026-02-21" -> "2026-02-22"; remainingFloatMinutes 59040 -> 60420; leveledStartOffset 241560 -> 251640; leveledStartInstant 29701080 -> 29711160; leveledFinishOffset 245880 -> 255960; levelingDelay 235800 -> 245880; leveledStart "2026-06-21" -> "2026-06-28"; leveledFinish "2026-06-24" -> "2026-07-01"
  lev A126 TASK d=2880 seam=true: leveledStartOffset 260340 -> 261720; leveledStartInstant 29719860 -> 29721240; leveledFinishOffset 263220 -> 264600; levelingDelay 257460 -> 258840; leveledStart "2026-07-04" -> "2026-07-05"; leveledFinish "2026-07-06" -> "2026-07-07"
  lev A128 TASK d=2880 seam=false: leveledStartOffset 260280 -> 261660; leveledStartInstant 29719800 -> 29721180; leveledFinishOffset 263160 -> 264540; levelingDelay 257400 -> 258780; leveledStart "2026-07-04" -> "2026-07-05"; leveledFinish "2026-07-06" -> "2026-07-07"
  lev A134 START_MILESTONE d=0 seam=true: lateStartOffset 69120 -> 70500; lateFinishOffset 69120 -> 70500
== contended seed 57 (15 activities, passC true)
  net A006 START_MILESTONE d=0 seam=false: passOnStartInstant 29490240 -> 29486460; passOnFinishInstant 29490240 -> 29486460
  net A010 START_MILESTONE d=0 seam=false: passOnStartInstant 29513280 -> 29512380; passOnFinishInstant 29513280 -> 29512380
  lev A006 START_MILESTONE d=0 seam=false: passOnStartInstant 29490240 -> 29486460; passOnFinishInstant 29490240 -> 29486460
  lev A010 START_MILESTONE d=0 seam=false: passOnStartInstant 29513280 -> 29512380; passOnFinishInstant 29513280 -> 29512380; leveledStartInstant 29561100 -> 29561040
== hot8 passC=false: summary same=true; 11 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 3 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant
== hot8 passC=true: summary same=true; 10 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 11 x START_MILESTONE d0=true: leveledStartInstant | 3 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 4 x FINISH_MILESTONE d0=true: leveledStartInstant | 1 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant,leveledStartInstant
== hot3 passC=false: summary same=true; 11 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 3 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant
== hot3 passC=true: summary same=true; 5 x FINISH_MILESTONE d0=true: leveledStartInstant | 10 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 1 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 4 x START_MILESTONE d0=true: leveledStartInstant | 2 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant,leveledStartInstant | 1 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant,leveledStartInstant
== scale8 passC=false: summary same=true; 11 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 3 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant
== scale8 passC=true: summary same=true; 3 x FINISH_MILESTONE d0=true: leveledStartInstant | 11 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 3 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 3 x START_MILESTONE d0=true: leveledStartInstant
== scale2 passC=false: summary same=true; 11 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 3 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant
== scale2 passC=true: summary same=true; 11 x START_MILESTONE d0=true: leveledStartInstant | 9 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 2 x START_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant,leveledStartInstant | 3 x FINISH_MILESTONE d0=true: passOnStartInstant,passOnFinishInstant | 6 x FINISH_MILESTONE d0=true: leveledStartInstant
```
