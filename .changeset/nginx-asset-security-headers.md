---
'@repo/web': patch
---

Send the security headers (`nosniff`, `Cross-Origin-Resource-Policy`, the CSP and the rest) on hashed
assets, `/theme-boot.js` and `/favicon.svg`, which answered with `Cache-Control` and nothing else.
