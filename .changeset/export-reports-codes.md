---
'@repo/api': patch
'@repo/interchange': patch
---

An export now says when it leaves out a plan's codes. A P6 (XER) or MS Project file does not carry codes yet, and a plan whose swimlanes are made from a code is written as having no swimlanes; until now the export report said nothing about either. It now names how many code types were left out and which code the swimlanes come from. The exported file itself is unchanged.
