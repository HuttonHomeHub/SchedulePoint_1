# Space Grotesk — provenance

Raised by the security review of ADR-0097 Landing A: two binary blobs had been committed with no
recorded source, no licence text and no way for a later contributor to confirm the bytes are what
was intended. Same-origin static assets are low-risk, but font parsers have a real memory-corruption
CVE history, and "vendored binary with no provenance" is below the bar the rest of this repository
holds itself to.

## What these files are

| File                            | Bytes | SHA-256                                                            |
| ------------------------------- | ----- | ------------------------------------------------------------------ |
| `space-grotesk-latin.woff2`     | 22288 | `0640890476fc1198ab4de571fb658de443c4d85b66466ec09534a8737ab1ce9d` |
| `space-grotesk-latin-ext.woff2` | 18940 | `952dddb45d2f96f71cbf3b7f510b24379afc3c89ea02fcf89d377b45d62c0166` |

- **Family:** Space Grotesk, a variable font with a single `wght` axis, 300–700.
- **Source:** the Google Fonts CDN, fetched 2026-08-19 from the URLs the
  `https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300..700&display=swap`
  stylesheet resolves to, taking the `latin` and `latin-ext` `unicode-range` blocks.
  Google Fonts v22 of the family.
- **Subsetting:** none by us. These are Google's own subsets, taken verbatim — the
  `unicode-range` declarations in `globals.css` are copied from the same stylesheet so the
  ranges and the files cannot disagree.
- **Upstream project:** https://github.com/floriankarsten/space-grotesk
- **Licence:** SIL Open Font License 1.1 — `OFL.txt` beside this file, taken from the upstream
  repository. The OFL permits embedding and redistribution; it requires the copyright notice and
  licence to travel with the files, which is what vendoring `OFL.txt` achieves and what its
  absence would have breached.

## Verifying

```sh
sha256sum apps/web/src/assets/fonts/*.woff2
```

against the table above. The hashes are recorded so a future reader can check the bytes without
needing a known-good checkout to diff against — git's content-addressing already makes tampering
evident to anyone comparing revisions, but not to someone looking at one.

## Why these are not loaded from Google

Three reasons, in the order they actually bind:

1. **Privacy.** Requesting a font from `fonts.gstatic.com` transmits every reader's IP address to
   a third party on the first paint of the sign-in page. A German court has found that arrangement
   to breach the GDPR, and this product has European clients. This is the strongest reason and it
   holds regardless of how the CSP is configured.
2. **The CSP.** `docker-compose.yml`'s policy is `font-src 'self'`, so on a host that has flipped
   `CSP_HEADER_NAME` to enforce, an external font is blocked — before first paint, and the symptom
   is the fallback stack, which reads as a design choice rather than a blocked request. Note the
   shipped default is **report-only**, so on a stock host this would be reported rather than
   blocked; the requirement is real but currently prospective.
3. **Availability.** A third-party origin on the critical path of the coldest page in the product is
   an outage we do not control.
