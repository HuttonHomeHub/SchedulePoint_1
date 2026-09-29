---
'@repo/api': patch
---

A request body the API cannot read (truncated or malformed JSON, an aborted upload, a corrupt
gzip/br/deflate body, an unsupported charset or content encoding) now answers a 400 or 415 in the standard error envelope with a fixed message. Malformed JSON
was already a 400 but repeated the parser's own error text; the other cases were an opaque 500
logged as a server fault. The API also no longer parses
`application/x-www-form-urlencoded` bodies, which nothing used and which took up to 100 KB from
anonymous callers.
