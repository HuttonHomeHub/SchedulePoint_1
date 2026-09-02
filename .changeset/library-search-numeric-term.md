---
'@repo/web': patch
---

A numeric search term in a URL now reaches the search box. Opening or pasting `…/calendars?q=2026` filtered nothing and showed an empty Search field, because the router hands a reader the number `2026` rather than the text — and every filter in the app tested for text. `true`, `false`, `null` and `[…]`-shaped terms behaved the same way. They now all arrive as what was typed.
