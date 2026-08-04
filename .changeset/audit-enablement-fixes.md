---
'@repo/types': minor
'@repo/api': minor
'@repo/web': minor
---

fix: filtering the audit log by two categories at once no longer fails

Choosing **Deletions** and **Access** together — or Deletions and Settings — was rejected by the
API. The limit on how many event kinds one request may name was written down as a number when the
log had twenty of them; the log now has thirty-nine, and two ordinary chips came to more than the
old limit allowed. The limit is now worked out from the list of events itself, so it cannot fall
behind again.

Also from the same review pass:

- An import that succeeded could return an error if its own log entry failed to save — and leave the
  plan locked for editing. The entry is now written on a best-effort basis, matching what the code
  around it already said it did: a missing line in the log, never a failed import.
- The audit log's description of what it records had fallen a milestone behind what it actually
  records — it named deletions inside a plan but not scheduling settings, baselines, calendar and
  resource changes, or imports. It now describes the rule rather than listing examples.
- "Clear filters" looked unavailable while still reacting to the mouse.
- The filter row is no longer boxed, matching every other filtered list in the app.
- The Outcome control is no longer announced twice by a screen reader.
