---
'@repo/api': minor
'@repo/types': minor
---

Add the cross-plan revision comparison: compare a revision of one plan against a
revision of another, matched on activity code.

An import always targets a new plan, so a re-issued programme arrives as a sibling
plan rather than a baseline — and the existing comparison, which matches on
activity id, has nothing to say about two plans whose ids name nothing in common.

The new org-scoped `GET …/cross-plan-revision-compare` reports the correlation
coverage first, then the same delta, change list and geometry the plan-nested
route returns. Two plans that share no codes get a 200 with a typed reason and no
delta rather than a fabricated one. Every activity id resolves in the anchor plan;
a row that exists only in the other plan carries a null id, so a client omits its
reveal control rather than offering one that navigates nowhere.

The plan-nested route is unchanged.
