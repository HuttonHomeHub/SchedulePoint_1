---
'@repo/web': patch
---

Two fixes from watching the deployed app's console during the CSP report-only window.

**No more 404s when opening a plan.** The plan workspace reads the project behind the plan and the
client behind the project, so on first render — before the plan has loaded — both ids were empty and
the app asked the API for `…/projects/` and `…/clients/`, taking a 404 each time. Those reads now
wait until they know what to ask for. Nothing was visibly broken; it was two wasted round trips and
two console errors on every plan you opened.

**The console no longer reports a Content-Security-Policy violation on the sign-in screen.** Zod
tests whether it is allowed to compile validators by trying it and catching the failure — harmless,
but the browser reports the attempt. It is now told not to try. Validation is unchanged.
