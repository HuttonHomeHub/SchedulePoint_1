---
'@repo/web': minor
---

Every URL in the app now carries the value it was given. Search params used to be typed on the way in and quoted on the way out, so a sign-out wrote `?signedOut=%22true%22`, a numeric library search wrote `?q=%222026%22`, and a link composed elsewhere — a verification email, a URL you typed or edited, a bookmark from another tool — could arrive as the wrong kind of thing entirely and be discarded without a word. Addresses, tokens, dates, search terms and view names are now carried and read exactly as written. Two consequences worth knowing: a bookmark saved before this update shows its quotes once and heals on the next keystroke, and a search term made only of digits now works where it previously did nothing.
