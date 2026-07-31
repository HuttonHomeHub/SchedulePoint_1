---
'@repo/api': patch
---

Add the seed catalogue's foundation: the pure `SeedSpec` model and the HTTP seeder (ADR-0066)

Internal tooling — no runtime behaviour changes. The API gains one unit test pinning its enums
against `@repo/seed`'s hand-maintained copy, so a new enum member cannot silently make a
capability unseedable.
