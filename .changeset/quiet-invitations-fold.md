---
'@repo/web': patch
---

Members: the Pending invitations table no longer wraps. `Sent` and `Status` move out of columns of
their own and under the invited address, which is where a fact about a row belongs (ADR-0146 D4).
In the narrow grid column that section sits in, all three of its text columns previously wrapped at
every width measured — the address broken mid-token, and `Expires 26 Sept 2026, 16:57` over four
lines inside 62px — and at 1280 the table overflowed its own card, putting `Revoke` off-screen.
Both facts stay in the row and now carry their own words; `Expired` is still a word, not a colour.
