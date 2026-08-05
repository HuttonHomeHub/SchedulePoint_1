---
'@repo/web': patch
---

**Shared plan links now show the diagram.** The read-only share view rendered its header, toolbar
and legend and then left an empty box where the plan should be — the canvas was being given a height
of **one pixel**. Everything else worked, which is why it looked like the data had failed to load
when it hadn't. Anyone you have already sent a link to will see the plan on their next visit; the
links themselves are unaffected.

**Signing out no longer logs an error.** The app was asking the server whether you were signed in
immediately after signing you out, and the browser reported the inevitable refusal in the console.
It now trusts what it just did. Signing out also clears the previous session's cached data properly,
so nothing of yours is left in memory for the next person to sign in on a shared machine.
