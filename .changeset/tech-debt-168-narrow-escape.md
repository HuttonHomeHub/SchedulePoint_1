---
'@repo/web': patch
---

Below the `lg` breakpoint, pressing Escape no longer closes and announces the Project Explorer
drawer. That drawer is not visible under 1024px — its column is hidden by CSS and the Explorer's
real surface there is the off-canvas sheet — so the keypress was writing a collapse to the reader's
stored panel preference and announcing a panel closing that was never open.
