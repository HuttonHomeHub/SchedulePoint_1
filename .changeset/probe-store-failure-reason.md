---
'@repo/web': patch
---

Canvas benchmark: a reading that failed to record now says why, and does not offer a retry that cannot work.

The panel showed one sentence — "These figures were measured but NOT recorded." — for every
failure, beside a live **Retry recording** button. That is right for a dropped connection or a
server error, where pressing it is exactly what an operator should do. It was wrong for a rejected
reading: the server refuses that body, so the same body is refused again, and the panel was
inviting a press that could never succeed with nothing on screen to tell the two apart.

The status is now carried into the message, and the button is shaded with a reason where a retry
structurally cannot help. A rate limit still offers the retry — it is the one refusal worth
pressing again after a wait.
