---
'@repo/api': patch
---

A performance reading records which sitting it belongs to, and the protocol it was taken under.

`perf_probe_results` gains two additive nullable columns — `sweep_id`, so the readings from one
press of **Run all measurements** are recoverable as one sitting, and `frames_per_phase`, the frame
budget a phase actually ran for. Neither is backfilled: a NULL `sweep_id` means the reading was a
single press, which is true of every row taken before this, and a NULL `frames_per_phase` means the
protocol was not recorded rather than that it was the default.

The columns shipped dark. This releases the API that accepts them, which has to reach a host before
any client writes them: the global pipe rejects an unknown property with a 422 that loses the whole
POST, and `apps/web` and `apps/api` are independent images pulled independently.
