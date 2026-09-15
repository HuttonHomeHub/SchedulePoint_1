---
'@repo/web': patch
---

The screenshot harness can reach the staff console. Its `/staff` shot has been on the list all
along and could never produce a picture: it signed up a timestamped address against an allow-list
the API reads before it boots, and the guard demands a verified address whose token is stored
hashed. The harness now uses a knowable address and receives the verification mail through the
same SMTP sink the journeys use, so the console can be photographed for the first time.
