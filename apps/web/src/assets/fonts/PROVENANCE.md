# Vendored typefaces — provenance

Raised by the security review of ADR-0097 Landing A: two binary blobs had been committed with no
recorded source, no licence text and no way for a later contributor to confirm the bytes are what
was intended. Same-origin static assets are low-risk, but font parsers have a real memory-corruption
CVE history, and "vendored binary with no provenance" is below the bar the rest of this repository
holds itself to.

## What these files are

| File                            | Bytes | SHA-256                                                            |
| ------------------------------- | ----- | ------------------------------------------------------------------ |
| `ibm-plex-sans-latin.woff2`     | 45712 | `e2291e842cf5af167122a22881a740c7f2dda7716f1e8cd76680264f4a859470` |
| `ibm-plex-sans-latin-ext.woff2` | 30964 | `d160e20920ae4d6556518d352d3af27a74e9b0de3d8fe17b1c1044fc75aa2f81` |
| `ibm-plex-mono-400-latin.woff2` | 14708 | `08949f728dc52d528e69b1667d15c89a5686a4ee9a296ff90983985f99c380f7` |
| `ibm-plex-mono-500-latin.woff2` | 14888 | `01d285447409c8a588692162439a038b8cbd7871309ee20267b0d2d91c6e8e22` |

- **Families:** IBM Plex Sans (variable, single `wght` axis 400–700) and IBM Plex Mono (static,
  weights 400 and 500).
- **Source:** the Google Fonts CDN, fetched 2026-08-24 from the URLs that
  `https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400..700` and
  `…?family=IBM+Plex+Mono:wght@400;500` resolve to, taking the `latin` and `latin-ext`
  `unicode-range` blocks. Google Fonts v23 (Sans) and v20 (Mono).
- **Subsetting:** none by us. Google's own subsets, verbatim — the `unicode-range` declarations in
  `globals.css` are copied from the same stylesheets so the ranges and the files cannot disagree.
- **Upstream project:** https://github.com/IBM/plex
- **Licence:** SIL Open Font License 1.1 — `OFL-IBM-Plex.txt` beside this file, taken from the
  upstream repository. The OFL permits embedding and redistribution; it requires the copyright
  notice and licence to travel with the files, which is what vendoring the licence achieves and
  what its absence would have breached.

## Why only these four files

- **Mono ships `latin` only.** It renders durations, dates and counts, and never a person's name,
  so the accented range has no reachable caller. Sans keeps `latin-ext` precisely because client
  and contractor names need it.
- **Mono ships two weights.** The design uses no heavier monospace. A third static weight costs
  15 kB for a difference invisible at the 9.5–11 px these numerals are set at. If a heavier mono
  is ever wanted, add the file rather than letting the browser synthesise it — synthetic bold
  smears a monospace badly.

## Verifying

```sh
sha256sum apps/web/src/assets/fonts/*.woff2
```

against the table above. The hashes are recorded so a future reader can check the bytes without
needing a known-good checkout to diff against — git's content-addressing already makes tampering
evident to anyone comparing revisions, but not to someone looking at one.

## A measured fact worth keeping

Digit advance widths, measured with fontTools on these exact files:

| Face                    | Digit widths | Spread                      |
| ----------------------- | ------------ | --------------------------- |
| IBM Plex Sans           | 600–600      | **0% — tabular by default** |
| IBM Plex Mono           | 600–600      | **0% — tabular by default** |
| Space Grotesk (removed) | 404–638      | 57.9% — proportional        |

That is why `font-variant-numeric: tabular-nums` is no longer load-bearing for the face we ship —
and why it is nonetheless kept, to protect the proportional fallback stack. See the reasoning in
`token-architecture.test.ts`.

## Why these are not loaded from Google

Three reasons, in the order they actually bind:

1. **Privacy.** Requesting a font from `fonts.gstatic.com` transmits every reader's IP address to
   a third party on the first paint of the sign-in page. A German court has found that arrangement
   to breach the GDPR, and this product has European clients. This is the strongest reason and it
   holds regardless of how the CSP is configured.
2. **The CSP.** `docker-compose.yml`'s policy is `font-src 'self'` (ADR-0074), so on a host that has
   flipped `CSP_HEADER_NAME` to enforce, an external font is blocked — before first paint, and the
   symptom is the fallback stack, which reads as a design choice rather than a blocked request.
   Note the shipped default is **report-only**, so on a stock host this would be reported rather
   than blocked; the requirement is real but currently prospective.
3. **Availability.** A third-party origin on the critical path of the coldest page in the product is
   an outage we do not control.

## History

Space Grotesk was vendored here on 2026-08-19 (ADR-0097) as the product's first-ever deliberate
typeface, and removed on 2026-08-24 when the workspace redesign changed the face to IBM Plex. That
was a change of direction rather than a correction of a mistake: it was chosen properly from a
specimen, and it was replaced because the new design was chosen from three fully-realised
directions rendered on the real workspace, which is a stronger test than a specimen sheet.
