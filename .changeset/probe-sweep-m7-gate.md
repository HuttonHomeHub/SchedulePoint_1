---
'@repo/api': patch
'@repo/web': patch
---

The performance panel's gate pass, and four corrections that reach a reader.

The full-screen measurement overlay now takes the whole page out of the keyboard's reach while it
covers it, rather than only this panel's own controls — six other panels sit beside it on the staff
console, and Tab from Stop was landing on a control hidden behind the canvas.

A complete sweep is **six readings**, not four: the caption and the partial notice were counting
steps and calling them readings, over a table that shows one row per reading.

The API's published spec is corrected in two places. `counts` and `thresholds` are named on the
response with the same shapes the request already names, both history reads declare the 422 an
out-of-range `limit` reaches, and `framesPerPhase`'s description no longer halves the frame count
for a paired measurement.

Each sitting's Copy button, its own machine facts and its warnings are now reachable to assistive
technology from inside the table they belong to, and a retry announces that it is running.
