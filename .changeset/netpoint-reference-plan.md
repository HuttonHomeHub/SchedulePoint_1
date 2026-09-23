---
'@repo/seed': minor
'@repo/seed-http': minor
'@repo/seed-cli': minor
---

Add a `reference` tier to the seed catalogue, and its first plan: PMA's NetPoint power-plant example, transcribed with its own rows and dates (`--tier reference`). A seed activity can now state its `laneIndex`; the runner forwards it on create only when stated, so every other tier still leaves the row to the server.
