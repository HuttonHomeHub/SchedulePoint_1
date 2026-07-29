---
'@repo/web': patch
---

Add the `Tabs` design-system primitive (no consumer yet)

A hand-rolled WAI-ARIA APG tablist in `components/ui/tabs.tsx`: roving
`tabindex`, Arrow/Home/End with wraparound, automatic activation, and text
markers that extend a tab's accessible name rather than tinting it. Built for
`ActivityEditorDialog` (ADR-0060) and not yet wired to anything, so nothing
user-visible changes.
