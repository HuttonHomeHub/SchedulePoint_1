---
'@repo/api': patch
'@repo/web': minor
---

The staff console is reachable from the account menu, and the Content-Security-Policy the image
ships now matches the one the compose files state.

**A Staff console item appears in the account menu** for allowlisted, verified accounts. Everyone
else sees no such item — omitted rather than shaded, so it is indistinguishable from a product with
no console at all. The gate is a live check against the API, not a build-time flag: staff-ness is
read from `STAFF_EMAILS` on the server, which the browser cannot see and an operator changes without
a release. The console shipped reachable only by typing `/staff`, which meant it could be deployed,
working and unfindable.

Refusals of that identity check are deliberately **not** audited. It is asked by the app for every
reader, so a refusal is the expected answer rather than evidence, and recording it would fill the
audit log with "somebody opened a menu" and bury the refusals that mean something — a caller who
knows the console's panel URLs and is trying them. Those are still recorded.

**Fixed: the web image's default policy carried no violation reporting.** The directives were added
to the compose files when the report sink shipped and not to the image, so a deployment whose own
compose omits the web environment block ran a policy that reported nothing — every page loading
normally while the staff console's Security panel stayed permanently empty, which reads as "the
policy is clean". The image's defaults now match, and a check asserts all three sources agree.
