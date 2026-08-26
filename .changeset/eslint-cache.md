---
'@repo/web': patch
'@repo/api': patch
---

Add `--cache --cache-strategy content` to every workspace lint script. Measured on `@repo/web`:
114,951 ms cold to 8,032 ms with one file changed — a 14x win and 107 seconds off the local
pre-push gate, with no change to what is linted. CI is unaffected in either direction, since a
fresh runner has no cache file and always performs the full lint.
