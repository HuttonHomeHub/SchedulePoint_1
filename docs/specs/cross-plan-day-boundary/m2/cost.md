# M2-T8: FC-6 judged on the built change

- **Status:** Measured 2026-09-26, the baseline and the change in one sitting on one machine.
- **Verdict:** the counting limb **passes**. The timing limb **passes on the central estimate
  (+36.1 ms p95 against a 50 ms bar) but not in every pairing**: one of the four paired rounds reads
  +54.9 ms. The margin under the bar (13.9 ms) is about the size of the baseline's own run-to-run
  spread (13.2 ms), so this is a pass that the noise on this machine does not clear with room to
  spare. It is recorded that way rather than rounded up, and a re-run on the PostgreSQL 17 host is
  the way to settle it.
- **Harness:** `apps/api/scripts/measure-cross-plan-derivation.mts`, unchanged since M0 (byte-for-byte
  the same file at `78ae6c5d` and at the change). Its docblock states where it bypasses the product.

## Method

The baseline is the pre-M2 source (`git archive 78ae6c5d apps/api`, extracted to a throwaway
directory sharing this checkout's `node_modules`); the change is the branch tip. Both ran the same
harness against the same migrated database (PostgreSQL 16.13), **interleaved**: baseline, change,
baseline, change. Each run takes two timing rounds of 5 warm-ups and 40 samples per configuration,
so there are four rounds of each. Machine: `Intel(R) Xeon(R) Processor @ 2.80GHz`, 4 cores, 16 GiB,
Node `v22.22.2`, a shared cloud container.

Non-vacuity held in every run: at _n_ links each way, exactly _n_ of the downstream plan's activities
carried a derived bound in each direction (the harness throws otherwise).

## The counting limb: passes

| Links each way | Baseline queries | Baseline calendar resolves | Change queries | Change calendar resolves |
| -------------- | ---------------- | -------------------------- | -------------- | ------------------------ |
| 0              | 4                | 1                          | 4              | 1                        |
| 10             | 6                | 1                          | 16             | 12                       |
| 100            | 6                | 1                          | 16             | 12                       |

Equal at 10 and at 100 in both builds, and the no-edge path is unchanged at 4 queries and 1
resolution. The ten extra queries are the ten remote calendars, each loaded once
(`resolveCalendar`, one `calendar.findFirst` per distinct id); the twelfth resolution is the
all-minutes port for a `TWENTY_FOUR_HOUR` lag, which issues no query. There is no
`RESOURCE_DEPENDENT` endpoint in this fixture, so the driving-calendar read is skipped
(`loadDrivingCalendarMapForRows` issues nothing); the unit counting stub in
`schedule.service.spec.ts` covers that read (equal at 10 and 100, red uncached 14 → 140).

## The timing limb: `buildEngineGraph(D)` at 100 links each way, milliseconds

| Pairing                     | Baseline p50 | Baseline p95 | Change p50 | Change p95 | Added p95 |
| --------------------------- | ------------ | ------------ | ---------- | ---------- | --------- |
| Run 1, round 1              | 16.5         | 21.8         | 48.5       | 59.4       | +37.6     |
| Run 1, round 2              | 18.1         | 27.4         | 51.8       | 63.7       | +36.3     |
| Run 2, round 1              | 17.7         | 23.5         | 48.4       | 78.4       | +54.9     |
| Run 2, round 2              | 20.1         | 35.0         | 44.2       | 57.9       | +22.9     |
| **Median of the four p95s** |              | **25.5**     |            | **61.6**   | **+36.1** |

- **The baseline's own spread** at 100 links: p95 21.8–35.0 ms, **13.2 ms**, on a fixture that did
  not change (M0 recorded 7.0 ms). The change's: 57.9–78.4 ms, 20.5 ms.
- **The one pairing over the bar** is the round whose change sample reached a maximum of 119.1 ms
  against 60–68 ms in the other three; its p50 (48.4 ms) is in line with the rest. That is the shape of
  a noisy sample on a shared container, not of a slower code path, but one pairing is not enough to
  say so and it is not claimed.
- **The p50 is the steadier reading**: +24.1 to +35.3 ms, median about +30 ms.
- **Where the time goes** (an inference from the counts, not a profile): the ten added queries are
  the ten remote-calendar loads, issued one after another on the transaction's connection, so about
  three milliseconds each. That is the cost the spec's risk table accepted
  (`feature-spec.md`, the Performance row: "one `resolveCalendar` per distinct remote calendar"); it
  grows with the number of distinct remote calendars and not with the number of links.

At 10 links each way the added p95 is +17.1 to +29.9 ms across the four pairings, and at 0 links
it is within the noise
(+0.4 to −6.5 ms), which is the no-edge fast path the parity argument rests on.

## What would settle it

The same four-run sitting on the PostgreSQL 17 host. If the added p95 there stays under 50 ms in every
pairing, FC-6's timing limb passes outright; if it does not, the obvious lever is batching the remote
calendar loads into one query per recalculation, which the counting limb already permits.
