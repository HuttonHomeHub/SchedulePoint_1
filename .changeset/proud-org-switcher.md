---
'@repo/web': minor
---

Add organisation onboarding, an org switcher, and organisation-scoped routing.
A user with no organisations is routed to a create-your-first-organisation
screen; the header gains an accessible organisation switcher; and the app routes
under `/orgs/$orgSlug` with the URL as the authoritative active organisation (a
remembered "last active org" drives the home redirect). Covered by a component
test and an extended Playwright journey (sign up → onboard → land in the org).
