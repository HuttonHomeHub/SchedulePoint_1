---
'@repo/web': minor
---

Alerts on the sign-in screens: the previous app's treatment, three tones, and one fact in one place.

Every validation message on the five authentication forms was being stated **twice at once** — once
in a tinted summary box at the top of the form and again under the field it belonged to. Reported on
sign-up ("password insufficient is displayed in two places"), but systemic. The rule now is that a
field's problem belongs to the field and the alert belongs to the form. Where several fields fail
together the box shows a count rather than repeating the sentences, and it stays silent for a single
problem, which the browser has already put the cursor in.

Messages take the previous app's alert styling — a 4px left accent bar, a soft tint of the same
hue and a leading icon — and gain a proper success and information treatment, so "Check your email",
"Password changed" and "If that address has an account…" are no longer plain grey sentences. The
floating, auto-fading placement is deliberately not reproduced: a message that disappears on a timer
is one a slow reader never gets.

Three things that happened silently now say so: signing out confirms it on the screen it lands on;
a rate-limited invitation-accept explains itself instead of showing a raw server string; and asking
for a new verification email checks the address you typed before making you wait for the server to
answer.
