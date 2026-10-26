---
'@repo/interchange': minor
---

Both schedule readers now carry activity notes instead of only counting them. A P6 XER `TASKMEMO` row, and an MS Project task's `<Notes>`, become plain-text notes on the activity: HTML is converted to text, entities are decoded, control characters are removed, a note over 5,000 characters is split at a paragraph or line break, and rich-text (RTF) notes are left out. The import report gains a `notes` count, and says in one line each when formatting was removed, when notes were split, and when notes were left out and why. A file with no notes reports exactly what it did before.
