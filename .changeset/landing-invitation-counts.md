---
'@repo/api': minor
'@repo/web': minor
'@repo/types': minor
---

The organisation landing separates live invitations from expired ones, and the two counts now
agree with the list they link to.

`pendingInvitationCount` is **replaced** by `liveInvitationCount` and `expiredInvitationCount`.
It summed two facts a reader acts on differently — one they chase, one they must re-send, since
`accept()` refuses an invitation past `expiresAt` — and it filtered on `status` alone, so it
counted soft-deleted rows that `GET …/invitations` excludes. That is why the landing could say an
invitation was pending while Members showed none.

Both counts and the list now use one shared predicate, computed against a single instant, so they
cannot mean different things by "pending". Both fields are omitted together for a reader without
`invitation:read`, never sent as `0`.
