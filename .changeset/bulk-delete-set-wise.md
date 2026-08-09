---
'@repo/api': patch
---

A large bulk delete no longer blocks everyone else on the plan.

Deleting activities in bulk swept them one at a time — five statements per activity, up to about
ten thousand of them, every one holding the lock that serialises structural writes on the plan. For
the duration, nobody else could recalculate, edit or regroup anything in that plan. It is now four
statements for the whole batch.

Transactions also gained explicit timeouts, which the API had never had: a 15-second ceiling
generally, and 60 seconds on the deliberately batched writes.
