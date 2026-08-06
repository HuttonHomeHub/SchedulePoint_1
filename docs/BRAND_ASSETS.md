# Brand assets served from the web origin

Files here are served at `/brand/*` by both the dev server and the production nginx image.

## `auth-panel.avif` — the public screens' panel photograph

The backdrop of the brand panel on the six pre-authentication screens
(`src/components/layout/brand-panel.tsx`, ADR-0077 §3 as amended in M7).

**It must be served same-origin, and that is not a preference.** The deployed
Content-Security-Policy is `img-src 'self' blob:` (`docker-compose.yml:81`), so the old app's
approach — hotlinking `images.unsplash.com` straight from CSS — is blocked outright on the real
site. Vendoring it here is the only way it renders at all.

### What the code expects

|                 |                                                                          |
| --------------- | ------------------------------------------------------------------------ |
| Path            | `apps/web/public/brand/auth-panel.avif`                                  |
| Format          | AVIF                                                                     |
| Referenced from | `brand-panel.tsx`, as a CSS `background-image` with `bg-cover bg-center` |

### It is decoration, and the screen works without it

The panel is three layers: the photograph, a navy wash over it at 80–90% opacity, and the
wordmark, motif and tagline on top. The wash is a token, not a value derived from the image, so:

- **A missing file degrades correctly.** The request 404s, nothing paints, and the navy fill beneath
  shows through with the mark and tagline still legible on it. This is why the panel could ship
  before the asset did.
- **The photograph never carries meaning.** The whole panel is `aria-hidden="true"`, so there is no
  alt text to write and nothing is lost by its absence.
- **It cannot break the contrast gate.** `styles/token-contrast.test.ts` computes ratios between
  **tokens**; the text sits on the wash, and the wash is a token the gate can read. That was
  ADR-0077 §3's original objection to a photograph, and the wash is what answers it.

### Choosing a replacement

Anything that reads as _construction_ and holds up at 80–90% navy: site, structure, materials,
drawings. Composition barely matters at that opacity — it is a texture, not a picture. Prefer a
dark or mid-tone original; a bright one fights the wash and shows banding through it.

Keep it small. This is on the LCP path of the coldest page in the product — the page a stranger
meets first, with an empty cache. A few hundred kilobytes is the budget, not a few megabytes.
