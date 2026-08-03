---
'@repo/api': patch
---

Let the mail credential actually reach the API container. `MAIL_SMTP_URL` and `MAIL_FROM` were added
to the environment schema and documented, but neither compose file listed them under the api
service's `environment:` — and a variable reaches a container only by being listed there, not by
living in a `.env` beside the compose file, which is used for interpolation. So the transport was
configurable in theory and unreachable in practice on the deployment that runs these files.
`TRUSTED_PROXY_IPS` had the same gap while `docker-compose.release.yml`'s own header names it as
required in production; `PLAN_EDIT_LOCK_ENFORCED` and `LOG_LEVEL` are forwarded for the same reason.

An empty optional variable now means **absent** rather than invalid. `MAIL_SMTP_URL: ${MAIL_SMTP_URL:-}`
always defines the variable, so a plain `.min(1).optional()` would refuse to boot on the ordinary
"mail is not configured yet" case — the opposite of optional.
