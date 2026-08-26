# Where the workspace's vertical space actually goes

> Measured 2026-08-26 with `apps/web/measure-toolbar/m3-below-canvas.spec.ts`, at 1920×1080 and
> 1646×1097, in **both** activities-panel states. Written because the product owner asked to
> maximise the canvas and the first thing to establish is how much of it is already there.

## The activities panel is already collapsed by default

`plan-workspace-toolbar.tsx` — `const [collapsed, setCollapsed] = useState(true)`, session-local,
with `useActivityPanelPrefs` persisting the **height** and not the state. So it is collapsed on every
load. There is no default to change.

This was ranked as the epic's biggest lever at an estimated ~205 px, from a screenshot in which the
product owner had expanded it. **Two of the three screenshots they sent show it collapsed** — the
evidence was already there and was not read. It is the §19 rule about re-verifying a problem
statement, failed in the session that shipped the ADR quoting it.

## What the panel costs when a planner does open it

| viewport  | canvas, collapsed | canvas, expanded | cost   |
| --------- | ----------------- | ---------------- | ------ |
| 1920×1080 | **776**           | 511              | 265 px |
| 1646×1097 | **793**           | 528              | 265 px |

Constant at 265 px, which is the panel's 280 px body less the handle row it replaces. That is a
planner's choice to make, not a default to fix.

## There is no hidden space below the canvas

The suspicion that prompted this probe was that ~283 px sat unaccounted below the canvas pane. It
does not. **In the default state the pane reaches the bottom of the viewport and `unaccountedBelow`
is 0** at both widths. The 283 px inferred from `m4-vertical-stack`'s ancestry chain was the
activities panel — because that harness expands it.

At 1920 in the default state: **chrome above the canvas 209 px, canvas 776 px (72 % of the screen),
status bar ~25 px.** The 41 px between the pane's top and the canvas's top is the ruler, which is
part of the diagram rather than chrome.

Above-canvas breakdown: app header row 36 + command band 121 + band padding 24 = the 181 px chrome
band, plus ~28 px of shell margin around the card.

## What is left to win, and what is not

| lever                          | value                             |
| ------------------------------ | --------------------------------- |
| Activities panel default       | **nothing — already collapsed**   |
| Command deck to one line       | ~58 px (chrome 209 → 151)         |
| Header re-sectioned into three | **0 px** — a quality change       |
| Anything below the canvas      | **0 px — there is nothing there** |

## The instrument's own caveat, stated rather than left

The probe walks blocks whose top is at or below the canvas pane's bottom **in document
coordinates**, so in the expanded reading it also lists the Project Explorer's destination `NAV`
(219 px) and its version footer (33 px). Those are in the **left rail** — beside the canvas, lower
down — not below it. They are in the output because the rule is geometric; they are not workspace
chrome and must not be counted as such.
