---
'@repo/api': minor
'@repo/web': patch
---

Harden the invitation-accept flow and fix accessibility gaps found in review.

API: invitation acceptance now enforces a verified email when
`AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
Auth's `requireEmailVerification`, so the email-match identity check becomes a
real proof of mailbox ownership the moment the verification-email loop lands
(default off for the alpha; ADR-0016).

Web: split the destructive colour into a solid `destructive` (button/chip
surface) and a readable `destructive-text` for coloured text and state borders,
so error text, invalid-field borders, and the form error summary meet WCAG AA
contrast in both themes. The invitation-link field now uses the shared input
primitive (proper focus ring), and the accept-invite screen announces its
loading→resolved transitions via a polite live region.
