---
'@repo/web': minor
---

feat(web): a Corporate theme — navy chrome, amber actions

A fourth entry in the theme picker, alongside Light, Dark and System. It is a different kind of
thing from those three: they are colour schemes, this is a brand skin — deep navy chrome (top bar
and Project Explorer) wrapped around a light working canvas, with amber as the action colour for
buttons, active states and activity bars.

Two decisions worth knowing about, because they are visible:

- **Amber never appears as text or as a line on a light background.** Amber on off-white is 1.9:1,
  which is unreadable and fails the accessibility bar for both text and focus indicators. It is used
  the way it actually works — as a fill carrying navy text, at 7.9:1. Focus rings are navy on light
  surfaces and amber on the navy chrome, where amber is legible.
- **Near-critical activities are bronze in this theme, not amber.** Amber is the ordinary bar colour
  here, so near-critical had to move or the two would have been indistinguishable on the diagram.
  Critical stays red, and the dashed outline still marks near-critical regardless of colour.

Your existing theme choice is untouched, and Light and Dark render exactly as before.
