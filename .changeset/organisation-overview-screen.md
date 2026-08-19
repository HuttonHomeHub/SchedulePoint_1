---
'@repo/web': minor
---

The organisation landing page is now an overview rather than a welcome card.

`/orgs/:slug` — where every sign-in lands — used to show a card explaining that you could select a
plan from the Project Explorer one column away. It now answers the question a planner actually
arrives with: **Recently changed** lists up to eight plans in order of last change with who changed
them and when, and **Needs your attention** (for Planners and Org Admins) lists the editing locks
you are holding, anyone waiting on one, pending invitations and deleted work about to expire.

A brand-new organisation gets a role-aware first step instead: an Org Admin or Planner is offered
"Add your first client"; a Viewer or Contributor is told who can.
