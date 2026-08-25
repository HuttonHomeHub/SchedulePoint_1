# @repo/web

## 0.105.0

### Minor Changes

- [#385](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/385) [`47ec27c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/47ec27cf297ae2b9329cea1b9830d2597172ed46) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - One label geometry on the plan's command surface.
  
  The deck's labels sat on two different baselines and the eye tracked the difference along the row. A
  plain command stacked its label under its icon while a split-button or popover trigger kept it
  beside — nobody chose that, it was one `if` having a side effect on layout. Every control is now
  inline: worst within-row label spread falls from 12 px to 3 px, and the deck is 8 px shorter at
  1440 and above.
  
  At 1280 the cards wrap from two lines to four, which costs 108 px of diagram height. That trade was
  made deliberately, for the alignment win at the widths a plan is usually worked on.
  
  The group captions take the same control height as everything else, which is what a control that
  folds its group and holds a tab stop should always have had.

## 0.104.0

### Minor Changes

- [#383](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/383) [`8c2ae84`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8c2ae84a003d072742e5accb97001ab068a210b8) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The plan's facts move into the activities row.
  
  The workspace foot carried two bands where one would do, and both said "Activities" — the row's own
  heading and the status bar's activity count, the same subject rendered twice. The count now names
  the panel and gives its size, so one control does both jobs and the word appears once. The canvas
  gains about 25 px at every width where that row exists.
  
  Where the facts render is decided by a registry rather than a branch: the collapsed activities bar
  mounts an outlet, so the facts land in the row a planner is already reading; expanded, or below the
  `md` breakpoint where that bar is not mounted at all, they render in the shell's status row exactly
  as before. That fallback is not a courtesy — without it the merge would delete the plan's facts on
  the narrowest screens, which have the least room to lose them.
  
  Arming a tool or selecting an activity still costs the canvas no height, asserted as an equality in
  a real browser rather than as a claim.

## 0.103.0

### Minor Changes

- [#381](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/381) [`ecefbe9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ecefbe9dec6cf7bc6e1cd9d9222f9807f4186250) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The plan workspace redesign, part two — the frame, the diagram and the standards.
  
  **Recalculate leaves the command surface for the status bar**, where it appears only when the
  schedule is actually behind the plan. Auto-recalculation has fired on every structural edit since
  ADR-0032 M3, so on a healthy plan that command re-ran a calculation that had already run. It now
  names how much is owed, distinguishes a failure from work not yet computed, and shades with its
  reason rather than vanishing when the pen or a data date is missing.
  
  **The 48 px tool rail is deleted and the Project Explorer is docked on the leading edge** —
  resizable 200–420, folding to a 34 px spine that keeps the organisation's destinations, because
  folding the column is how a planner buys canvas width and it must not take the product's secondary
  navigation with it. The brand, the organisation switcher and the account menu return to a header row
  that renders at every width again.
  
  **The diagram is ruled both ways and its ground is quiet**: the diagonal weekend hatch is gone, the
  alternating month band defaults off (its `View ▸ Structure` switch stays), and lane hairlines give a
  bar something to sit on. They are derived from the viewport, so the layer costs the same on a
  2,000-activity programme as on a five-activity plan.
  
  No feature flag: a `VITE_` constant is inlined at build time and has never been an operator
  rollback, so the rollback here is reverting the commit.

## 0.102.0

### Minor Changes

- [#379](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/379) [`faa0c1b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/faa0c1b35ca586662fcbb4c9461ee05083b12b72) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Redesign the plan workspace, starting with the overflow menu.
  
  The command surface no longer hides anything. Its four groups — View, Find,
  Author and Plan — wrap onto as many rows as they need and each one folds away
  from its caption, so every command is visible and named at once. The `⋯` menu
  is gone, along with the width ladder behind it: the band floors, the
  hysteresis, the priority ranking and the label-demotion pass that four
  successive attempts had spent themselves tuning. All of that existed to answer
  one question — what should this surface hide when it runs out of width — and a
  surface allowed to become two rows never runs out.
  
  Buttons stack their icon above a small label rather than beside it, which is
  roughly half the width for the same information and is what makes labelling
  every command affordable. The six genuinely universal icons — zoom, fit, undo,
  redo, print — keep their labels off.
  
  The product is now set in IBM Plex Sans, with IBM Plex Mono for dates,
  durations and counts.
  
  The chrome reads as chrome again. The command band is a card with a real edge
  and a shadow, floating on a soft gradient rather than sitting flush against
  white, and the diagram sits on its own paper surface. The plan's two mode
  switches — Diagram/Gantt and Early/Visual — move back beside the pen on the
  identity line, where they say what state the plan is in rather than competing
  with the commands they govern.
  
  The diagram loses its weekend hatching. On a full programme that striping
  covered most of the picture and was louder than the schedule inside it;
  weekends are now a quiet tint that stays behind the work.

## 0.101.0

### Minor Changes

- [#369](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/369) [`dcb8022`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcb802269b87276711cb7051cf8fe67099948071) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Confirm before discarding unsaved work.
  
  The app had no unload handler and no navigation blocker at all: a planner with unsaved activity
  edits could reload or close the tab and lose them with no prompt. Four surfaces now declare what
  they hold — the activity editor, the create dialog, the calendar form and its exceptions editor —
  and a reload, a tab close or a browser navigation confirms first, naming which scopes are at risk
  and saying when the work can no longer be saved because the edit lock has gone.
  
  It also fixes a live defect. The editor's own discard confirmation named three dirty scopes while
  the editor holds six — the three Progress panels each own a form — so a changed weighted step closed
  in silence. It now confirms on all six.
  
  The calendar form needed its own treatment: its seven-day working week lives outside react-hook-form
  by design, so `isDirty` could never see it. A planner could rewrite every day's hours and the form
  would report itself clean.

## 0.100.0

### Minor Changes

- [#367](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/367) [`4f7071a`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4f7071a13bde17ab492a8a3b42d28ba68ef22a37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Move Better Auth from `~1.6.28` to `^1.7.1`, lifting the deliberate hold.
  
  The pin existed to stop 1.7 arriving unattended, because 1.7 scopes account identity by an `issuer`
  column and reads it in the sign-in predicate. That column shipped in the previous release, so the
  library can now follow. Verified with the suite that found the problem: `scripts/e2e-local.sh api`
  goes from the recorded 522-of-559 failures at 1.7 without the column to **565/565**, plus the three
  account journeys (public screens, password reset with session revocation, change password,
  verification enforcement) against a real API.
  
  Both workspaces move together. That was the intended default, but it is also **forced**: the
  dependency-claims register holds one verified version per package and resolves a package by the
  first matching store directory, so a split estate makes the gate verify the API's claims against the
  web client's copy — which it did, silently and green, while the API ran 1.7.1. The bundle
  falsification condition was measured anyway and passes with room: **+74 bytes gzip** on the initial
  bundle against a 5,120-byte threshold.
  
  All 37 `better-auth` citations were re-anchored at 1.7.1. Seven were unchanged, 25 moved, and five
  could not be placed mechanically and were read by hand — two of those are refactors that preserve
  the behaviour but need new anchors rather than shifted line numbers.

## 0.99.3

### Patch Changes

- [#363](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/363) [`c18f3f7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c18f3f76a2f02b5ba5b0764a60100dc931f6ae03) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Update @changesets/changelog-github to 1.0.0.

- [#364](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/364) [`712971e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/712971efa3ffa6898f1feaed75dd350c2f726168) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Migrate the release workflow to changesets/action v2.

- [#361](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/361) [`1ea04a1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1ea04a1c64cd790bba657e62ce97dba2454167b7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Update @changesets/cli to 3.0.1 and opt private packages back in to versioning.

## 0.99.2

### Patch Changes

- [#360](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/360) [`ebb9b6f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ebb9b6fdc8afa7d2998c5007f5782689e400b3e4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Update @playwright/test to 1.62.1.

- [#358](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/358) [`6135db4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/6135db4d38db99d086151936cd5f35b96d46a503) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Update react-hook-form to 7.86.0 and lucide-react to 1.33.0.

## 0.99.1

### Patch Changes

- [#356](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/356) [`592ef63`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/592ef63289273a9d34738263f13c13495456149c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Update Better Auth to 1.6.28 and pin it to patch releases until the 1.7 account-issuer migration is designed.

## 0.99.0

### Minor Changes

- [#353](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/353) [`3098f08`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3098f0865b821ff73048b7f312a73460780ab35d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The TSLD's date marks become axis markers in the ruler, so no date label covers an activity bar.

  `Data date`, `Today` and the cursor date readout were painted as pills at a fixed screen y on the
  scene canvas — chrome drawn onto a surface that scrolls — so a label printed over whichever lane the
  planner had panned to the top. On a 1646 px screen the words `Data date` printed across the first
  activity's name.

  All three are now rendered in the existing 40 px ruler band, on two rows: the cursor readout above,
  `Data date` and `Today` below. The vertical rules stay on the diagram, where a full-height line means
  something at every lane. The diagram gains no chrome and loses none — the band was already there.

  When the data date and today are too close for both words, `Data date` keeps its label and `Today`
  keeps its dashed rule, which the legend already names.

## 0.98.2

### Patch Changes

- [#349](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/349) [`9beef18`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9beef18352af700d6362e7ccd188b006f4cd580c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Documentation only: records the org-less shell rule as ADR-0104 and, as ADR-0105, when a tech-debt
  row stops standing in for a Feature Spec. No product behaviour changes.

- [#351](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/351) [`fa3b14c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fa3b14c76aafab334b4c725b81351a8f8af6af6e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Below the `lg` breakpoint, pressing Escape no longer closes and announces the Project Explorer
  drawer. That drawer is not visible under 1024px — its column is hidden by CSS and the Explorer's
  real surface there is the off-canvas sheet — so the keypress was writing a collapse to the reader's
  stored panel preference and announcing a panel closing that was never open.

## 0.98.1

### Patch Changes

- [#347](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/347) [`2c45e38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/2c45e38960adccd3c60b2c9359ab26bd3941aac5) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The app shell no longer offers the Project Explorer on the three authenticated screens that have
  no organisation. `/onboarding`, `/account` and `/me/activity` each rendered a ~300 px panel reading
  "Select an organisation to browse" — on `/onboarding` beside the card asking the reader to create
  their first organisation, where there is nothing to select by definition. The panel, its rail
  button and its below-`lg` sheet are withheld together, and the reader's persisted panel width and
  open/closed preference are left untouched by the trip.

## 0.98.0

### Minor Changes

- [#345](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/345) [`b6d3bbf`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/b6d3bbfaaf48ec6cddc0cccd5e56180a3f11304d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The exported diagram is the diagram.

  The exported PNG and PDF, and the printed diagram, now paint the seven layers
  the screen has been painting for months and the deliverable never did: weekend
  and non-working shading, alternating month bands, the three-tier gridline
  ladder, time-true link anchoring with arrowheads, the bar visual refresh,
  orthogonal link routing, and the fractional Today marker with its pill.

  Nobody had decided to leave them out — the canvas composed 25 scene keys and the
  export composed six, because nine features each added correctly to the screen
  and nobody re-read the export. The most consequential is link routing: without
  it a link could be drawn straight through an unrelated bar, which makes the
  reader disprove a relationship the picture appears to assert.

  Paper also gets an identity of its own rather than inheriting the app's theme,
  so the deliverable stays light whatever the screen is doing.

## 0.97.1

### Patch Changes

- [#343](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/343) [`144b2aa`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/144b2aab1480d700a188484707e129384bae049f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Print and export on paper that is light by declaration, not by agreeing with the screen.

  The exported PNG/PDF and the printed programme resolved their ground from the app's live
  `--background`, so the diagram panel followed the screen's theme onto paper. The paper trio now
  reads three `--print-*` tokens that no surface scope rebinds, and `PrintSurface.css` reads the same
  three rather than the hex literals it had been pinning by comment — measured, those had drifted from
  the values they claimed to mirror. The diagram's own colours still resolve from the canvas scope, so
  a printed diagram cannot drift from the one on screen.

  A structural gate replaces the comment that named its own trigger and was never acted on. It also
  rejects the frozen-literal fix the debt register had prescribed, which measurement showed would have
  paired white ink with the on-schedule bar at 3.56:1.

## 0.97.0

### Minor Changes

- [#341](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/341) [`fdb93d7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fdb93d778a6ab9cd9f6057416545afa343e318d2) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The light corporate theme. The application is now navy chrome and amber accents around light
  working surfaces — the same navy and amber the sign-in screen has always worn, so the front door
  and the product are one identity for the first time.

  The diagram gets a ground of its own, one measured step off the page, and a criticality ladder
  derived against it. Twelve categorical colours replace five, so grouping by WBS no longer reuses a
  fill on the sixth phase.

  Also fixes a defect that had been live since surface scopes shipped: the canvas painter resolved
  the page's colours rather than the diagram's, because a `@theme inline` alias is resolved once at
  the document root and cannot follow a per-surface rebind. The guest share view was a second
  instance, and its legend a third.

### Patch Changes

- [#341](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/341) [`fdb93d7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fdb93d778a6ab9cd9f6057416545afa343e318d2) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The activity editor opens as a dialog again (ADR-0101). It had been docked in the trailing
  context drawer, which caps at 420px — a form that was deliberately widened to 896px with a
  section rail _because 448px had already proved too narrow_. In the drawer it ran its
  narrow-viewport layout permanently: tabs overflowing sideways inside a panel that was itself
  scrolling, over a table scrolling sideways of its own. It now opens at the width and in the
  layout it was designed for, and the drawer keeps the Project Explorer — which no longer
  disappears when you edit something.

  Two colour values are softened while a light theme is prepared: the page foreground, which
  measured 14.62:1 against the canvas ground (more than double the AAA requirement, and the
  reason long sessions felt tiring), and the non-working-day hatch that was striping the diagram.

## 0.96.0

### Minor Changes

- [#339](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/339) [`200d99a`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/200d99a7a9166966d42e3ebf135e4c257aabb318) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The TSLD minimap (ADR-0100): a 200×120 overview panel in the diagram's bottom-right —
  an invariant picture of the whole programme (critical path survives the merge, data-date
  line included) with the live viewport as a rectangle on top. Drag the rectangle to pan,
  click outside it to jump, or drive it from the keyboard (arrows page-pan, Home/End reach
  the plan's first and last dated days) — the first unanchored keyboard pan the canvas has
  had. Off by default under `View ▾ ▸ Panels ▸ Minimap`; selection marker and Today line
  stay live without ever rebuilding the picture; measured to add nothing the eye can see to
  the pan path (paired falsification runs recorded in the spec).

## 0.95.1

### Patch Changes

- [#337](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/337) [`60a4ca5`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/60a4ca5c89b76fe0668165d81a540c7d9914881c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix two things in the plan workspace's context drawer.

  Pressing Escape to dismiss a confirmation inside the activity editor — "Discard unsaved changes?",
  or "Delete note" on the Notes tab — also closed the editor underneath it. A native confirmation is
  painted above everything else but still sits inside the panel, so the drawer was treating a keypress
  meant for the confirmation as one meant for it.

  And opening the editor said nothing to a screen reader. Pressing **Edit**, **Report progress** or
  **Steps** used to open a dialog, which a screen reader announces by itself; in the drawer it swapped
  the panel silently. It now announces what opened — and deliberately stays quiet when you simply
  select a different activity with the drawer already open, which is a change of subject rather than
  something opening. Closing the editor is announced too, which it was not.

## 0.95.0

### Minor Changes

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Graphite M2 — the plan workspace's shell becomes one CSS grid, so the command band can span the
  columns a context drawer will sit inside. Opening the drawer will change the band's width by zero
  because of where it is placed, not because anything measures it (ADR-0099). Nothing moves on screen:
  verified by pixel-diffing every screen at three widths against the same build without the grid.

  Completes the Graphite palette. `--card`, `--popover` and the canvas ground were still light, so
  every dialog, menu and popover painted low-contrast grey on white — 58 WCAG contrast failures on the
  base journey.

  Retires the `VITE_DESIGNED_CHROME` feature flag. The grid shell has to place the band and the body
  as siblings, so the flag's off-branch became a second layout of the shell rather than a guard; its
  two Playwright harnesses were converted first, and the theme-parity sweep now runs against the
  shipped shell.

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Graphite M3 — the Project Explorer rail becomes the leading edge of the app, top to bottom, and the
  top bar is deleted. The brand, the organisation switcher and the account menu move into the rail and
  stay reachable when it is collapsed. The plan's identity line joins the mode row rather than taking
  a row of its own, which is what turns the change into a real gain: measured, the diagram grows from
  576 px to 632 px at 1646 (+9.7%), with 184 px of chrome above it instead of 240 px.

  Adds a skip link — the app had none — because the rail now sits between a keyboard user and the page
  content on every screen.

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Graphite M4 — the plan workspace gains a context drawer on the trailing edge, resizable and
  persisted, and the Project Explorer becomes its first subject rather than a column of its own. The
  leading edge is now a fixed 48px tool rail carrying the brand, the organisation switcher, the
  drawer's panel buttons, the six organisation destinations and the account menu — none of them behind
  a toggle.

  The command band's width no longer changes when the drawer opens, closes or is resized. That is a
  consequence of where the band sits in the grid rather than of anything measuring it, and it is
  asserted in a browser at three drawer states.

  Escape closes the drawer as the outermost rung of the workspace's existing key ladder: it defers to
  any inner rung that already acted, ignores keystrokes typed into a field, and leaves an open dialog
  alone.

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Graphite M5 (first half) — the plan's mode switches (Early/Visual, Diagram/Gantt) move from the
  command band to the tool rail, and the project-finish read-out moves to the plan's identity line. A
  mode is not a command and a finish date is a fact, so neither belongs in a row of commands; together
  they were over 500px of a band that measurement showed does not fit at four of seven widths.

  The toolbar primitive gains a vertical orientation: it announces the axis it actually runs along,
  stacks its groups, separates them along that axis, and stays icon-only — and it opts out of the
  width ladder entirely, because a stack has no row to overflow.

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Graphite M5 (second half) — the plan's two command rows become one strip. Nothing is deleted: the
  same registry, the same seven-group taxonomy, the same pen gating, rendered into one toolbar instead
  of two. Measured, the chrome above the diagram falls from 184px to 135px and the diagram at 1646
  gains 18% over where this epic started.

  Merging the rows made two ranking bugs reachable that had been harmless on two. `Next conflict` was
  ranked by a rule written for the old Row 1, so on a plan that has conflicts it demoted into the `…`
  menu — the exact "a shading nobody opens the menu to see is not a shading" defect the conflict work
  was written to remove. And `Recalculate` was ranked by the order it happened to be registered in, so
  the only cue that a recalculation is running could not spin anywhere a planner would see it. Both are
  now ranked deliberately.

  The strip fits at every width from 960 up. Below that it scrolls rather than hiding controls, because
  eleven pinned items now share one budget where they used to share two.

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Graphite M6–M10 — the activity editor moves out of a modal dialog and into the trailing context
  drawer, so a planner can edit an activity and still see the diagram it sits in. Pressing **Edit**,
  **Report progress** or **Steps** on a selected activity now opens the drawer; below 1024px, where a
  drawer would have to cover the stage, the dialog is still the right chrome and is what you get.

  The plan also gains a **status bar** — activities, data date, project finish, the critical count, and
  whether a recalculation is running. `Recalculate` stops being a button that doubles as a status.

  The Gantt's grid pane becomes **draggable**: drag the divider and the activity-name column takes the
  difference, rather than the columns sliding over the bars. The floor is what the visible columns
  actually need, so it tracks the columns you have chosen to show.

  Two defects fixed on the way, both of which only appeared once the product was driven rather than
  unit-tested. Closing the drawer or the editor inside it dropped keyboard focus to the page body,
  which also silently disabled every keyboard shortcut in the workspace; focus now returns to the rail
  button that reopens the panel. And the editor's tab rail was sized against the window rather than
  against the panel it was in, leaving about 90px for the fields it labels — the tabs are a horizontal
  strip in the drawer.

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The app is now Graphite — a dark, near-neutral palette built for long sessions, with one rule
  underneath it: **cool means interface, warm means attention.** Azure is the only interactive
  colour, so anything blue is something you can press or have selected. Warm is reserved for the
  schedule telling you something: critical, near-critical, conflict, today.

  The most important change is one you would not have noticed was wrong. **A critical bar and an
  ordinary bar used to differ almost entirely in hue**, which is invisible at a glance, on a poor
  monitor, or to a reader with a colour deficiency. The three states now separate by _lightness_ as
  well — ordinary, near-critical and critical sit 3.1:1, 4.6:1 and 7.2:1 against the diagram ground
  and every pair is at least 1.5:1 apart, so you can read the critical path without inspecting it.

  Layout is unchanged in this release; the new workspace shape follows.

### Patch Changes

- [#335](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/335) [`977c3dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/977c3dd3121bc46cec4a21bbab156e18f87dc5c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix two links claiming to be the current page. The SchedulePoint wordmark links to the organisation
  overview, and the router marked it active on every organisation route rather than only on the
  overview itself — so alongside the navigation item that genuinely was current, a screen reader gave
  two answers to "where am I". The wordmark now marks itself current only on the overview.

  Also clamps the context drawer's width against the space available, so a stored width can no longer
  squeeze the diagram on a narrow screen.

## 0.94.0

### Minor Changes

- [#333](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/333) [`44f1c59`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/44f1c5951e010515e8e202c1efbb566d7701c37a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The diagram can tell its three criticality states apart, and the plan header gives you back a route
  to your project.

  **A near-critical bar and a critical bar differed by 1.34:1** — less than the amount at which a
  difference reads as intentional. Scanning a wall of bars, you recovered the distinction by
  inspecting a stroke rather than by looking. Critical is now a deeper red at **1.61:1**, and the
  separation is asserted by a gate rather than checked by eye.

  That was possible because **the diagram now has its own colour vocabulary**. Until now every bar
  fill was resolved from the page's tokens — so an ordinary activity was painted in the same value as
  a primary button, and re-colouring one meant re-colouring the other. The two are separate now, on
  the canvas and in the Gantt alike, which means one drawing ground and one bar palette across both
  views of the same plan.

  **The plan header:** the trail back to a plan's project is restored, having briefly been removed —
  the Project Explorer shows where you are but cannot open a client or a project, so that link was the
  only way there. The four mode switches (Early / Visual / Diagram / Gantt) stay visible beside the pen
  at every width.

  **Two controls changed shape.** The upstream-activity picker on a cross-plan link is now searchable
  — type to find, rather than scrolling a list that on a real programme runs to thousands. And a
  calendar row now shows `Edit` with its other actions one press away, instead of up to five buttons
  competing across the row; `Move to organisation` is shown-and-explained rather than hidden when your
  role cannot use it.

- [#333](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/333) [`44f1c59`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/44f1c5951e010515e8e202c1efbb566d7701c37a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - "Jump back in" — the organisation landing now offers the plans you were recently working in.

  Up to five, most recent first, for **every** role: it is the one personalised section a Viewer or
  Contributor gets, because it is your own history rather than a list of things to act on. Opening a
  plan puts it at the top; opening one already listed moves it rather than adding it twice.

  It costs **no extra request** — the remembered ids ride on the overview call the landing already
  makes (`?recentPlanIds=`), which is what made it acceptable on the first screen after every sign-in.

  The browser remembers **ids only, never a name**. That is what makes a renamed plan show its
  current name, a deleted one simply disappear, and a plan you have lost access to vanish silently
  rather than 404 when you click it. The list is per-account and cleared when you sign out, so a
  shared machine never hands the next person your plan names.

- [#333](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/333) [`44f1c59`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/44f1c5951e010515e8e202c1efbb566d7701c37a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The organisation landing page is now an overview rather than a welcome card.

  `/orgs/:slug` — where every sign-in lands — used to show a card explaining that you could select a
  plan from the Project Explorer one column away. It now answers the question a planner actually
  arrives with: **Recently changed** lists up to eight plans in order of last change with who changed
  them and when, and **Needs your attention** (for Planners and Org Admins) lists the editing locks
  you are holding, anyone waiting on one, pending invitations and deleted work about to expire.

  A brand-new organisation gets a role-aware first step instead: an Org Admin or Planner is offered
  "Add your first client"; a Viewer or Contributor is told who can.

- [#333](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/333) [`44f1c59`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/44f1c5951e010515e8e202c1efbb566d7701c37a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The SchedulePoint wordmark is now the way back to your organisation overview, from anywhere in the
  app — including a plan, which is the screen you are usually on when you want to get back. It marks
  itself as the current page once you are there.

  The **Overview** item has left the organisation nav, which now reads Clients · Calendars ·
  Resources · Members · Audit log · Recently deleted. It went only after the landing had something
  worth returning to and the wordmark linked to it.

  On the sign-in and sign-up screens the wordmark is deliberately not a link: there is no
  organisation to go to yet.

  The overview's heading description is now role-aware: it promised "what is waiting on you" to
  readers who never see that section at all.

### Patch Changes

- [#333](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/333) [`44f1c59`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/44f1c5951e010515e8e202c1efbb566d7701c37a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the new-resource dialog's Group picker, which could only ever offer "No group (top level)". The
  create host never passed the organisation's groups to the dialog while the edit host did, so a
  resource could not be filed into a group at the moment it was created — only by editing it
  afterwards. It now reads the groups directly, and the closed-state target sizes of a native
  `<select>` and the hand-rolled combobox are recorded as measured on a coarse pointer.

- [#333](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/333) [`44f1c59`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/44f1c5951e010515e8e202c1efbb566d7701c37a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix a contrast failure on every Delete button.

  Hovering a destructive button lightened its fill toward the page, taking the label to 4.32:1 in the
  light theme — below the 4.5:1 WCAG 2.2 AA floor, on the shipped default. The hovered fill is now a
  token per theme rather than an alpha utility, which is also what makes it checkable: the contrast
  matrix resolves tokens, and `hover:bg-destructive/90` was not one.

- [#333](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/333) [`44f1c59`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/44f1c5951e010515e8e202c1efbb566d7701c37a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Retire the `VITE_NAV_TREE` flag and delete the two screens behind it.

  Neither was reachable — a `VITE_` constant is inlined at build time and no published image passes
  one — and one of them had been telling nobody that "the schedule editor arrives in an upcoming
  update" for about a year. No user-visible change.

## 0.93.0

### Minor Changes

- [#331](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/331) [`9577f68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9577f68e8dbcc79e5e82227b3d3e6b163aba949c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Recently deleted: fix the delete confirmation, the recycle bin's staleness, and a focus drop.

  - A delete confirmation no longer claims work is recoverable "for a limited time". Retention ships
    **off**, so on every host that has not armed it there is no limit — the claim was asserted at the
    one moment a planner decides whether deleting is safe. The sentence is one shared function now,
    and the deadline is stated on Recently deleted, where it can be stated honestly with the server's
    own period.
  - Deleting a client, project or plan now refreshes Recently deleted. It did not: once a session had
    opened that screen, every later delete left it serving a cached list, so it said "Nothing has been
    deleted" underneath a toast saying a client had just been.
  - Cancelling or closing the "Restore … first" confirmation, or having that restore fail, no longer
    drops keyboard focus to the page body (WCAG 2.4.3).
  - The disclosure that lists what a deletion took now names its subject, so it is not heard without
    an antecedent and is not a substring of the Restore button beside it.
  - A new plan's start date is labelled `Planned start` rather than `Planned start (optional)`. It is
    required, and leaving it blank was refused by a message calling it "a project start date" — three
    names for one control on one screen.

### Patch Changes

- [#331](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/331) [`9577f68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9577f68e8dbcc79e5e82227b3d3e6b163aba949c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Arm the retention expiry: deleted clients, projects and plans are permanently removed once they pass
  the retention period (ADR-0096 D2). Off by default — `RETENTION_HIERARCHY_ENABLED=true` arms it, and
  the clock is retroactive, so read the Recently deleted countdown before doing so. Each permanent
  deletion writes one `hierarchy.expired` audit event inside the deleting transaction, naming the item
  and its blast radius.

  Fixes a defect in the arming switch itself: it was declared with `z.coerce.boolean()`, which reads
  the string `'false'` as **true**, so the documented way to turn off the product's only aimable hard
  delete turned it on. It is now an enum that refuses any value it cannot read as a decision.

## 0.92.1

### Patch Changes

- [#329](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/329) [`df60648`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/df60648df521141c885628486f0dc6ae270e56fb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The Gantt's row menu works from the keyboard, and two capped views say what they held back.

  **Indent, Outdent and Insert activity below could only be reached with a mouse.**
  They live only in the row's `⋯` menu — the selection bar cannot carry them — and
  nothing opened that menu from the keyboard. `Menu`/`Shift+F10` on the focused row
  now does, the same key the Project Explorer already uses.

  **And once open, none of its items responded to Enter.** The row claimed that key
  for selecting itself, which silently suppressed activation for every item in the
  menu, however it had been opened. Pressing Enter on an item now does what
  clicking it does.

  **Filing a row under a summary now says so**, on success and on failure. It
  previously did neither, so a row that failed to move — two planners restructuring
  at once is enough — looked identical to one that had not been asked to.

  **A chart with more than 40 collapsed sections now says the address could not
  carry them all**, instead of quietly re-expanding some after a reload and leaving
  the reader to wonder whether they had imagined collapsing them.

  Smaller: the `View ▾` panel's checkboxes are large enough to hit accurately on a
  touch screen.

## 0.92.0

### Minor Changes

- [#327](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/327) [`8998626`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8998626ef2512e93e28f5961bd4d055d998b9d56) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The Gantt remembers how you left it, and its rows can be restructured.

  Sort a column, choose which columns the grid shows, collapse the phases you are
  not reading — and it all survives a reload and a shared link, because it lives in
  the URL rather than in the page. A **Predecessors** column joins the chooser,
  showing each activity's logic as text (off by default, so no chart grows a column
  overnight).

  The row menu gains **Indent** and **Outdent**, which file a row under the summary
  above it or move it one level out. Indent deliberately does not turn the row
  above into a summary the way P6 does: in SchedulePoint a summary carries no
  logic, so that gesture would silently strip every link on it. It files under an
  existing summary instead, and says plainly when there is none.

  **Insert activity below** opens the create dialog with the row's section already
  chosen — beside the row rather than inside it, because "below" in a grid means
  the next line at the same level.

  The keyboard-shortcuts sheet now opens in the Gantt, listing that view's own keys
  — F2, Enter, Escape, Tab, `Alt+←/→`, `Shift+←/→`. It previously did nothing at
  all there: the sheet was part of the diagram, so pressing `?` in the chart set a
  state nothing drew.

## 0.91.0

### Minor Changes

- [#325](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/325) [`f7587cd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f7587cd32257246655cdb070af3a07de2f4092ab) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The Gantt becomes a working surface (ADR-0095).

  The chart shipped read-only, and ADR-0093 then moved `Report progress` off the command surface onto
  the canvas dock — which the Gantt did not have. It does now: the same object-action bar, called
  rather than rebuilt, so a planner acts on a selected bar without leaving the view.

  The grid takes in-cell editing. Name and duration are typed directly (`F2` or double-click, `Enter`
  to commit, `Escape` to discard), with a Duration column that reads a sub-day value exactly rather
  than rounding it to `0 d`. Each cell knows its own write scope, so reporting progress does not need
  the edit lock while changing a duration does. A cell you may not change stays **readable** with the
  reason given, rather than being greyed out and silent.

  Bars move. Drag one, or press `Alt+←/→` to shift its start and `Shift+←/→` to change its length;
  drag the right-hand edge to resize. An uncalculated plan now shows its grid so a new programme can
  be typed in before the first recalculation.

  Dependency arrows arrive behind **View ▾ → Logic links**, off by default — and selecting a row
  always draws that row's own links, so "why is this bar here?" is answerable without turning anything
  on. Every row also carries its predecessors in words for screen-reader users.

  Bars now carry their **activity name** beside them and a mark on any bar that is **pinned by a
  constraint** — both on screen and in the printed programme, where an anonymous bar sends the reader
  back across the page to the grid for every one. Labels stand down where there is no room rather than
  overlapping; the pinned mark stays, because a dense chart is exactly when you are looking for it.

  Also fixes a defect visible only to someone opening one plan two ways: in Visual mode the chart drew
  every hand-placed bar from the wrong dates, on screen, in the grid's own date columns, in its sort
  order, and in the printed programme.

### Patch Changes

- [#325](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/325) [`f7587cd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f7587cd32257246655cdb070af3a07de2f4092ab) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the Gantt drawing a Visual-mode plan's bars from the wrong dates.

  The chart read each activity's computed **earliest** dates unconditionally while the logic diagram
  read the engine's **effective-Visual** dates, so in a plan using Visual scheduling the two views
  disagreed about where every hand-placed bar sat — including in the printed programme. Each view was
  internally consistent, so the disagreement was visible only to someone opening the same plan both
  ways. Plans in the default Early mode were never affected.

## 0.90.1

### Patch Changes

- [#322](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/322) [`0de139d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/0de139d09f332f3089b0889b64260cf3a5f86b22) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Retire `VITE_CANVAS_WORKSPACE`, the last feature flag that selected between two different plan
  surfaces.

  **No user-visible change.** Every published image already compiled this flag on — a `VITE_` flag is
  inlined at build time and the release pipeline passes none, so the branch being deleted was
  unreachable in any shipped bundle (ADR-0088 D1). What goes is the ~270-line legacy long-scrolling
  plan page it selected when off, and the branch that chose between them.

## 0.90.0

### Minor Changes

- [#312](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/312) [`334e6a4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/334e6a43b678dd0cf7e6ec59b04308c996cafd1f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Conflict review: one meaning of "conflict", a count you can read at rest, and a remedy on the
  activity itself (ADR-0094).

  **Next conflict** moves out of the `⋯` and onto the toolbar row, shaded with a reason when there is
  nothing to review and enabled when there is. A read-out beside it states the magnitude at rest ("3
  conflicts") and the position while cycling ("2 of 3"); the count reaches assistive tech through the
  button's own description, on the row and in the overflow menu.

  The Filter menu's **Has conflict** lens and the Next-conflict cycle now read one shared set, which
  they did not: the lens matched hand-placed conflicts alone while the cycle counted every kind. The
  set itself narrows to the three a planner can act on — a constraint broken by logic, a hand-placed
  bar earlier than its logic allows, and a levelling window exceeded.

  Landing on a flagged activity offers the fix on the selection bar: a route into the activity editor
  where the problem lives (Scheduling for a constraint, Resources for a levelling window), or — for a
  hand-placed conflict — the bar's own **Clear visual placement**, which moves here from the command
  surface and wears the conflict icon when it is the answer to one.

## 0.89.0

### Minor Changes

- [#310](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/310) [`333c815`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/333c815a0af5bfac441eeb3980c023850f7a9112) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Report progress is offered by the canvas selection bar, not the toolbar. It was the only action in
  the plan workspace that existed in two places — the command surface and the canvas dock — with the
  same permission, the same precondition and the same dialog. It now lives on the object it acts on.
  The other routes are unchanged: the activities-table row menu and the activity editor's Progress
  tab.

## 0.88.0

### Minor Changes

- [#304](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/304) [`4f5dea3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4f5dea3bb576d34fa31c49dc78ae67880d927bba) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The plan workspace gives the diagram its height back, and stops covering it.

  - The canvas fills its section: the rounded box and its padding are gone, so the
    plan is framed once rather than twice.
  - Every transient strip — the armed-tool statement, the link confirmation, both
    selection bars, the edit-conflict banner and the empty-plan notice — now sits
    in a **dock** at the foot of the workspace, in the row the Activities handle
    already occupied. Measured: it costs the canvas no height at all, where before
    each one pushed the diagram down.
  - The selection actions bar no longer floats over the diagram, so selecting an
    activity stops hiding the one above it.
  - **Snap to grid is gone.** It had no effect: the scheduler already moves every
    hand-placed bar forward to the next working day, whatever the toggle said. What
    it did do was save a weekend drop as the _previous_ Friday — earlier than you
    placed it. Drops are now stored exactly where you put them and the schedule
    moves them forward, and the bar previews that while you drag.
  - **Legend** and **Resource view** are back on the toolbar's first row as their
    own buttons, labelled on wider screens and icon-only on narrower ones.
  - Two toolbar menus (**Analysis**, **Share & export**) kept their text at widths
    where every other menu had gone icon-only, pushing the second row past its edge
    on small screens. They now match their neighbours.

## 0.87.0

### Minor Changes

- [#301](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/301) [`0a323ad`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/0a323ad023228b7d9a142e49633d423bd7598e50) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Toolbar: labels now fall one at a time instead of all at once, and the `⋯` empties

  The plan workspace's two command rows used to make a single all-or-nothing
  decision about labels: either every width-responsive command showed its name, or
  none did. They now degrade one command at a time, least important first, and the
  order is the exact reverse of the order commands demote into the overflow menu —
  so the row can never keep a label on something it values less than a command it
  has just hidden.

  Tier-3 commands are admitted back onto the row when there is room, which means
  the `⋯` button empties on a wide screen and stops rendering entirely. When it
  does render it is now the last thing on the row: the Project-finish read-out
  moved inside the toolbar (as a non-focusable read-out) so nothing sits to the
  button's right.

  Two commands merged. **Go to date** is now the caret of **Go to today**, with the
  two halves keeping their own availability — going to a date still works on a plan
  with no computed diagram. **Keyboard shortcuts** left the command row for the
  account menu, where the rest of the application's reference material lives; the
  `?` key still opens the same sheet.

  The width arithmetic behind all of this was re-measured against a real browser.
  Row 2 keeps every label at 1646 px (the width this was reported at), and gains
  labels it did not have at 1536 and 1440.

## 0.86.1

### Patch Changes

- [#299](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/299) [`3719166`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3719166a27f562ab57028d207e8a2f10dd70d5a3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Toolbar commands keep their text labels on a Surface Pro. Both rows were withholding every label
  while sitting roughly half empty — the first row because the project-finish date beside it made the
  row _measure_ itself as narrow, and the second because the full set of labels was about 95 px too
  wide and labelling is all-or-nothing per row.

  Three of the longest labels are shorter: **Auto-arrange lanes → Arrange**, **Schedule settings… →
  Settings…**, **Marquee select → Select**. The full wording is still the hover tooltip and is still
  what a screen reader announces.

## 0.86.0

### Minor Changes

- [#297](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/297) [`ab8c220`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ab8c2201d938878b9c2c6ee7bd9e684e33876b77) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The scheduling mode (`Early | Visual`) and the view switch (`Diagram | Gantt`) move out of the
  toolbar's first row and onto the plan's identity line, beside **Start editing** — because that is
  what they are. Neither _does_ anything: they set how everything below them behaves, which is exactly
  the relationship the pen control already has to the toolbar. All four gain an icon.

  They render as a third toolbar rather than as four hand-built buttons, so they keep roving arrow-key
  focus, group labelling, the shaded-with-a-reason treatment and the pointer-target gate — each of
  which this project has recorded shipping wrong once when rebuilt by hand.

  The four buttons look and behave exactly as before; only where they sit has changed. The overflow
  menu's radio/checkbox handling for these items is now unreachable on this surface (the mode row
  shrink-wraps to its content and can never overflow) and is deliberately kept, because a future
  width-constrained row would need it.

- [#297](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/297) [`ab8c220`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ab8c2201d938878b9c2c6ee7bd9e684e33876b77) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Zoom presets move from their own toolbar dropdown into the **View** panel, as a radio group. The
  old dropdown labelled itself with the _current_ preset, so a planner hunting for **Fit to plan** met
  a button reading "Week"; the presets now sit with the other things that change how the diagram
  reads.

  **Zoom out, Zoom in, Fit to plan and Today are now on the bar at every window width.** They used to
  fold away into that dropdown on anything narrower than a wide desktop, which is exactly where a
  planner has the most need to reframe. They keep their labels on a wide screen and become icon-only
  below it, so no command ever disappears into a menu.

### Patch Changes

- [#297](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/297) [`ab8c220`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ab8c2201d938878b9c2c6ee7bd9e684e33876b77) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The project finish date sits beside **Summary** on the toolbar again, instead of up on the
  breadcrumb line.

- [#297](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/297) [`ab8c220`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ab8c2201d938878b9c2c6ee7bd9e684e33876b77) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The magnifier icon on the plan toolbar's search field is now visible. It had always been in the
  markup, correctly sized and correctly placed — and painted underneath the field itself, so the
  field looked as though it had no icon at all.

## 0.85.1

### Patch Changes

- [#295](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/295) [`5686fca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5686fcac56d9f8cd106169b23d267b6827252cf4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Start-to-Finish links can now be drawn on the diagram. The canvas Link tool offered three of the four
  dependency types; SF was scheduled correctly by the engine, accepted by the API, editable in the
  activity editor's Logic tab and painted correctly on the canvas — it simply could not be created with
  the tool the product is built around.

## 0.85.0

### Minor Changes

- [#293](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/293) [`9c05ae1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9c05ae16bfd35e4d8b0bcd828dc5e5a5c17496bd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The plan workspace's command surface is consolidated (ADR-0090 M2). 44 toolbar
  stops become 28, and **both rows now show their commands with labels at
  1920×1080** — the first time that has been true on a typical 24" monitor.

  Nothing is deleted. Selection-gated canvas commands (Zoom to selection, Isolate
  logic path) move to the floating selection bar; the display lenses and the
  Legend move into `View ▾`, which now names a non-default colour mode on its own
  trigger; the Project-finish read-out moves to the plan header; Export, Print and
  Share become one `Share & export` menu; Baselines, Earned value and Resource
  histogram become one `Analysis` menu. Four commands sit in the `⋯` at every
  width, one click away, which is what buys the rest their labels.

- [#293](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/293) [`9c05ae1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9c05ae16bfd35e4d8b0bcd828dc5e5a5c17496bd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The plan toolbar now responds to the width it actually has. Four named layout bands are derived from
  the row's own container (not a viewport media query, so a future dock or split pane cannot desync
  them), with hysteresis so dragging a window edge does not re-lay the row out on every pixel.

  Below the widest band, Zoom out/in, Fit to plan and Go to today move **into** the `Zoom ▾` menu under
  a Viewport heading, each keeping its own shaded reason rather than being dropped. In the narrowest
  band the `Go to date`, `Zoom`, `View`, `Filter` and `Summary` triggers become icon-only and the search
  field takes its floor width, so both rows fit inside their container at every supported width down to
  768 px — measured, not asserted.

  Touch: under a coarse pointer every toolbar control widens from 32 px to 40 px without losing height.

  Fixes a WCAG 2.2 Target Size failure that predates this work: all three split-button carets (Add
  activity, Link, Isolate) rendered 22–23 px wide against a 24 px minimum.

## 0.84.0

### Minor Changes

- [#291](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/291) [`0509b70`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/0509b70807e62b87c15017dbe85c31475e6c1e25) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix toolbar commands that could not be clicked, and stop the row lying about its width.

  On a 1920×1080 monitor at 100% browser zoom, the plan workspace's Navigate row laid out 109 px wider
  than the space it had, no overflow (`⋯`) button rendered at all, and **Legend** and **Keyboard
  shortcuts** were painted outside the row with zero visible width — impossible to click with a mouse
  or by touch, and reachable only by tabbing to them. At 1440 px the `⋯` button itself was one pixel
  wide while holding the only route to fourteen commands; at 960 px it had no visible width on either
  row. This failed WCAG 2.2 §2.5.8 Target Size (Minimum).

  The cause was that the overflow calculation summed only the _controls_ and none of the row's own
  spacing — the gaps between buttons and the dividers between groups — so it believed the row fitted
  when it did not, and the surplus was paid by whatever sat furthest right falling off the edge.

  Every command is now a real, clickable target at every supported width, on both rows, and the `⋯` is
  the last thing to lose space rather than the first. Below Surface Pro landscape width the row now
  scrolls rather than hiding controls. Demotion into the `⋯` also follows a stated priority instead of
  left-to-right position, so the zoom controls stay on the bar and the reference links move first —
  previously it was the other way round — and a two-state switch (Early | Visual, Diagram | Gantt) can
  no longer end up with one half on the bar and the other in a menu.

  **One deliberate, temporary regression:** because the row now measures itself honestly, it can no
  longer afford text labels on every control at 1920 px, so more of the Navigate row is icon-only than
  before. That is the correct behaviour for the space available, and it is not where this ends — the
  next milestone reduces the row from 46 commands to about 24 without deleting any of them, which buys
  the labels back honestly. A correct icon-only row was judged better than an unclickable labelled one.

## 0.83.0

### Minor Changes

- [#289](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/289) [`e22fe69`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e22fe694af840e6b6a26f9fe1d111f469eb3fd31) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - One activity field vocabulary: the New-activity dialog and the tabbed editor now render
  the same fields from the same components (ADR-0089).

  The two surfaces that edit an activity shared no code and had drifted in ten places.
  Six of those were defects a planner could hit, and all are fixed:

  - An activity nested under a summary the picker cannot resolve no longer renders as
    **top level**. It kept its real parent on save, so the screen and the record
    disagreed — and correcting what looked like a mistake corrected nothing.
  - A `MANDATORY_*` constraint no longer renders as **no constraint at all** with its date
    filled in below it. It keeps its place under a label saying what it actually does.
  - The option that keeps the Type selector honest is no longer a **one-way door**:
    selecting a different type no longer removes the activity's own stored type from the
    list.
  - The editor now explains why a level-of-effort, WBS-summary or resource-dependent
    activity has no duration field, where it previously removed the control silently.
  - A resource-dependent activity's calendar is now read-only rather than disabled, so the
    binding stays readable, selectable and copyable.
  - **A payment milestone can carry its cost.** Cost and earned-value fields were withheld
    from every type with no duration, and the New-activity dialog is the only surface that
    makes a milestone — so the value could not be entered anywhere.

  Also: the WBS parent picker is labelled "Parent WBS summary" on both surfaces (it
  collided with a Type option named "WBS summary"), summaries are offered by code and
  name, "Schedule as late as possible" and "Expected finish" move out of Constraints into
  their own "Placement & targets" section, and money fields take hundredths from zero up
  on a decimal keypad.

## 0.82.2

### Patch Changes

- [#286](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/286) [`9e37a3f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9e37a3f4404a509bf1deef08d8957949f1c24e97) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Retire `VITE_CALENDAR_SHIFT_EDITOR` and `VITE_LIBRARY_SCOPING`, deleting the weekday-checkbox
  calendar form and the raw-`<select>` library pickers they selected (ADR-0088 D3). Class A
  alternative surfaces go 4 → 2.

  No user-visible change: both flags were compiled on in every published image and unreachable by any
  build path, so nothing could select the deleted branches.

## 0.82.1

### Patch Changes

- [#284](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/284) [`823b4a9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/823b4a9e9c0dcce2acf8d4b77369980dd395c1a0) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Retire `VITE_CANVAS_TOOLBAR` and delete the alternative plan-workspace layout it selected
  (ADR-0088 D3). No user-visible change: the flag was compiled on and unreachable by any build path,
  so the deleted branch could not be selected by anybody.

## 0.82.0

### Minor Changes

- [#282](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/282) [`4c77257`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4c7725737814d1e8566aa210718f87d24e4559fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Retention section to the staff console (ADR-0087 M3).

  `GET /api/v1/staff/health` gains a `retention` object — no new route, so no route-census entry and
  no second `staff.panel_read` row per page load — and `/staff` renders it below Mail health.

  The leading answer is **derived from the data, not reported by the sweep**: the age of each table's
  oldest surviving row against its configured period, which is true whether or not any sweep has ever
  run. The sweep's own bookkeeping resets on restart, so a last-run timestamp alone cannot separate
  "working" from "never armed". The section keeps three pairs of states distinct that a careless
  sentence collapses: an empty table ("no rows") from one whose oldest row is new; a process that has
  not swept from one that swept and deleted nothing; and a disabled sweep — which shows no last-run
  time at all, because a timestamp beside "disabled" reads as health.

## 0.81.0

### Minor Changes

- [#280](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/280) [`5f0cd62`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5f0cd627ded0dd6b34f1788b549d2193f6d40cd9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The staff console is reachable from the account menu, and the Content-Security-Policy the image
  ships now matches the one the compose files state.

  **A Staff console item appears in the account menu** for allowlisted, verified accounts. Everyone
  else sees no such item — omitted rather than shaded, so it is indistinguishable from a product with
  no console at all. The gate is a live check against the API, not a build-time flag: staff-ness is
  read from `STAFF_EMAILS` on the server, which the browser cannot see and an operator changes without
  a release. The console shipped reachable only by typing `/staff`, which meant it could be deployed,
  working and unfindable.

  Refusals of that identity check are deliberately **not** audited. It is asked by the app for every
  reader, so a refusal is the expected answer rather than evidence, and recording it would fill the
  audit log with "somebody opened a menu" and bury the refusals that mean something — a caller who
  knows the console's panel URLs and is trying them. Those are still recorded.

  **Fixed: the web image's default policy carried no violation reporting.** The directives were added
  to the compose files when the report sink shipped and not to the image, so a deployment whose own
  compose omits the web environment block ran a policy that reported nothing — every page loading
  normally while the staff console's Security panel stayed permanently empty, which reads as "the
  policy is clean". The image's defaults now match, and a check asserts all three sources agree.

## 0.80.0

### Minor Changes

- [#269](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/269) [`862b232`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/862b232ece7c6a1cbd13a1273c62cdde2e860d37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Staff console (ADR-0086) — SchedulePoint's own operations surface, plus mail alerting and a CSP
  report sink.

  The most privileged operations in this product were the only unaudited ones: checking whether mail
  is delivering, whether an account is stuck unverified, or what the Content-Security-Policy is
  blocking all meant `psql` on the host, leaving no record that anyone had looked. `/staff` answers
  those questions on a screen and records that it did.

  Staff operate the **installation** and reach no customer data — no clients, projects, plans,
  activities or notes, and no impersonation. That is structural rather than a rule: `StaffPrincipal`
  carries no memberships, no `can()`, no organisation and no role, so passing one to a member service
  is a compile error, and the cross-org 404 invariant is untouched because no code on that path
  changed. Staff-ness is an environment allowlist (`STAFF_EMAILS`) plus a verified address, and every
  refusal is the same 404 an unmapped route gives — including for an Org Admin — so the console is not
  an oracle for which addresses are staff. Refusals are audited too.

  Also in this release: mail failures become a durable row and an alertable webhook (`MAIL_ALERT_URL`)
  with a coalescing window, an optional external heartbeat (`HEARTBEAT_URL`), and an endpoint that
  collects browser CSP violation reports so the policy shipped in the previous release can be watched
  rather than assumed.

### Patch Changes

- Updated dependencies [[`862b232`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/862b232ece7c6a1cbd13a1273c62cdde2e860d37)]:
  - @repo/types@0.27.0

## 0.79.0

### Minor Changes

- [#266](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/266) [`3cf27de`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3cf27de4ea1fe34a4dbcd56038c03c3b8fa53fb3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - A gated form field is read-only, not disabled (ADR-0083). A field's loss on being disabled is not
  operability but **readability** — the value leaves the tab order, cannot be copied, and was exempt
  from the contrast floor — so "you may not edit this" was implemented as "you may not read it
  either" at 39 call sites. Text and textarea take `readOnly`; a checkbox takes `aria-disabled` plus
  a click guard; a native `<select>` keeps the attribute as a named exception; `Combobox` gains a
  `readOnly` mode. The reason renders once per group and every field points at it.

### Patch Changes

- [#266](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/266) [`3cf27de`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3cf27de4ea1fe34a4dbcd56038c03c3b8fa53fb3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The canvas link tool no longer loses its quiescence, and its confirmation offers Undo.

  The workspace layout that actually ships was passing three fewer props to the canvas than the
  layout beside it. The recalculation hold — built so bars cannot move between the two clicks of a
  link pick — was inert, which is the defect that work was commissioned to fix. The link
  confirmation's Undo button had never rendered at all.

  Also: `/sign-in`'s `?redirect=` is now same-origin by shape, and the guest share view no longer
  scrolls sideways on a 320px phone (WCAG 1.4.10).

- [#266](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/266) [`3cf27de`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3cf27de4ea1fe34a4dbcd56038c03c3b8fa53fb3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - A shut control now names a button you actually have.

  When someone else holds the plan's edit lock, shaded actions said "Start editing to change this
  activity" — but that reader's screen shows **Request control** and no Start-editing button at all.
  A Viewer got the same sentence, pointing at a button their role will never produce. The refusal now
  names the holder and the control that would help, says "your role" when the role is what is missing,
  and still says "Start editing" when the lock is simply free.

  Applied across all eleven sites that had written their own copy of it — the TSLD toolbar, the canvas
  selection bar and the activity editor — from one shared derivation, so they cannot drift. **Edit
  plan** in the header menu is now shaded with its reason instead of vanishing. Closes
  `docs/TECH_DEBT.md` [#114](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/114), [#115](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/115) and [#116](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/116).4.

## 0.78.0

### Minor Changes

- [#264](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/264) [`d8d8c34`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d8d8c3455138654ae3e404d5f9657ef9b6c250e9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - A shaded menu item keeps its place in the keyboard order, and says why it is shut.

  Row actions a planner cannot currently take — Edit, Duplicate, Dissolve, Delete without the plan
  edit-lock — are now shown shaded with a reason instead of vanishing, matching what the canvas
  selection bar has always done. Arrow keys reach them, and screen readers announce the reason as a
  description.

  Two keyboard bugs go with it: arrowing up from a disabled item landed on the second-to-last item
  rather than the last, and a menu whose items were all unavailable trapped focus so only Escape
  worked.

- [#264](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/264) [`d8d8c34`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d8d8c3455138654ae3e404d5f9657ef9b6c250e9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Dragging one of a plural canvas selection now moves them all.

  The selection could already be built, chained and deleted as a set; a drag still moved one bar.
  Every activity in the selection now moves by the same delta, as one batch write and one undoable
  step, mode-aware exactly as the single-bar drag is. The selection bar says so before you drag.

### Patch Changes

- [#264](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/264) [`d8d8c34`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d8d8c3455138654ae3e404d5f9657ef9b6c250e9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - `DELETE …/activities/:activityId` returns the delete batch id.

  The route answered `204 No Content`; it now answers `200 { deleteBatchId }`. Nothing about the
  delete changed — a cascade has always assigned that id, covering the whole subtree when the activity
  is a WBS summary — but a bodiless response meant a client could not call `restore-batch` on the rows
  it had just deleted. That is why undoing a copied WBS band had no redo: the undo deletes the copy's
  root and lets the cascade run, and the redo needs an id nobody was told.

  The **status code moves**, 204 → 200. A caller that reads the body is unaffected; a caller that
  branches on the status, or a generated client that treats 204 specially, is not — five of this
  repository's own e2e specs had to change `.expect(204)` to `.expect(200)`. Pre-1.0, that is a minor
  bump (CLAUDE.md §10).

## 0.77.0

### Minor Changes

- [#261](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/261) [`d90be07`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d90be07f53e77c1cb8f09c1d98835725491bfd68) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Copy, paste and duplicate activities on the TSLD.

  Duplicate one activity from the canvas selection bar or the activities-table row menu; duplicate a
  whole WBS band with its subtree and the logic between its members, behind a confirmation that names
  the counts it is about to create. `Ctrl/Cmd+C` captures the canvas selection and `Ctrl/Cmd+V` pastes
  it — standing down whenever the planner is copying real text, so a genuine text copy is never
  hijacked. One `Ctrl+Z` removes a whole paste, links included.

  A copy is the same work, not the same history: the definition, the resource assignments and the
  weighted step breakdown come with it; progress, actual cost and notes do not, and the confirmation
  says so before the write. What each field does is decided by a compiler-enforced census, so a field
  added to an activity, an assignment or a step is a build failure until somebody classifies it.

  Behind `VITE_ACTIVITY_COPY_PASTE`, default-on.

## 0.76.0

### Minor Changes

- [#259](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/259) [`1d260f1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1d260f12002f52f7e19477aa1cbf3c72131d5696) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Canvas multi-select — the bulk-operation foundations (still dark; behind
  `VITE_CANVAS_MULTI_SELECT`, default off).

  Adds the pure and data-layer half of the three bulk operations: a mode-aware row builder that turns
  a plural drag into complete placement rows (EARLY pins an `SNET`, Visual writes `visualStart`, a
  lane-only move leaves every date field alone), a chain planner that orders a selection by time and
  refuses one that would close a cycle **against the resulting graph**, the client hooks for the
  placements / bulk-delete / restore-batch endpoints, and the two undo commands — a bulk move that
  threads versions through every batch response, and a bulk delete whose undo is one id-stable batch
  restore so the links between the deleted activities survive it.

- [#259](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/259) [`1d260f1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1d260f12002f52f7e19477aa1cbf3c72131d5696) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Canvas multi-select — the bulk operations (`VITE_CANVAS_MULTI_SELECT`, now default on).

  A plural selection can now do the three things it exists for. A bulk selection bar appears at two
  selected, in the chrome above the diagram rather than floating over it: it names the primary (what
  single-activity actions still act on), states **before** a drag that an Early-mode move will pin a
  start-no-earlier-than on every selected activity, and shades each action with a reason it is
  `aria-describedby`-linked to rather than merely next to.

  **Delete** sweeps the set as one batch and undoes as one step — an id-stable batch restore, so the
  dependencies _between_ the deleted activities come back with them. **Link in sequence** previews the
  order with names and arrows before writing anything, offers Reverse, orders by time rather than by
  which bar a marquee happened to touch first, and refuses a chain that would close a loop against the
  plan as it stands rather than discovering it half-way through the write.

  **Now on by default.** The flag flipped once the flag-on journey ran green against a real API with
  the edit lock enforced. It found four things first: the bulk bar was not wired into the layout the
  app actually renders; a bulk delete dropped keyboard focus to the page body, which failed WCAG 2.4.3
  and silently disabled Ctrl+Z; the "2 activities deleted" announcement was overwritten by the row the
  focus landed on; and Reverse persisted into the next preview, so a cancelled reversal could write
  the following chain backwards. Set `VITE_CANVAS_MULTI_SELECT=false` to roll back — the selection is
  then structurally singular and the canvas, toolbar and accessibility tree are exactly as before.

- [#259](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/259) [`1d260f1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1d260f12002f52f7e19477aa1cbf3c72131d5696) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Canvas multi-select — pointer gestures and keyboard parity (behind `VITE_CANVAS_MULTI_SELECT`,
  default off).

  Ctrl/Cmd-click toggles a bar in or out of the selection, Shift-click extends a span in plan order,
  and a marquee sweep selects what its rectangle covers — armed by holding Ctrl/Cmd on empty ground,
  or by a new **Marquee select** tool on the diagram toolbar. The tool joins the ADR-0064 arm/disarm
  contract (Escape returns to Select, the mode band states it, the transition is announced) and is
  deliberately not pen-gated: selecting is a read, so a Viewer can sweep.

  The parallel activity listbox becomes multi-selectable in step: `Space` toggles the focused
  activity (its logic summary moves to `i`), `Shift+↑/↓` extends, `Cmd/Ctrl+A` selects everything, and
  `Escape` clears the selection after any armed tool has been closed. `aria-selected` reflects the
  whole set rather than the keyboard cursor.

  Flag-off, every one of these paths is unreachable and the canvas paints call-for-call what it did
  before.

## 0.75.0

### Minor Changes

- [#256](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/256) [`00c19a4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/00c19a4b219a76442a5189b54c7090b16be98173) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Search that navigates (behind `VITE_CANVAS_SEARCH_NAV`, default off).

  The TSLD's live search stops being only a filter and becomes a **find** control.
  Enter and Shift+Enter walk the matches; each jump centres the bar, selects it and
  announces it, with focus staying in the field so the next press goes somewhere.
  A read-out says "12 matches" before the first jump and "3 of 12" after, in the
  accessibility tree as well as on screen. `Zoom to selection` frames what you
  landed on at a legible scale. The same field, the same Enter and the same count
  work in the Gantt as well as the diagram, over **one** derived match set — so the
  two views cannot disagree about what the search matched.

  The field also gains a real, keyboard-reachable clear: `type="search"` renders its
  native ✕ in Chromium only and puts it in no browser's tab order, so on a control
  whose whole point is keyboard operation the only way to empty it was
  select-all-and-delete.

  Frontend-only — no API, DTO, schema or migration, and the CPM engine is not
  imported, so the ADR-0034 recalculation parity gate is untouched by construction.
  Flag-off is byte-for-byte today's search, kept as the rollback contract in its own
  parity suite.

- [#258](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/258) [`e3ac7c6`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e3ac7c6543e8e173ba7d04c1a56f7d48ac6f6deb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Search navigation: an Escape typed into the search field belongs to the field, and one keystroke
  says one thing.

  The flag-on journey (`apps/web/e2e-search-nav/`, its own CI step) found two live defects on its
  first run — both invisible to every unit suite in the repository, because neither is observable
  without a real browser, a real API and two debounces running against each other:

  - **An armed tool was lost to a keystroke aimed at text.** The canvas's Escape handler is a native
    `window` listener, so it fired wherever focus was: a planner refining a search query with the Link
    tool armed had the tool silently disarmed. The listener now ignores keys typed into a text control,
    and the field takes a two-step Escape of its own — clear the query, then hand focus to the diagram —
    so the route to Escape's other meaning stays open rather than becoming a dead end.
  - **The jump announcement was overwritten by a stale filter count.** Both speak into the same polite
    live region, and the debounced count re-armed on every re-render, landing after the jump. A
    screen-reader user heard "3 of 5 activities match" where the product had just said which activity it
    had moved to. The count now stands down once the planner starts cycling, and clearing the search
    says "Search cleared." instead of blanking the region.

  The feature stays behind `VITE_CANVAS_SEARCH_NAV` (default off). The CPM engine is not imported and
  the ADR-0034 recalculation parity gate is untouched.

- [#258](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/258) [`e3ac7c6`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e3ac7c6543e8e173ba7d04c1a56f7d48ac6f6deb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Search that navigates is on by default (ADR-0079, `VITE_CANVAS_SEARCH_NAV`).

  The TSLD's search field stops being only a filter. Enter and Shift+Enter walk the matches, each jump
  centres the bar, selects it and says which one it is; an n-of-m read-out tracks the position; and
  `Zoom to selection` frames what you landed on. The Gantt walks the same match set.

  Rolling back is `VITE_CANVAS_SEARCH_NAV=false` and a rebuild — the flag-off parity suites are kept
  and pinned rather than weakened, so the rollback restores the field's filter-only behaviour exactly.

## 0.74.0

### Minor Changes

- [#252](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/252) [`779a5b3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/779a5b3545e87d91ac9de6a7756f1412b71c9f20) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The data-date line is on by default. On a statused programme the canvas now draws the status line
  the whole progress model pivots on — solid, labelled, and distinguishable from the dashed Today
  marker by shape as well as colour — with its own `View▾ ▸ Markers` switch for anyone who wants the
  diagram back without it.

  It is enabled after a review pass over the whole status-and-feedback epic, which turned up three
  defects worth naming because none of them was in the line itself: a settled recalculation announced
  nothing at all for edits made with the keyboard, arming the drawing tool from the empty-plan notice
  dropped the reader's place on the page, and pressing Recalculate while an edit was still settling
  could talk over its own result.

- [#252](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/252) [`779a5b3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/779a5b3545e87d91ac9de6a7756f1412b71c9f20) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The TSLD canvas can now draw the **data date** — the status line the whole progress model pivots
  on — behind `VITE_CANVAS_DATA_DATE` (default **off**). When enabled: a solid 2px foreground-hue
  vertical at day offset 0 with a `Data date` pill, distinguishable from the dashed Today line by
  shape and weight rather than hue (WCAG 1.4.1); when the two lines round to the same pixel exactly
  one draws, with a merged `Data date · today` pill. The mark gets a `View▾ ▸ Markers ▸ Data date
line` toggle, a legend entry and an export-legend entry (so an exported PNG/PDF shows and names
  it), and the activities listbox gains a visually-hidden statement of the data date (and today,
  when they differ) via `aria-describedby`. Flag-off, the canvas paints byte-for-byte the prior
  frame — pinned by a dedicated parity suite.

### Patch Changes

- [#252](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/252) [`779a5b3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/779a5b3545e87d91ac9de6a7756f1412b71c9f20) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The first drawing gesture is described once, and accurately. Pressing "Draw the first activity" on
  an empty plan armed the tool but left the empty-plan notice up beside the mode band, so the canvas
  carried two instructions at once — one of them the button that had just been pressed. The notice now
  yields while a tool is armed and returns when it is cancelled.

  The Add statement also names the gesture the armed type actually wants: a milestone is placed with a
  click, while a task is drawn by dragging its length — with a click as a one-day shortcut, which the
  old wording ("click the diagram to draw") never mentioned and no planner could have discovered.

- [#252](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/252) [`779a5b3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/779a5b3545e87d91ac9de6a7756f1412b71c9f20) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The WBS colour lens and the baseline ghost now have spoken equivalents. "Colour by WBS group" told
  you which activities belong together using fill colour and nothing else, and the baseline overlay
  drew a ghost bar with no text anywhere naming it — so on both, a keyboard or screen-reader user was
  given a diagram with a fact removed from it. Each row of the diagram's activity list now ends with
  its group ("group: A200", or "ungrouped"), and a ghosted row names the captured baseline span and
  how far its finish has moved, in the same behind/ahead words the variance table uses. The group name
  spoken on the row is the one printed in the on-canvas legend — one producer, so they cannot drift.

  Selecting an activity also now says exactly what its row says. It used to announce the activity's
  dates and float alone, while the row on screen carried that sentence plus its "filtered out" and
  "over-allocated" marks — so selecting a bar the filter had dimmed spoke a sentence the visible list
  did not contain. The row text and the announcement are now one composition.

- [#252](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/252) [`779a5b3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/779a5b3545e87d91ac9de6a7756f1412b71c9f20) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - A recalculation now shows it is working and says what settled. While the schedule is being
  recalculated — whether you pressed Recalculate or simply moved a bar, which recalculates on your
  behalf a moment later — the Recalculate button's icon spins, so the surface that is about to move
  every bar on the canvas is no longer doing it invisibly. The busy state is also carried by
  `aria-busy` and the existing "Recalculating…" tooltip, because the app reduces every animation for
  anyone who has asked for reduced motion, and a spinner would be the one cue they never see.

  When the recalculation settles, the diagram says what changed. Editing a bar used to announce a
  promise — "Moved 'Excavate'; dates will update." — and then the dates updated in silence, so the
  only thing a screen-reader user was ever told about their edit was said before the new dates
  existed. The settle now names the activity and its resulting dates, and adds the project finish as
  a separate sentence when that moved too. Nothing is announced when nothing moved, when the
  recalculation was somebody else's, or when it failed — in which case the existing error message
  stands on its own.

- [#252](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/252) [`779a5b3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/779a5b3545e87d91ac9de6a7756f1412b71c9f20) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The TSLD canvas no longer freezes entirely while a bar's move or resize is being saved: pan,
  wheel zoom, hover and selection stay live for the write's round trip, and a second edit grab is
  refused visibly — a busy cursor over the surface and `aria-busy` on the container — instead of a
  drag that runs and silently applies nothing. The naming popover still holds the canvas until it
  commits, exactly as before, and the busy state clears on every settle path, including a rejected
  write.

- [#250](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/250) [`81dcf87`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/81dcf878b8477f3eacc26db791d029abca02efc1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The TSLD painter and hit-test stop redoing per-frame work: the id→activity index is memoised on
  the scene's array identity (the fan-out memo's pattern), each activity's screen rectangle is
  computed once per frame and shared by culling, routing and every incident link instead of once per
  consumer, and the pointer-move hit-test no longer rebuilds its index and re-sorts every edge on
  each mousemove while the lag tool is armed. No visual change — draw order and geometry are
  byte-identical; call-count gates pin the new bounds.

## 0.73.0

### Minor Changes

- [#248](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/248) [`7da07af`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7da07af51daf4ced6800ae90b3355f8ff6ab7139) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Alerts on the sign-in screens: the previous app's treatment, three tones, and one fact in one place.

  Every validation message on the five authentication forms was being stated **twice at once** — once
  in a tinted summary box at the top of the form and again under the field it belonged to. Reported on
  sign-up ("password insufficient is displayed in two places"), but systemic. The rule now is that a
  field's problem belongs to the field and the alert belongs to the form. Where several fields fail
  together the box shows a count rather than repeating the sentences, and it stays silent for a single
  problem, which the browser has already put the cursor in.

  Messages take the previous app's alert styling — a 4px left accent bar, a soft tint of the same
  hue and a leading icon — and gain a proper success and information treatment, so "Check your email",
  "Password changed" and "If that address has an account…" are no longer plain grey sentences. The
  floating, auto-fading placement is deliberately not reproduced: a message that disappears on a timer
  is one a slow reader never gets.

  Three things that happened silently now say so: signing out confirms it on the screen it lands on;
  a rate-limited invitation-accept explains itself instead of showing a raw server string; and asking
  for a new verification email checks the address you typed before making you wait for the server to
  answer.

## 0.72.0

### Minor Changes

- [#246](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/246) [`401eae6`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/401eae6550c9b6ed26ff4eab4eb1fce832175a10) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Restore the floating login card, its photographic panel, and one fixed login theme (ADR-0077 §8).

  The six public screens become the previous app's shape again: a 900px card floating on a soft
  gradient rather than a full-bleed split, with the navy brand panel and its amber seam beside it —
  measurements read from the old stylesheets rather than matched by eye. The card is the **same height
  on every screen** from `md` up, so moving between Sign in and Create an account no longer resizes the
  box under the reader's cursor.

  The whole login is now **theme-invariant**, via a fifth surface scope (`auth`). Previously the panel
  was pinned and the card beside it still followed the theme, so a Dark-mode visitor met a fixed navy
  panel joined to a dark card. The theme now picks up after sign-in, on the app the reader chose to
  configure.

  Two of the restored colours are corrected rather than copied: the old app's amber focus ring
  (2.02:1 on white) and field outline (2.22:1 on the field fill) are WCAG 1.4.11 failures, caught by
  the computed contrast matrix and derived down to ≥ 3:1 at the same hue.

  The panel's photograph is decoration and is served same-origin under the existing CSP; a missing
  file degrades to the navy fill with the wordmark and tagline still legible.

## 0.71.0

### Minor Changes

- [#244](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/244) [`e1cb41b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e1cb41b726facb2d5f7fec229bfe856aa50fb3e3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Measure the public screens in a real browser, and fix what the measurement found (ADR-0077 M6).

  `apps/web/e2e-public` drives the six pre-authentication routes across ten states × six viewports ×
  three themes, plus a real invitation carrying a 100-character organisation name and a fulfilled 429.
  It found four defects that no unit test could see, because jsdom has no layout:

  - The brand band was **stretched** by implicit grid `align-content`, rendering at up to **47% of a
    320×568 phone screen** against a content height of 76px.
  - The tagline rendered at every width, against its own acceptance criterion — it is a `md:` band
    caption, not phone content.
  - `/verify-email` overflowed a 320px viewport (334px) because the resend button's label could not
    wrap.
  - The invitation screens overflowed (327px) because an email address is one unbreakable token and a
    grid column is sized by min-content. `CardTitle`/`CardDescription` now use `wrap-anywhere`.

  Also from the enablement gate pass: a server error no longer takes focus off the field you were
  typing in, the reset confirmation now says your password was changed rather than only that other
  sessions ended, and the "wrong account" screen's Sign out is the primary action it always was.

- [#244](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/244) [`e1cb41b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e1cb41b726facb2d5f7fec229bfe856aa50fb3e3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Repair four blocking defects on the pre-authentication screens (ADR-0077 M1). Visually unchanged.

  - **Six states that offered nothing to press now offer something.** The resend confirmation stops
    unmounting the form it confirms — it told the reader to "check your spam folder before trying
    again" and removed the thing to try again with, on three surfaces. The invitation screens for a
    missing token, an unknown invitation and a spent invitation gain a way into the app; **wrong
    account** gains the Sign out its own copy instructs, which it had never had.
  - **Accept and join keeps focus while it works.** It used the native `disabled` attribute, which
    blurs to `<body>` when the request starts and flips back when it settles, so a keyboard user lost
    their place twice per action (WCAG 2.4.3). It is now `aria-disabled` with a guard that prevents
    the double submit.
  - **A rate-limited reader is told what happened.** Better Auth's 429 carries no error code, so every
    auth screen fell through to the library's own sentence in a bare red paragraph. All six auth
    mutations now carry the HTTP status, and one shared message says "too many attempts" — naming no
    number of seconds, because the header carrying one is discarded by the fetch client before the
    error reaches us.

- [#244](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/244) [`e1cb41b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e1cb41b726facb2d5f7fec229bfe856aa50fb3e3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - One vocabulary across the six pre-authentication screens (ADR-0077 M2).

  - **A server failure now looks at least as serious as a typo.** "Enter a valid email" rendered in a
    bordered, tinted block; "too many attempts" or "wrong password" rendered as a bare red sentence,
    in six hand-assembled copies. Both are now the same `ServerError` primitive, which announces
    itself and takes focus once.
  - **The heading is part of the state.** `/reset-password` kept "Choose a new password" as its
    heading over a body that had already told the reader their password was changed. Each screen's
    route now owns its terminal state, heading and all. `/forgot-password` also gains the loading
    branch it was missing — it used to paint the signed-out form and then replace it.
  - **One name for one action** — "Create an account", which had been "Create one", "Create account"
    and "Create your account" depending on where you stood. The primary action on a screen is always
    a button; the inline link is one shared style with a visible focus ring it never had.
  - **One card width.** The sign-in card was 384px and the invitation card 448px, so signing in and
    then accepting an invitation resized the card for no reason a reader could name.
  - Every public screen is now `noindex`, including the invitation screen, which carries a live token
    in its URL.

- [#244](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/244) [`e1cb41b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e1cb41b726facb2d5f7fec229bfe856aa50fb3e3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The public screens get a brand surface (ADR-0077 M4). This is the visible change.

  Sign-in, sign-up, the three account-recovery screens and the invitation screen now sit beside a
  fixed dark navy panel carrying the SchedulePoint mark, a token-drawn time-scaled logic diagram, and
  the tagline. Below `md` the panel becomes a band above the card.

  **The panel does not follow the theme, and that is deliberate.** A signed-out visitor cannot choose
  one — the theme boot script picks Dark from their operating system, or Corporate because a colleague
  signed in on this machine last month — so the one screen where the product has to be recognisable
  was rendering in one of three identities, chosen by something the visitor did not do and cannot
  undo.

  The diagram is the product's own picture rather than stock decoration: bars on a time axis joined by
  logic, drawn entirely in design tokens so the computed contrast suite can see it, and inline so it
  costs no request and the Content-Security-Policy cannot block it.

### Patch Changes

- [#244](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/244) [`e1cb41b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e1cb41b726facb2d5f7fec229bfe856aa50fb3e3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `brand` surface scope's token family (ADR-0077 M3). **Nothing changes for a user** — the
  family exists, complete, in all three themes, and nothing renders it yet. Shipping it separately is
  what lets the visible panel land as one revertible commit.

  The family is deliberately **theme-invariant**: identical values in Light, Dark and Corporate,
  because a signed-out visitor cannot choose a theme and something else chooses one for them. The
  computed contrast matrix now sweeps it across every theme, and the structural seam test guards it in
  the same regexes as `chrome` and `panel` — the place the protection actually lives.

- [#244](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/244) [`e1cb41b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e1cb41b726facb2d5f7fec229bfe856aa50fb3e3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Give the public screens a document identity (ADR-0077 M5).

  Every route shared one tab title, so three open tabs were indistinguishable and history offered no
  way to find the reset link you opened; each public screen now names itself, set before paint so a
  screen reader announces the new page rather than the old one. The site also gets a favicon —
  previously `/favicon.ico` fell through the single-page-app rule and browsers were handed HTML where
  they expected an icon — and a description for when a link is shared.

  No `theme-color`: the app has four theme settings and the browser's media query knows two, so any
  single value would be wrong for at least one of them.

## 0.70.4

### Patch Changes

- [#242](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/242) [`8b993ab`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8b993ab9dabb650fd0c41d29135fcd31e6c44df7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Bound every SMTP send at 10 seconds, and make wrong claims a gated defect class (ADR-0076).

  **The mail fix corrects ADR-0075's own central claim.** That ADR's risk table said mail delivery
  has "no request-path cost". It does: Better Auth's `runInBackgroundOrAwait` **awaits** the send
  unless `advanced.backgroundTasks.handler` is configured, nothing here configures one, and
  `InvitationsService` awaits its send in the handler outright. So sign-up, password-reset requests,
  verification resends and invitation creation each blocked on a live SMTP round trip bounded only by
  nodemailer's defaults — **up to ten minutes** on a socket that connects and then goes quiet. Every
  send now races a 10 s timeout it controls, taking the same swallow-and-log path as a refusal, so no
  caller-visible behaviour changes and every enumeration-uniformity property is untouched. The
  abandoned send gets its own handler, without which a late rejection would be _unhandled_ and Node
  would terminate the process — a bound added to stop an outage hanging a request would otherwise
  have converted that outage into a crash loop.

  **Operators: two log fields were renamed.** `mail.transport_unreachable` is now
  `mail.transport_check_failed`, and the failure record's `message` field is now `kind`. Update any
  alert built on the previous names. A new `abandoned: true` warn record marks a send that exceeded
  the bound and then failed anyway — filter it out when counting failures.

  **Sign-out now clears the cache on `onSettled` rather than `onSuccess`**, so a sign-out whose
  request fails (offline, proxy error, API restarting) no longer leaves the previous user's
  organisations, plans and activities in memory and on screen.

  **Two new CI gates, both pure filesystem reads.** `pnpm check:counts` re-derives `CLAUDE.md`'s six
  stage-banner figures — every one was wrong at a reconciliation pass, the correction told readers to
  re-run `ls | wc -l`, and five of six were wrong again a day later. `pnpm check:claims` pins the 34
  file-and-line citations this repository makes into `better-auth` and `better-call`: the version each
  was verified against, an anchor from the code at each cited line, and that no citation exists
  outside `scripts/dependency-claims.json`. Those citations are load-bearing — ADR-0074 hashes reset
  identifiers and ADR-0075 rejects an abort design because of them — and a minor bump moves every one
  while the prose keeps reading as authoritative. **A Dependabot bump of either package now fails
  CI**, which is the intended cost rather than a side effect.

  Also recorded: `docs/TECH_DEBT.md` [#99](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/99) (`/request-password-reset` leaks account existence through
  timing — narrowed from ten minutes to ten seconds, not closed) and [#98](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/98) (the guest share view scrolls
  sideways at 320 px, pre-existing and only observable once the canvas had height).

## 0.70.3

### Patch Changes

- [#240](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/240) [`dbee13e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dbee13e87830124873c1b39c0a17e62d34cca15c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - **Waiting to verify your email now reads honestly.** The screen said "We sent you a link to confirm
  your address" — a claim the app cannot actually make, because a failed send never reaches the page.
  Somebody staring at an empty inbox was being told flatly that it had been sent. It now says a link
  _should_ arrive, shows the address it went to (a typo at sign-up is the commonest reason nothing
  turns up), and — if a new link does not help either — says to ask whoever set up your organisation,
  because at that point the problem is at our end and resending will not fix it.

  **For anyone running SchedulePoint themselves:** the API now checks the mail server is reachable
  once at start-up and logs `mail.transport_verified` or `mail.transport_unreachable`, with the host
  and port and never the password. It will not stop the API starting if the mail server is down — a
  relay blip overnight should not take the whole application with it — and it is deliberately not part
  of the health check. It cannot tell you everything: a key that can log in but not send, or mail that
  is accepted and then bounced, still only show up when a message is actually sent. Completing one
  real sign-up to a real mailbox remains the check that matters.

## 0.70.2

### Patch Changes

- [#238](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/238) [`0afd092`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/0afd0920a374ae293c168e5b73f784c07e3122c1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - **Shared plan links now show the diagram.** The read-only share view rendered its header, toolbar
  and legend and then left an empty box where the plan should be — the canvas was being given a height
  of **one pixel**. Everything else worked, which is why it looked like the data had failed to load
  when it hadn't. Anyone you have already sent a link to will see the plan on their next visit; the
  links themselves are unaffected.

  **Signing out no longer logs an error.** The app was asking the server whether you were signed in
  immediately after signing you out, and the browser reported the inevitable refusal in the console.
  It now trusts what it just did. Signing out also clears the previous session's cached data properly,
  so nothing of yours is left in memory for the next person to sign in on a shared machine.

## 0.70.1

### Patch Changes

- [#236](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/236) [`4c3a125`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4c3a125a43db25320444fd112cdb969b9715942b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Two fixes from watching the deployed app's console during the CSP report-only window.

  **No more 404s when opening a plan.** The plan workspace reads the project behind the plan and the
  client behind the project, so on first render — before the plan has loaded — both ids were empty and
  the app asked the API for `…/projects/` and `…/clients/`, taking a 404 each time. Those reads now
  wait until they know what to ask for. Nothing was visibly broken; it was two wasted round trips and
  two console errors on every plan you opened.

  **The console no longer reports a Content-Security-Policy violation on the sign-in screen.** Zod
  tests whether it is allowed to compile validators by trying it and catching the failure — harmless,
  but the browser reports the attempt. It is now told not to try. Validation is unchanged.

- [#236](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/236) [`4c3a125`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4c3a125a43db25320444fd112cdb969b9715942b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The Content-Security-Policy now has a test that proves it, instead of relying on someone watching a
  browser console.

  The policy was written by reading our own code and checked by walking the app with the console open.
  Neither of those can see what a third-party library does when it runs — which is exactly what the
  one real violation on the live site turned out to be. So the check is now automatic: the app is
  built the way it is deployed, served with the same policy the container serves (read from the
  deployment file rather than copied), driven through the sign-in screens and the signed-in app, and
  any violation fails the build. It was confirmed to catch the original problem before being trusted.

  It deliberately does not cover everything yet — image export and the printed programme are still
  walked by hand — and says so, rather than implying more coverage than it has.

## 0.70.0

### Minor Changes

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The web origin now serves a Content-Security-Policy (report-only), plus the sibling headers it was
  missing.

  The policy is derived from what the code actually loads rather than from a template: no external
  origins at all, so everything is `'self'` except `blob:` on `img-src`, which the printed programme
  needs for its live object-URL image. The inline theme-boot script moved to `public/theme-boot.js`,
  so `script-src` needs no relaxation — no `'unsafe-inline'` and no hash to keep in sync.

  `nginx.conf` becomes an envsubst template so **the CSP mode is an operator variable**:
  `CSP_HEADER_NAME=Content-Security-Policy` enforces, and the default report-only value observes.
  Either direction is a container restart rather than a release, which matters most when the change
  being made is a rollback.

  Also adds COOP, CORP and an **enumerated** Permissions-Policy — deliberately not a blanket deny,
  because `clipboard-write` is a controlled feature and the two Copy buttons depend on it. HSTS stays
  excluded: this container listens only on plain 8080 and cannot know the browser's scheme, and HSTS
  is sticky, so it belongs at the edge.

  And `X-Forwarded-Proto` is no longer overwritten with this container's own unconditionally-`http`
  scheme (TECH_DEBT [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/89), code half). The operator half — actually sending the header from the proxy —
  is still required, and without it nothing changes.

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the three email-verification dead ends and add the `/verify-email` landing screen
  (ADR-0074 M2).

  With `AUTH_REQUIRE_EMAIL_VERIFICATION` enabled on the API, sign-up returned no session and the
  client reported success then bounced the new member to sign-in with no explanation; sign-in
  answered 403 with the library's raw message and no way forward; and the invitation-accept card
  held `emailVerified` without ever reading it. All three now branch on **runtime evidence the
  server provides** — which is why they ship unflagged: a `VITE_` constant is baked into the bundle
  long before an operator sets that env var, so a flag would strand every new sign-up on a flag-off
  bundle against a flag-on server.

  `/verify-email` is a landing screen (it never holds or spends a token) registered unconditionally,
  and a spent link is framed as "used — here is a fresh one" rather than as a failure, because a
  mail scanner following the link can burn it before the person clicks it. `AuthShell` and
  `InviteShell` converge on one shell that mounts the shared announcer, so a public screen can
  announce at all. Both auth submits move from native `disabled` to `aria-disabled` plus a submit
  guard, so focus is not thrown to `<body>` and back on every attempt.

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `/account` screen behind `VITE_ACCOUNT_SETTINGS` (ADR-0074 M3, default off).

  A signed-in member can now change their password and see whether their address is verified, with a
  resend if it is not. Both endpoints have always been reachable — there was simply no screen — so
  this flag gates a **product decision**, unlike the M2 work, whose gate is a server-side condition
  and therefore ships unflagged.

  Changing a password always signs the other sessions out, with no checkbox: the reason someone
  changes a password is usually that they think somebody else may know it, so a checkbox defaulted
  either way asks a session-management question at the worst possible moment. The screen says so
  before submit instead. A wrong current password is attached to that field rather than dropped in a
  banner above three inputs, only one of which is wrong.

  Deliberately not a settings information architecture — theme stays in the account menu, and the
  screen is the smallest surface that hosts the two things a person needed and had nowhere to do.

  Flag-off is byte-for-byte the prior product: no route is registered and the account menu has no
  entry, pinned by `account-settings.parity.test.tsx`.

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the signed-out password-reset flow behind `VITE_PASSWORD_RESET` (ADR-0074 M4, default off).

  A signed-out user can now ask for a reset link and set a new password unaided. Until now the only
  route back into a locked account ran through an operator with database access.

  `/forgot-password` shows **one** submitted state whatever the truth, and never promises delivery:
  the endpoint answers identically for a known and an unknown address and even performs a dummy
  lookup so the timing matches, so a UI that branched would hand back the enumeration oracle the
  library closed. "Reset is not available on this installation" is kept clearly distinct from "no
  such account" — it is a fact about the deployment, not about the address just typed.

  `/reset-password` captures the emailed token into component state and strips it from the URL with
  `replace: true`, so a live token does not persist in history or ride along in a later referrer.
  Success ends at a "Sign in" link rather than a navigation into the app, because the reset endpoint
  issues no session. Both screens are `noindex`, via a hook extracted from the guest-share view so
  the two cannot drift on the unmount cleanup.

  Both routes **and the sign-in link** are gated on the one constant. That is load-bearing:
  `pnpm typecheck` cannot catch a link to a conditionally-registered route, so splitting them across
  changes is how the link becomes a link to nothing. Flag-off is byte-for-byte the prior product,
  pinned by `password-reset.parity.test.tsx`.

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn on the account screens (ADR-0074 M5).

  `VITE_ACCOUNT_SETTINGS` and `VITE_PASSWORD_RESET` are now default-on, so **Your account** appears in
  the account menu — change your password, see whether your address is verified, resend the link — and
  a signed-out person who has forgotten their password can ask for a reset from the sign-in screen
  instead of needing an operator with database access.

  Changing your password always signs you out everywhere else, and so does completing a reset; the
  consequence is stated on screen before you submit rather than after.

  Both flags remain rollbacks: set either to `false` and rebuild, and the app is byte-for-byte what it
  was — the parity suites pin that.

### Patch Changes

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fold the ADR-0074 M5 gate pass — six specialist reviews over the combined epic diff, and the
  flag-on recovery journey.

  The sharpest finding is a **server-side enumeration oracle**: Better Auth's anonymous
  `/send-verification-email` equalises timing to 500 ms and mints a throwaway token for the
  unknown-address branch so the work matches — and then rethrows a transport error, which
  `better-call` turns into a bare 500. A caller submitting a candidate address therefore got a
  distinguishable answer for "exists, unverified, and delivery just failed". `SmtpMailService` now
  swallows and logs, matching `sendInvitation`; the reset send does the same, holding the property
  rather than depending on a library internal for it.

  The rest are client-side: the same outcome was announced twice through two live regions in four
  components; focus was dropped to `<body>` whenever a form was replaced by its outcome; the sign-in
  `EMAIL_NOT_VERIFIED` state had no way back to the form; the invitation-accept flow lost the status
  announcement the old `InviteShell` carried; and `/verify-email` named "that link has been used" as
  the cause — the one cause that cannot produce that state, since a second visit to an
  already-verified address takes the library's success branch.

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Stop blocking every invitee from accepting an invitation (ADR-0074 M5).

  The accept screen refused anyone whose address was unverified — but unless a deployment enforces
  verification, **no** address is verified, so it refused everyone, telling them to confirm an address
  the server did not require and hiding Accept behind it.

  The invitation preview now reports whether this server actually enforces verification, and the
  screen refuses only when it does. The client had no other way to know, and guessing was the defect.

- [#234](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/234) [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix two dead ends on the email-verification path, both reachable only when an operator sets
  `AUTH_REQUIRE_EMAIL_VERIFICATION` (ADR-0074 M5).

  Following a verification link left the reader on the "we sent you a link" screen even though the
  address had just been verified: the router JSON-parses search params, so `?verified=1` arrived as
  the number `1` and the route discarded it. And the **first** verification email — the one sign-up
  sends — carried no return destination, so it verified the address and then bounced the new member to
  the sign-in screen with nothing said about why. Both send paths now point at the confirmation screen
  through one shared constant.

  Found by the flag-on journey (`test:e2e:account-verify`), which is now wired into CI.

- Updated dependencies [[`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184), [`4013dcd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4013dcd462eef2862fe51ae679de5b29b4ead184)]:
  - @repo/types@0.26.0

## 0.69.1

### Patch Changes

- [#232](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/232) [`1657e38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1657e38b52a4dfd37b27e8e6a6f7de7d06012779) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Dependency refresh — accepts the open Dependabot proposals after verifying them together rather
  than trusting seven separate CI greens.

  Runtime: **jspdf 3.0.4 → 4.2.1** (major), lucide-react 1.28.0, react-hook-form 7.84.0,
  @tanstack/react-query 5.101.4, @tanstack/react-virtual 3.14.9. Build/dev: vite 8.2.0,
  tailwindcss + @tailwindcss/vite 4.3.3, @vitejs/plugin-react 6.0.5, prettier 3.9.6, turbo 2.10.8,
  lint-staged 17.3.0, and the @types/@nestjs/@swc tooling.

  **The jsPDF major was verified against the real library, not the mock.** `pdf.test.ts` mocks
  `import('jspdf')` by design — its own docblock says "no real jsPDF runs" — so a green unit suite
  proves the call _shape_ is unchanged and nothing about whether v4 accepts those calls. The four
  call sites (`new jsPDF({orientation, unit, format})`, `internal.pageSize.getWidth/getHeight`,
  `addImage(dataUrl, 'PNG', x, y, w, h)`, `save(filename)`) are type-identical in v4, v4 carries the
  same dependency set as v3, and a smoke test through the real v4 produced a valid landscape-A4 PDF
  (841.9 × 595.3 pt, `%PDF-` header). The lazy import still code-splits into its own chunk.

## 0.69.0

### Minor Changes

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix: filtering the audit log by two categories at once no longer fails

  Choosing **Deletions** and **Access** together — or Deletions and Settings — was rejected by the
  API. The limit on how many event kinds one request may name was written down as a number when the
  log had twenty of them; the log now has thirty-nine, and two ordinary chips came to more than the
  old limit allowed. The limit is now worked out from the list of events itself, so it cannot fall
  behind again.

  Also from the same review pass:

  - An import that succeeded could return an error if its own log entry failed to save — and leave the
    plan locked for editing. The entry is now written on a best-effort basis, matching what the code
    around it already said it did: a missing line in the log, never a failed import.
  - The audit log's description of what it records had fallen a milestone behind what it actually
    records — it named deletions inside a plan but not scheduling settings, baselines, calendar and
    resource changes, or imports. It now describes the rule rather than listing examples.
  - "Clear filters" looked unavailable while still reacting to the mouse.
  - The filter row is no longer boxed, matching every other filtered list in the app.
  - The Outcome control is no longer announced twice by a screen reader.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make a failed sign-in readable by the account it was aimed at (ADR-0073 C2, closing TECH_DEBT [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/91)).

  `auth.sign_in_failed` was the one audited event with neither an organisation nor an actor, and both
  read endpoints filter on exactly those columns — so the single most useful row an audit log has to
  offer, somebody trying to get into your account, was reachable only from `psql`.

  The attempted address is now resolved to a user id at **write time**, into `subject_id`, and
  `GET /api/v1/me/audit-events?include=attempts` returns those rows to that account holder and to
  nobody else. Not at read time: addresses get reassigned, so a read-time join would silently move one
  person's history into another person's account as the mapping changed. Attribution is therefore
  forward-only — the table refuses `UPDATE` by design, so rows written before this cannot be
  attributed later.

  The sign-in response is unchanged whether or not the address exists, so this is not an
  account-existence oracle. Omitting `include` returns exactly the response the route gave before.

  `VITE_AUDIT_SELF_SECURITY` gates the **My activity** surface, which explains what a "Not signed in"
  row means and — as importantly — what it does not prove.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record changes to the rules a plan is judged by in the audit log

  Five new audit events (ADR-0073 C3.2, family E): a plan's scheduling settings changed, a calendar's
  working time changed, and a baseline captured, activated or deleted.

  These are **updates**, which the log deliberately does not record in general — they earn a row
  because they change how _other people's_ work is evaluated. Moving a plan's data date, editing a
  shared calendar's working week, or activating a baseline re-dates or re-measures work owned by
  people who did not make the change and are not told.

  A plan row is emitted **only when a governance field actually moved**, and names the fields: a
  rename writes nothing, and resending the settings form unchanged writes nothing. A calendar row
  names _which kind_ of working time changed — the working week, the hours-per-day factor, or a dated
  exception — rather than dumping the hours, so the fact a reader needs is not buried. All three
  exception routes fold into the one action, because an exception is working time.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record where an imported programme came from in the audit log

  Importing a schedule now writes an audit event naming the file, the format, how many activities and
  links arrived, and how many findings the import report raised.

  A plan somebody built is a sequence of choices with a person behind each one. An imported plan
  arrived whole, from a file, and the file is not kept — so a week later nothing distinguishes five
  hundred imported activities from five hundred typed ones, and "where did this programme come from?"
  had no answer at all. Now it does, with a name and a time against it.

  A dry-run records nothing: it reads a file and changes nothing. A failed import records nothing
  either — including one that gets as far as creating the plan and is then rolled back.

  This completes the audit log's mutation coverage. Every route in the API is now either audited or
  explicitly and permanently excluded for a stated reason; there is no longer any route parked as
  "we'll decide later".

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record what the shared calendar and resource libraries offer in the audit log

  Seven new events (ADR-0073 C3.3): a calendar deleted, retired, restored to use or moved between the
  shared and project tiers, and a resource deleted, retired or restored.

  **Retiring is the change this exists for.** An archived calendar or resource keeps scheduling
  exactly as it did, keeps every plan and assignment already using it, and refuses only a _new_ use.
  Nothing breaks and nobody is told — so the first anybody hears of it is a colleague asking why they
  can no longer pick something they used last month. That question now has an answer with a name and
  a time against it.

  Retiring and restoring are separate events rather than one with a flag, because the question a
  reader asks is "what was retired?". A single edit that changes a calendar's working week _and_ its
  tier records both, linked together, so neither fact hides inside the other. Deleting a resource
  group records one event carrying how many resources went with it, not one per resource.

  The web copy says "retired" rather than "archived" throughout, because nothing was deleted.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Narrow the audit log by category, outcome and date — behind `VITE_AUDIT_FILTERS` (default off).

  Seven distinct kinds of event arrived in one undifferentiated reverse-chronological stream. Both
  audit screens now carry a filter bar: category chips, an outcome choice and a date range, with the
  result in the URL so a narrowed view survives a reload and can be pasted to a colleague.

  Categories are questions a reader arrives with — Access, Deletions, Sign-ins — not the twenty
  machine names underneath. They never travel on the wire: the client expands the chosen ones into
  actions before building the request, so the API keeps one vocabulary and a category renamed for
  legibility is a copy change rather than a breaking API change.

  Which chips appear is derived from the vocabulary rather than listed. The organisation screen cannot
  offer Sign-ins (those rows carry no organisation, so the choice could only ever return nothing), and
  a category holding no actions yet stays off screen until its first action lands. A chip that can only
  answer "no events" is the defect this filter exists to remove.

  A narrowed view that finds nothing now says so, in different words from a log with nothing in it.

  Flag-off is byte-for-byte the current screens — no bar, and no filter parameter even with a filter
  sitting in the URL from a flag-on build.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Filter the audit log by category, outcome and date range (ADR-0073).

  Both audit reads accept `action`, `outcome`, `from` and `to`. An unknown value is a 422 naming it
  rather than an empty page — an audit log answering "no events" to a misspelled filter reads as
  evidence that nothing happened. The organisation route additionally refuses `auth.*` actions, whose
  rows carry no organisation and could only ever return nothing there.

  The web bar puts the chosen filter in the URL, so a narrowed view survives a reload and can be
  pasted to a colleague. The API takes actions, never categories: categories are a reading aid the
  client expands before it builds the request, so renaming one for legibility is not a breaking API
  change. `VITE_AUDIT_FILTERS` is on by default; setting it to `false` restores the prior screens
  byte-for-byte.

- [#231](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/231) [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: record deletions and structural changes inside a plan in the audit log

  The audit log now answers "who removed this?" for work inside a plan, not only for clients,
  projects and plans themselves. Six new events (ADR-0073 C3.1, family D): an activity deleted or
  restored, a WBS summary dissolved, activities regrouped, and a logic link added or removed.

  Each is **one row per action, not per swept row** — deleting a summary with forty-one descendants
  records one event carrying the counts, so a reader can see that one person did one thing. A link
  records its **direction** by name, which is the fact planners most often need settled. Nothing is
  written when the write is refused by the edit-lock or rolled back.

  Also fixes a promise the log had never kept: a cascade delete of a client, project or plan recorded
  its batch id and not its **size**. All four levels now carry scalar counts.

  Editing an activity's own fields stays deliberately unrecorded — it changes nothing outside that
  activity, and the row already carries who last changed it. Both audit screens now say so instead of
  saying "not recorded yet".

### Patch Changes

- [#229](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/229) [`9195476`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/91954761673ced07841fd0e4e0dec0ee04a10bfd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Say what the audit log actually records, on both screens.

  The organisation log's subtitle promised "permission changes, deletions and sign-ins for this
  organisation". A sign-in can never appear there: authentication happens before an organisation is
  known, so those rows carry no organisation and the read filters on exactly that column. And its
  empty state said "No events recorded yet", which asserts that nothing happened — when what it
  actually means is that building a plan is outside what this log records today.

  Together those two sentences sent the first person who opened it looking for work that was never
  going to be there, and left them with no way to tell a working feature from a broken one. Both
  screens now name the boundary: what is recorded, what is not recorded _yet_, and which of the two
  screens carries sign-ins.

  No behaviour change — copy only. Activity-level edits remain outside the log's M1 scope.

- Updated dependencies [[`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962), [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962), [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962), [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962), [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962), [`746220c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/746220c412ebd4f28370f0b41c131b6f8792b962)]:
  - @repo/types@0.25.0

## 0.68.0

### Minor Changes

- [#227](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/227) [`ec31372`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ec31372edc9fd8534a7eee71670fc50660dfbaf1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the append-only audit log (ADR-0072), closing `docs/TECH_DEBT.md` [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/14)(a)/(a2).

  Twenty events are recorded into a table the database itself refuses to update or delete —
  membership role changes and removals, invitations created, revoked and accepted, organisations
  created, guest share links minted and revoked, five authentication events, and hierarchy deletes
  and restores carrying the cascade's own batch id, so one user action reads as one row rather than
  forty.

  A share link is the widest permission change the product offers — it grants a read of plan data to
  somebody with no account, and revocation is the only way that grant ever ends — so it is recorded
  with the plan it exposed and how long for. Neither the raw token nor its hash goes anywhere near
  the payload: the token IS the credential and the hash is what the guard compares against, so either
  would turn an Org-Admin-readable log into a key store. The allow-list does not name them and the
  substring ban catches both words, and a test asserts the outcome against the stored row.

  Membership and hierarchy events are written **inside the caller's transaction**: an action that
  cannot be recorded does not happen. Authentication events invert that deliberately — there is no
  transaction to roll back, and refusing every sign-in because the audit table is unavailable would
  turn a logging fault into an outage.

  Two reads: `GET …/organizations/:slug/audit-events` for an Org Admin, and `GET /me/audit-events`
  for anyone. The self route takes no user id at all, so there is nothing to tamper with and no
  permission to hold — an ordinary member can see their own sign-in history without asking.

  Two screens behind `VITE_AUDIT_LOG` (**on by default**; set it to `false` to roll back to the prior
  product exactly — there is no write path here to leave behind): **Audit log** in the organisation
  nav for an Org Admin, and **My activity** in the account menu for everyone. Both render from one list component,
  so the two views cannot drift about how an event reads. A caller without `audit:read` is told so
  rather than shown an empty table — "no events" and "you may not see these" are the one distinction
  an audit log must never blur.

  Every route in the API is now gated on an audit decision: a new endpoint that is neither audited nor
  explicitly excused with a named reason fails CI.

### Patch Changes

- Updated dependencies [[`ec31372`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ec31372edc9fd8534a7eee71670fc50660dfbaf1)]:
  - @repo/types@0.24.0

## 0.67.2

### Patch Changes

- Updated dependencies [[`8781957`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8781957f4d2399215ac00915599354c3ab5621c3)]:
  - @repo/interchange@0.9.0

## 0.67.1

### Patch Changes

- [#221](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/221) [`2788c77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/2788c77e7866b9d722ca00635f7afafa08a5b86c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - **Breaking:** remove the day-denominated `relativeFloat` from the float-paths response.

  `GET …/schedule/float-paths` shipped in `api-v0.38.0` carrying two float figures: `relativeFloatMinutes`
  (the engine's, correct) and `relativeFloat` (days, computed as a flat `minutes / 1440` and marked
  deprecated). The day field is now gone. Read `relativeFloatMinutes` and convert against the calendar
  you are presenting on.

  It was retained one release on the argument that "deleting it breaks an existing reader for no gain".
  There are no readers — the web client has only ever read the minutes field — so that argument had
  nothing behind it, and what remained was a field returning a **plausible wrong number**: on an
  eight-hour calendar one working day of relative float (480 minutes) came back as `0`, which does not
  read as an error, it reads as "on the driving path". A wrong value that looks right is worse than an
  absent one, because the only thing between it and the next consumer is a description nobody has to
  read. Deprecation warns whoever looks; removal is checked by the compiler.

  There is deliberately no replacement day field. A float path can span activities on different
  calendars, and after ADR-0068 a day is a per-calendar quantity — so the envelope has no single factor
  to divide by. Picking one and being wrong for the rest is exactly what the removed field did.

  Also in this change, on the web side:

  - **The derived-duration preview in the resource assignment row was measuring days at a flat 1440**
    — the same defect one surface along, still live. "Duration becomes …" told a planner on an
    eight-hour calendar that a one-working-day derivation was **"0.3 days"**. It now takes the
    activity's `hoursPerDay` as a required, never-defaulted parameter (ADR-0070's rule) and renders in
    the same `d`/`h`/`m` grammar the duration field itself uses, degrading to hours and minutes when
    the calendar has not resolved rather than guessing a factor.
  - The "spell minutes without a day factor" arithmetic had been written out in **three** places. It is
    now one shared `formatWorkingMinutesNoDays`; the assignment-lag field and the float-paths panel
    both delegate to it.
  - A stale docblock on `ScheduleService.floatPaths` still described the return as "working days
    (÷1440)" — it had gone on saying so after the behaviour changed underneath it, which is the
    ADR-0058 failure one method along from the fix.

- Updated dependencies [[`2788c77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/2788c77e7866b9d722ca00635f7afafa08a5b86c)]:
  - @repo/types@0.23.0

## 0.67.0

### Minor Changes

- [#219](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/219) [`874037f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/874037facb4de56143f98e120df8dd655fbdad31) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show the selected **float path** on the diagram and in the Gantt (behind `VITE_FLOAT_PATHS`) — audit
  F4, M2–M3.

  Expanding a path in the Float paths panel recedes everything that is not on it, in whichever view is
  showing. One derived id-set feeds both, so the two cannot disagree about which activities are on the
  chain — a disagreement that would only ever surface in a screenshot or a printed programme.

  - **Canvas:** contributes members to the `dimmedIds` set the painter already reads once per culled
    bar. **No new scene field and no new paint branch** — the painter is already measured at
    16.7–23.1 ms p95 against a ≤ 4 ms budget (`docs/TECH_DEBT.md` [#75](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/75)), and that claim is a test
    asserting what the painter is handed, not a note in a docblock.
  - **Gantt:** a new de-emphasis treatment, since the grid had none. Visual only — a receded row keeps
    its tab stop, its `aria-rowindex` and its activation, and carries the reason in words rather than
    by opacity alone.
  - Activating a chain row selects the activity and brings it into view **without taking focus**, so
    the planner stays in the panel they are reading. In the Gantt that means expanding a collapsed WBS
    parent first, then scrolling through the virtualizer — `scrollIntoView` on an unrendered row is a
    silent no-op.

  The canvas listbox's dim marker is rebuilt as a reasons array rather than nested ternaries. Two
  causes were four readable branches; three would be eight, and one of the eight ends up wrong with
  nobody noticing.

  **The CPM engine is not imported.** The ADR-0034 recalc parity gate is untouched by construction,
  and flag-off is byte-for-byte the prior product in both views.

- [#219](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/219) [`874037f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/874037facb4de56143f98e120df8dd655fbdad31) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn the **Float paths** panel on by default (`VITE_FLOAT_PATHS`) — audit F4, M4.

  The engine has computed multiple float paths since ADR-0035 §19 and the endpoint has exposed them
  since the reconciliation pass; nothing in the web client referenced either. A planner asking the
  compression-planning question — "if I shorten the critical path, what binds next, and by how much?" —
  can now ask it in the product: pick a target, read the ranked chains with the relative float on each,
  and expand one to recede everything off it in whichever view is showing.

  Enabling it ran the five specialist gates over the combined M0–M3 diff, which found **twelve**
  blocking defects in code that had already passed a human read — the recurring shape (ADR-0064 §7) of
  a correct pattern applied to one control and not its neighbour. The ones worth naming:

  - A chain member the client does not hold was styled unactivatable with `pointer-events-none`, which
    styles a refusal without enforcing it — a keyboard `Enter` walked straight past it into a selection
    of an activity that is not there. Now a real click guard.
  - The Gantt's de-emphasis was carried by **opacity alone** (WCAG 1.4.1) and announced on the activity
    rows but not on the WBS bucket rows. Both fixed; the marker's wording is single-sourced, because
    the canvas listbox renders it too.
  - The Gantt never fed the workspace selection at all — a **pre-existing** defect this epic did not
    introduce. Clicking a bar in the chart set the logic activity but not the workspace's selected
    activity, so every surface derived from it (this panel's target suggestion among them) was blind to
    a click in one of the app's two views.

  The API change is the security gate's one hardening suggestion, taken: a per-IP throttle (20 requests
  / 60 s) on `GET …/schedule/float-paths`, declared in OpenAPI. Unlike the earned-value and histogram
  reads beside it, this endpoint is **not** a persisted read-model — it runs a full `computeSchedule`
  per request.

  A flag-on Playwright journey (`apps/web/e2e-float-paths/`, its own CI step) drives the panel against
  a real API with the pen enforced on an eight-hour calendar, asserting the stored
  `relativeFloatMinutes` from the API alongside the `+1d` the planner reads — the only place the
  per-calendar conversion this epic exists to have fixed can be checked end to end. The flag-off parity
  suite is kept unchanged: it is the rollback contract.

- [#219](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/219) [`874037f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/874037facb4de56143f98e120df8dd655fbdad31) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the **Float paths** panel (behind `VITE_FLOAT_PATHS`, default off) — audit F4, M1.

  The engine has computed the ranked contiguous driving chains into an activity since M6-F6
  (ADR-0035 §19), and `GET …/schedule/float-paths` has exposed them since the reconciliation pass that
  followed. **Nothing in the product ever called it.** So the question a planner actually asks — _if I
  compress the critical path, what binds next and by how much?_ — could be answered by SchedulePoint's
  engine and only read in the tool SchedulePoint exists to replace.

  Flag ON adds a **Float paths** item to the toolbar's `find` group and a docked right panel that
  ranks the chains, live in **both** the Diagram and the Gantt: it is an analysis, not a viewport
  command. Relative float renders from `relativeFloatMinutes` on the target's calendar, never the
  deprecated day field. The panel fetches on open with `staleTime: 0` — a measured decision
  (100.4 ms p95, 0.61× a recalculate on a 540-activity plan), not a guess.

  **Three fixes this milestone's design review found in shipped code, none flag-gated:**

  - The **Gantt did not feed the workspace selection**. It wrote only its own `logicActivity`, so the
    toolbar's selection-aware items (Update progress, Add note, Clear visual placement) answered with
    a stale _canvas_ selection while the Gantt showed something else — and were shaded forever in a
    session that started in the Gantt. Both stores are now written together, which is what this file's
    own comment already claimed ("selection is workspace state, not view state").
  - **Isolate logic path was lit and inert in the Gantt.** It drives canvas state only `TsldPanel`
    reads, and `TsldPanel` is unmounted there. It now shades with "Only in the diagram view".
  - A chain member the client does not hold was styled un-activatable but **was still activatable**:
    `pointer-events-none` styles a refusal, it does not enforce one, and a keyboard Enter walks past
    it. Now `aria-disabled` plus a click guard, the shipped rule.

  Flag-off is byte-for-byte the prior product — no toolbar item (not even a placeholder), no panel, no
  query — pinned by a parity suite that is the rollback contract.

  **The CPM engine is not imported.** The ADR-0034 recalc parity gate is untouched by construction.

### Patch Changes

- Updated dependencies [[`874037f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/874037facb4de56143f98e120df8dd655fbdad31)]:
  - @repo/types@0.22.0

## 0.66.0

### Minor Changes

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Set how far into an activity a resource joins it (behind `VITE_ASSIGNMENT_LAG`)

  The CPM engine, the resource histogram, the levelling pass and the Earned-Value read have all
  carried a per-assignment join lag for several releases — a crane arriving four days into a fortnight
  schedules, loads, levels and earns correctly — and **nothing in the product could set one**. It could
  be imported, and that was the whole of it. The engine-surface audit's F6 closes here.

  Behind the flag, the assign form and each assignment row gain a **Joins after** field reading the
  same `d`/`h`/`m` grammar as durations and lags (`2d`, `4h`, `90m`; a bare number still means days).
  It is measured against the activity's **saved** calendar, not the calendar a pending edit has
  selected: an assignment write does not carry the calendar with it, so converting `2d` against an
  unsaved choice would store minutes measured on a calendar the activity does not have.

  Where that factor cannot be resolved — the calendar list still loading, absent, or missing the bound
  row — the field keeps hours and minutes and refuses days, saying so. That is deliberate rather than a
  gap: unlike a relationship lag there is no whole-days fallback to degrade to, and hours and minutes
  need no factor at all, so a planner can still type a four-hour lift while the list is in flight. Only
  the unit that depends on a calendar has to wait for one.

  A lag is hidden for a zero-span milestone, which has nothing for it to sit inside, and a lag of zero
  appends nothing to a read-only row — "0 d" reads as a setting somebody chose when it is simply what
  every unlagged assignment has. Rollback: set `VITE_ASSIGNMENT_LAG=false` and rebuild. An existing lag
  keeps scheduling, loading and earning exactly as it does now; the surface stops offering it, and an
  assign request goes back to the body it sends today — with no `lagMinutes` key at all, rather than an
  explicit zero that would overwrite a colleague's value.

- [#211](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/211) [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn the per-assignment **join lag** on by default (`VITE_ASSIGNMENT_LAG`), and fix what the
  enablement gates found.

  A join delay — how far into an activity a particular resource actually arrives — has scheduled,
  loaded, levelled and earned correctly since ADR-0071 M0–M3, and until now nothing in the product
  could set one. It is now a "Joins after" field on the assign form and on every assignment row,
  reading the `d`/`h`/`m` grammar against the **activity's own** calendar.

  Five defects the deferred specialist reviews found in code that had already passed a human read:

  - **A compound duration was silently converted at the wrong factor.** With the activity's calendar
    not yet resolved, `2d4h` slipped past the day-check (which needed a space before the next unit)
    and was measured at a placeholder 24 hours a day — storing 3,120 minutes where 1,200 was meant,
    accepted, with no error shown. The check now tokenizes through the parser's own splitter, so the
    two cannot disagree.
  - **The row's Save used the native `disabled` attribute**, which blurs focus to the page body twice
    per save. It is `aria-disabled` with a real click guard.
  - **The assign form refused a day-denominated lag by doing nothing** — no error registered, nothing
    announced, no focus moved, and the Assign button still lit. It now reports the refusal the same
    way its sibling link form always has.
  - **One entry route never received the day factor**, so the field there was permanently degraded:
    it rendered, looked right, and refused `2d` on a plan whose calendar was perfectly resolvable.
  - **The placeholder offered `0d`** even while the label said the field could only take hours or
    minutes — an example in the unit it was about to refuse.

  A flag-on journey (`apps/web/e2e-assignment-lag/`, its own CI step) proves against a real API, with
  the pen enforced, that `1d` on an eight-hour calendar stores 480 minutes and not 1,440, that the
  write is pen-gated, and that the optimistic version round-trips across two consecutive saves.

  Rollback stays byte-for-byte: set `VITE_ASSIGNMENT_LAG=false`. Nothing persisted depends on the
  flag, and the flag-off parity suite is kept as the contract.

### Patch Changes

- Updated dependencies [[`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985), [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985), [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985), [`5acf551`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5acf551ee0891948440798a74662e40d9917b985)]:
  - @repo/types@0.21.0
  - @repo/interchange@0.8.0

## 0.65.0

### Minor Changes

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Set the critical float threshold — the near-critical band a planner actually asks for

  Under the default **Total float** critical-path definition, an activity is critical when its total
  float is at or below the plan's **critical float threshold**. The field was writable on the API,
  carried on the shared type and consumed by the CPM engine — and had **no control anywhere in the
  app**. Every reference in the web source was a seed value in a test fixture, so the threshold was
  pinned at 0 on every plan and _show me everything within five days of critical_ — the question P6
  users ask constantly — could not be asked, though the engine has always been able to answer it.

  It now sits in **Schedule settings**, last in the float & critical group, because it only means
  anything under the definition two controls above it.

  The field reads the same `d`/`h`/`m` grammar as a duration, so a planner types `5d`, `4h` or `90m`
  rather than a raw minute count. A day is resolved on the **plan** calendar and the hint says so out
  loud: the threshold is plan-level while total float is measured on each activity's own calendar, so
  on a mixed-calendar plan an activity on a different calendar is still compared against a figure
  typed in the plan calendar's days. Naming which day you are typing in is a disclosure rather than a
  fix, and it beats the alternative of saying nothing. Where the calendar's hours cannot be resolved
  the field degrades to plain working minutes — the one unit that needs no factor — rather than
  guessing one.

  Found by the new `check:surface-contract` gate on its first run, not by the manual audit that
  preceded it (surface audit F7).

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - One calendar exception can cover a shutdown, instead of fourteen separate days

  `calendar_exceptions` has stored a **range** since the table was created — `start_date`, `end_date`,
  and a Postgres exclusion constraint over `daterange(start_date, end_date, '[]')` to stop two
  exceptions overlapping — the read DTO has always returned `endDate`, and the CPM engine has always
  scheduled across the whole span. Only the write paths collapsed it, so a Christmas fortnight, a
  two-week turnaround or a plant shutdown had to be entered as ten to fourteen separate one-day
  exceptions, one at a time, on a schema and a read model that both described the range the planner
  actually meant (surface audit F2).

  The exception editor now takes **From** and **To (optional)** — empty still means a single day,
  which is what a date on its own has always meant, so nothing a planner already knows how to enter
  changes. Existing exceptions read back exactly as before.

  An exception's **last** day is also editable. Its **first** day still is not: moving an exception is
  indistinguishable from deleting one and adding another, which the neighbouring actions already do
  visibly — but extending a shutdown by two days is not moving anything, it is the edit a planner most
  often needs, and the alternative is the delete-then-recreate the edit endpoint exists to remove
  (there is a window in between during which a holiday is an ordinary working day, and a
  recalculation landing in it schedules work).

  A range that ends before it starts is a 422 naming both dates — an empty range is the one shape the
  overlap constraint cannot express, because it overlaps nothing. A span that would collide with the
  next exception along is the same 409 as adding a duplicate day, from the same translation of the
  same constraint. A span longer than 10,000 days is refused: a year typed as 2226 rather than 2026 is
  a typo, and it is also the bound the engine's calendar build now relies on, since it expands each
  exception once per recalculation and the "single day, so O(E)" premise no longer holds.

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Report a four-hour remainder, instead of rounding it to "no work left"

  ADR-0070 made an activity's **duration** sub-day authorable and left its **remaining work** a
  whole-number days box. So a planner could type `4h` for the duration, report progress, and then
  state the remainder only as `0` or `1` day — and on an incomplete activity `0` is not a rounding
  artefact, it is also the value that means _no work left_. The asymmetry sharpened it: the derived
  remaining (percent × duration) is minute-exact, so stating the remainder explicitly was **less**
  precise than saying nothing (surface audit F3).

  `remainingDurationMinutes` joins the progress DTO as the mutually-exclusive sibling of
  `remainingDurationDays` — the same pair `api-v0.34.0` gave duration and lag — and the activity
  response and `ActivitySummary` now carry it, so a sub-day remainder can be read back exactly rather
  than as the `0` its day field rounds to.

  The progress editor's field takes the same `d`/`h`/`m` grammar as a duration, reusing that field's
  predicate, degrade rule and flag rather than a second reading of `2d 4h`. Blank still means "derive
  it from percent complete" — which is the one thing this field has that a duration does not, and the
  only part the shared module does not own. Where the calendar's working hours cannot be resolved it
  degrades to whole days, which is the same code path as flag-off, so the rollback contract and the
  not-yet-loaded state cannot rot apart.

  The seeder now sends the minutes its spec already held, instead of rounding them and recording the
  loss as an approximation — a sub-day remainder in a seeded plan was never what the spec asked for.

  With this, `pnpm check:surface-contract` reports **zero gaps**: every writable field on a scheduling
  DTO and every CPM engine input has a surface a planner can reach, or a written reason why not.

### Patch Changes

- [#209](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/209) [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Say which progress date moves the schedule and which is only a record

  A planner could set a **suspend date** on an in-progress activity, recalculate, and get exactly the
  dates they would have got without it. The field is validated, stored, returned, displayed and
  exported to XER and MSPDI — and the recalculation does not read it. `EngineActivity` has no such
  field and the schedule repository does not even `select` the column. Only the **resume** date is
  load-bearing: it floors the remaining work at `max(data date, resume date)`.

  Nothing on screen said so, and the two fields sit side by side looking identical. Each now carries a
  one-line hint: the suspend date is recorded only, the resume date is what the remaining work
  schedules from.

  ADR-0035 §4 also claimed "the suspended window is excluded from actual duration", which has never
  been implemented and has no consumer anywhere. That clause is withdrawn rather than left standing —
  implementing it stays open as a separate decision, because it would change computed actual duration,
  and therefore dates, on every plan already carrying a suspend date.

- Updated dependencies [[`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a), [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a), [`be6d973`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be6d9734df22b68d863bbb746250a5942983f39a)]:
  - @repo/types@0.20.0

## 0.64.0

### Minor Changes

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Say how many hours "one day" means on a calendar (behind `VITE_CALENDAR_SHIFT_EDITOR`)

  The calendar form can now author intraday hours, but nothing in the product could say what a _day_
  was worth on the resulting calendar — so an activity entered as "1 day" on an 08:00–17:00 week was
  1440 working minutes, which is 2.67 of that calendar's working days.

  The form gains a **Standard working day** field (Primavera P6's `day_hr_cnt`, ADR-0068). Beside it,
  the week you have actually authored is reported — "the week above works 8 hours on a typical day" —
  as advice rather than an override, because the two are legitimately allowed to differ: a
  `day_hr_cnt` of 8 on a calendar with a 10-hour Saturday is ordinary P6.

  Changing it on an existing calendar shows what that means, in the terms a planner cares about:
  **every existing duration re-reads, no dates move, and no work is rescheduled**. An activity showing
  "10 days" today will show a different number after saving, because the stored hours never changed —
  only the size of the day they are divided by. That is the hazard worth stating: a planner who
  remembers "12 days" and retypes it after the change has just made a real, dates-moving edit that
  looks like a correction.

  Leave the field alone on a new calendar and the server derives it from the week being written, which
  is what it has always done for every calendar authored before this field existed.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Author a calendar's working hours, not just its working days (behind `VITE_CALENDAR_SHIFT_EDITOR`)

  ADR-0036 gave calendars intraday shift patterns a year ago — split shifts, night shifts crossing
  midnight, asymmetric weeks with a half-day Friday. The engine has scheduled all of it since. The
  calendar form offered seven weekday checkboxes, which can say only _whether_ a day works.

  Behind `VITE_CALENDAR_SHIFT_EDITOR` (default off) the week becomes seven lists of `HH:MM` periods.
  A day with no periods doesn't work; a day with two is a split shift. A night shift is two periods on
  two days — 20:00–24:00, then 00:00–06:00 — which the editor states and writes literally rather than
  inferring on read, because that inference is indistinguishable from a genuine 24-hour calendar.

  Times are text, not `<input type="time">`: storage ends a full day at **24:00** and the native
  control stops at 23:59. Reading `00:00` back as 24:00 was rejected — 00:00 is a legitimate start.

  The rows are built on a new shared `WindowListEditor`, which the dated-exception editor will use
  too. One primitive because a window is authored in two places, and two editors would have to
  independently agree about ordering, overlap and midnight — a disagreement only a planner who
  authored the same hours both ways would ever see.

  Ordering and overlap are checked before the request goes out, so the message names the row you
  typed in rather than a pair of minutes; the API stays the enforcing boundary. Every day's problems
  are reported at once rather than one save at a time.

  Flag off, the seven checkboxes are unchanged and the existing suites pin them — they are the
  rollback contract, kept rather than weakened. A new calendar's default week is still full days, so
  the meaning of a "1 day" duration is exactly what it is today.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The calendar shift editor is on by default (`VITE_CALENDAR_SHIFT_EDITOR`, ADR-0067 Accepted).

  A planner can now author what storage and the CPM engine have held for a year: split shifts, a
  four-hour Friday, a night shift across midnight, a calendar with no working week at all, and the
  standard working day that decides what "5 days" means on it. Rollback is `=false` and a rebuild;
  the flag-off surface stays pinned by its own suites rather than weakened.

  Its flag-on journey (`apps/web/e2e-calendar-shifts/`, its own CI step) earned its place on the
  first run by finding a defect no unit test could: a menu opened from inside a modal `<dialog>` was
  unclickable, because a modal dialog lives in the browser's top layer and the shared `Menu` portalled
  to `document.body`, which no z-index can reach. jsdom has no top layer, so 3,200 passing unit tests
  had nothing to say about it. `Menu` now portals into the topmost open dialog — a fix every future
  menu-in-a-dialog inherits.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Give a dated exception its actual hours, and let one be corrected in place (behind
  `VITE_CALENDAR_SHIFT_EDITOR`)

  A calendar exception could say only that a day works or doesn't. A half-day before a shutdown, or a
  turnaround day with a short crew, had to be entered as a whole worked day — the schedule then
  planned eight hours of work into four, and the screen showing the exception said "Working day", so
  nothing on it was visibly wrong.

  The Type control gains a third option, **Working — specific hours**, which opens the same
  `WindowListEditor` the weekly pattern uses. A row now shows the hours it works beside its badge, so
  a half-day reads as a half-day in the list rather than only inside the form.

  Each row also gains **Edit**. Before this, correcting an exception's hours meant removing it and
  adding it back: two writes, a new id, and a window in between during which the holiday had become an
  ordinary working day — a recalculation landing in that window would have scheduled work on it. The
  edit is gated on the exception's own `version`, so two tabs is a conflict rather than a silent
  overwrite. The date stays fixed, because moving an exception is remove-then-add and both of those
  actions are already there.

  A whole worked day still reads back as **Working day**, not as `00:00`–`24:00` in two text fields —
  that is the round trip of the shorthand the API writes, and re-authoring a value nobody chose is how
  a Save that touched nothing would change something.

  Flag off, this surface is exactly what it was, and the existing suite pins it.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Extract two shared primitives from the canvas authoring surface, and honour either arrow key on the
  Add and Link split buttons (TECH_DEBT [#76](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/76)).

  Four hand-rolled "message + optional action" strips become one `NoticeStrip`; the duplicated
  split-button composite becomes one `ToolbarSplitButton` that guarantees the two facts each copy had
  been asked to remember — the pair is a single keyboard stop, and focus returns to the half that is
  in the tab order. Both `ArrowDown` and `ArrowUp` now open the type menus, matching the toolbar's
  other menu control. A new end-to-end case releases the plan's edit lock with a link pick open and
  proves the link is refused rather than silently recorded.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the shift editor's seven deferred findings (TECH_DEBT [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/82)).

  An import's calendar windows are now sorted, de-duplicated of empty spans and merged where they
  overlap — each one a reported repair rather than an opaque 500 from a recalculation days later —
  and a standard working day below the domain's floor is raised instead of rounding to zero stored
  minutes. The calendar library table stops showing a two-shift calendar and a plain Mon–Fri one as
  the same row. Window problems clear as you correct them once they are on screen, an overlapping
  pair flags both of its rows, and adding or removing a dated exception on an organisation calendar
  takes the same `calendar:manage_org` capability that editing one already did.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fold the ten blocking findings from the shift-editor epic's five specialist gates (ADR-0067 M4).

  The largest was a **dead end**: a calendar with no working week — the shutdown/turnaround shape the
  epic exists to make authorable — could be created by the Window-only preset and then never saved
  again, because the form kept a hidden `workingWeekdays >= 1` rule that the shift editor does not
  render. Save was refused by a control that was not on screen.

  Also folded: the night-shift affordance the ADR describes now exists (it wrote instructions for
  doing the arithmetic by hand, and left the helper that does it with no callers); focus is claimed on
  opening a per-row exception edit and handed back on closing it; three Save/Add buttons move off the
  native `disabled` attribute onto the `aria-disabled` + inert-class pair, including one that
  announced as unavailable while staying fully clickable; the hours-per-day advisory and warning are
  `aria-describedby`-linked to the field and the warning stops interrupting on every keystroke;
  adding and removing a period announces the settled result; a read-only week says why it is
  read-only; the two menu triggers use the shared `Button` instead of re-declaring its recipe by hand;
  the create dialog widens to fit the week editor it now carries; and one duplicate element id.

  On the API side this is documentation accuracy, not behaviour: `docs/API.md` gains the
  standard-working-day section and the `CALENDAR_HAS_NO_WORKING_TIME` 422, which is now declared on
  the three routes that can return it, and every `…Days` field's OpenAPI description says which
  calendar's day it is measured in.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Read activity durations in days, hours and minutes (ADR-0070, behind `VITE_SUB_DAY_DURATIONS`)

  The engine has scheduled sub-day work for a year and the API has accepted `durationMinutes` since
  `api-v0.34.0`, but the activity editor offered a whole-number **days** box — so a four-hour lift or a
  90-minute commissioning step could be imported, scheduled and exported, and never typed.

  Behind the new flag the duration field reads text with a `d`/`h`/`m` grammar (`2d 4h`, `90m`,
  `1.5d`); a bare number still means days, so every value already in use keeps its meaning. The
  day↔minute factor comes from the calendar the form currently selects (ADR-0068), and where it is not
  known the field stays in whole working days rather than guessing.

  Also fixed, unflagged: a canvas move resent the activity's **rounded** duration, silently flattening
  a sub-day activity to zero days; it now round-trips the exact stored minutes. `durationMinutes` and
  `lagMinutes` join the shared `@repo/types` shapes and the guest share DTOs, so a shared programme no
  longer shows a four-hour activity as `0 d` with no way to tell it from a milestone.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn sub-day durations and lags on by default (ADR-0070, `VITE_SUB_DAY_DURATIONS`).

  Durations and relationship lags are typed in days, hours or minutes — `2d 4h`, `90m`, `-4h` for a
  lead — and read back exactly in the activities table and the Logic panel. A bare number still means
  days, so nothing already learnt changes meaning. Set `VITE_SUB_DAY_DURATIONS=false` to roll back;
  the flag-off path is pinned by its own suites.

  The flip also fixes two defects the flag-on journey found: the plan's calendar never reached the
  create-activity dialog, so the duration field there silently refused hours; and a duration typed
  while the calendar list was still loading could be overwritten when it arrived.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Type a relationship lag in days, hours or minutes (ADR-0070 §5, behind `VITE_SUB_DAY_DURATIONS`).

  The lag field on both the add-a-link form and the edit dialog now reads the same `d`/`h`/`m` grammar
  as the activity duration, signed: `2d 4h`, `-4h` for a lead, `90m`. A bare number still means days, so
  every value already learnt keeps its meaning. The day↔minute factor comes from the link's own **lag
  calendar** — `24-hour (elapsed)` is pinned at 24 hours to the day regardless of any calendar's working
  week, which is the entire reason a planner picks it. Where the factor cannot be resolved the field
  degrades to whole working days, which is also what a rollback restores.

  Also fixes a lag being rounded away by Undo: undoing the removal of a link re-created it from its
  day-granular lag, so a two-hour cure lag came back as no lag at all.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Read a sub-day duration or lag back exactly (ADR-0070 M4, behind `VITE_SUB_DAY_DURATIONS`).

  The activities table's Duration column and the logic panel's Lag column now show the exact stored
  value when it is not a whole number of days — `4h`, `2d 4h`, `+90m` — instead of rounding it to
  `0 d`, which is also what the table prints for a milestone. A whole-day value keeps the shape it has
  always had, so nothing changes on a plan with no sub-day work in it. Each lag row resolves its own
  lag calendar, because `lagCalendar` is per-link and one page of logic can need several factors.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Working-week presets and copy-day in the calendar shift editor (ADR-0067 M2, behind
  `VITE_CALENDAR_SHIFT_EDITOR`).

  Five presets — Standard week, Two shift, Continental days, 24/7 and Window-only — each labelled
  with its hours, because a preset whose hours are invisible is a guess. A preset is a verb: it
  writes windows and then has no further existence, so nothing persists which one produced them.

  Each day gains a "Copy … to…" menu with three targets (the other weekdays, every other day, the
  weekend). Copy replaces the target days rather than merging into them, and announces which days it
  overwrote — the half a planner cannot see afterwards.

  A NEW calendar now starts from the Standard week (Mon–Fri 08:00–17:00) with a matching 9-hour
  standard working day, instead of a full-day Mon–Fri whose activities scheduled nearly three times
  too fast. A round-the-clock calendar is one click away — the 24/7 preset.

### Patch Changes

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Point the journeys at the duration label the shipped default actually renders

  ADR-0070's flag flip renames the activity form's control from `Duration (working days)` to
  `Duration` once the field can resolve how many hours the activity's day is worth — deliberate, since
  it no longer promises whole days. Three Playwright journeys were still asking for the old label: the
  base `e2e/activities.spec.ts` and the `e2e-activity-editor` / `e2e-programme` fixtures.

  The pre-push gate did not catch it, and the rule is why. `docs/TESTING.md` says to run a flag-on
  suite when you add or change one — which was done, and passed, because that suite pins the flag on.
  What a default flip moves is every suite that does **not** pin it, starting with the base suite,
  which serves the app on the shipped defaults. No file in `e2e/` was touched, so nothing pointed at
  it.

  The base journey now asserts `Duration`, the shipped default, so it fails loudly if that moves
  again. The two fixture helpers accept either spelling with an anchored regex — they are setup, not
  the assertion, and pinning one there only buys the same failure at the next flip. `docs/TESTING.md`
  gains the rule as a numbered step and a worked example.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Build `@repo/layout` in the images and in CI, and gate the build contract

  ADR-0069 added a third shared workspace package and its own Consequences section named the
  obligation that comes with one (ADR-0019: a shared package ships compiled output, so every consumer
  must build it first). The three lines that discharge it — the `COPY` and the `pnpm --filter … build`
  in each app's Dockerfile, plus the CI e2e job's direct "Build shared packages" step — were never
  added, so both images and the Playwright web server failed with
  `Cannot find module '@repo/layout'`: an error naming a module that plainly exists.

  Nothing local could see it. A developer's checkout already has `packages/layout/dist` from an
  earlier build, so the whole pre-push gate passes — lint, typecheck, 3,323 unit tests, the API e2e
  against a real Postgres, and both flag-on journeys — and the failure appears only on a clean
  machine, minutes into CI, inside `nest build`.

  `pnpm check:build-contract` now asserts it: every `@repo/*` an app lists in `dependencies` is
  COPYd and built in that app's Dockerfile and built in the CI step. It runs in the quality job
  beside the doc-link and playbook checks, needs no database, and was verified to fail against the
  exact defect before being wired in.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Stop losing a calendar's working hours when someone renames it

  A calendar that works specific hours — a split shift, a part day — lost them the moment anyone
  opened it in the calendar form and saved, even a rename. The form seeded `workingWeekdays` from the
  calendar it loaded and always submitted it, and the API replaces every stored shift row whenever
  that field is present. Silent: no error, and the response looked right, because the weekday mask
  really is Mon–Fri either way. Only the request body showed it.

  The form now sends `workingWeekdays` **only when the planner actually changed the week**. Renaming a
  calendar means renaming a calendar. The regression test asserts the request body of a rename-only
  save and was verified to fail against the old code first — the assertion it replaces had pinned the
  defect, asserting the mask was present.

  Where the mask genuinely cannot describe the calendar, the form now says so instead of implying the
  seven checkboxes are the whole truth: "This calendar works specific hours … the days below show
  which days work, not their hours." Editing them still replaces those hours with whole days, which is
  honest — it is the only week control that exists until the shift editor ships — but it is no longer
  a surprise.

  Exposure was narrow: only a calendar authored through the API directly could carry such hours, since
  the importer does not create one. It widens the moment the editor lands, which is why this goes
  first and unflagged.

- [#207](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/207) [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Imported programmes now open laid out, instead of one activity per lane (ADR-0069).

  An import gave each activity a lane matching its position in the source file, so a 500-activity XER
  opened as 500 lanes holding one bar each — nothing wrong with the data, but the first diagram a
  planner sees of a schedule they have just brought over from P6 was unreadable. The commit now packs
  lanes after recalculating, using the same packer the canvas's Auto-arrange has always used, which is
  extracted to a shared package so the two cannot drift apart. A layout failure leaves the imported
  plan in place rather than discarding it.

- Updated dependencies [[`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581), [`90151d3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/90151d3516d60706ef2881b395b423898d24e581)]:
  - @repo/types@0.19.0
  - @repo/interchange@0.7.0

## 0.63.1

### Patch Changes

- Updated dependencies [[`8e106b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8e106b1f65d0fae50bb98a1a9dffdf4771f8b92d)]:
  - @repo/types@0.18.0

## 0.63.0

### Minor Changes

- [#202](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/202) [`d118978`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d118978979e50385c28234198cc06c2606d952ff) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Import: ask about a resource-name collision instead of blocking on it

  Importing a file that names a resource the organisation already has — under that name but not
  under a code that identifies it as the same row — used to fail with a bare
  `409 A resource with these details already exists.`, with no way forward short of renaming or
  deleting the library row by hand.

  The dry-run now reports each collision (`report.resourceCollisions`), naming the incoming
  resource and the library row it clashes with, and the commit takes an answer per resource in a
  new `resourceResolutions` field: `REUSE_EXISTING` binds the imported assignments to the row
  already there, `CREATE_COPY` creates a separate resource under a disambiguated name so the
  file's own rate and calendar survive. Both answers are recorded as `repair` findings on the
  post-commit report — "reuse" silently drops the file's rate and calendar for that resource, and
  that is worth saying out loud.

  A collision left unanswered fails the commit with a named list
  (`422 UNRESOLVED_RESOURCE_COLLISIONS`) rather than being guessed: a resource library is
  org-global, and levelling, over-allocation and Earned Value all read from one pool, so reusing
  the wrong row and duplicating one crew are both wrong in ways a report line cannot undo. A code
  match is still an identity match and asks nothing.

  The import dialog gains a third step listing each clash with the library row it clashes with,
  and a choice per resource. Confirm stays shaded with the reason attached to it (`aria-disabled`,
  not the native attribute — a natively-disabled button leaves the tab order and takes the reason
  with it) until every one is answered. Answers are discarded whenever the report is re-fetched:
  an answer belongs to the report that raised it.

  `SegmentedControl` now accepts `value={null}` for a question with no answer yet, and gives the
  first option the group's tab stop — otherwise every option is `tabIndex={-1}` and an unanswered
  group is unreachable by keyboard (WCAG 2.1.1).

### Patch Changes

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Reconciliation pass for the seed-catalogue epic: CLAUDE.md's ADR list gains ADR-0066 (it was absent entirely), the pre-push gate and CI documentation gain `pnpm check:playbook`, and `docs/TEST_PLAYBOOK.md` is linked from the testing standards.

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the seed catalogue's negative tier (`seed --tier negative`): the 18 hostile cases of the conformance fixture, attempted one write each against the real API, reporting observed behaviour against declared expectation. Run against a live instance, all 18 behave as the fixture requires — including the three the pure engine marks `todo` because they are API-boundary concerns it cannot own.

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add a second scene to the hand-run draw benchmark (`scripts/measure-link-routing.mjs [frames] [scale|grid]`), built from the ADR-0066 scale generator instead of the synthetic lattice. The realistic plan costs 6.7 ms p95 at the working zoom against the lattice's 14.2 ms, and 18.7 vs 11.6 ms with nothing culled — the scene dominates the number, which is recorded against TECH_DEBT [#75](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/75). No product behaviour changes.

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the scale generator's topology: its bands ran in series, so a generated plan was one dependency chain through almost every activity — the engine returned 96% of tasks critical at zero float and a ten-year duration for 500 activities. Bands now hand over to the same band of the next phase, running as four concurrent streams. Adds `longestChainFraction` to the declared shape, with a regression test verified to fail against the old topology.

- [#204](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/204) [`745e7a3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/745e7a3264eb65cf94dce6547573cacca9e1187a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add `docs/TEST_PLAYBOOK.md` — per capability, which seeded plan proves it, what to look at, what correct looks like, and what wrong looks like — gated by a new `pnpm check:playbook` that compares every row against the plans the builders actually produce, in both directions.

- Updated dependencies [[`d118978`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d118978979e50385c28234198cc06c2606d952ff), [`d118978`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d118978979e50385c28234198cc06c2606d952ff)]:
  - @repo/interchange@0.6.0

## 0.62.1

### Patch Changes

- [#200](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/200) [`1943e0e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1943e0efb7ebb7bf7c428625126a5be577fd28f0) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Keep an over-cap WBS summary on the canvas, and give auto-arrange the plan's logic

  The WBS band stacks three nesting levels and skips anything deeper, but the scene filter lifted
  **every** summary out regardless — so a summary nested four deep was skipped by the band, removed
  from the diagram, and rendered nowhere at all. The cap is now one exported predicate that both
  halves call.

  Auto-arrange now takes the plan's dependencies as a hint and, **among the lanes that are already
  free**, puts an activity nearest its predecessors. It never opens a lane it would not otherwise
  have opened, so the lane count is unchanged; what changes is how far a logic line has to travel.
  Measured on a 126-activity / 188-link imported programme: mean vertical hop per link 2.34 → 1.83
  lanes and links spanning more than five lanes 15 → 8, both at 13 lanes either way.

## 0.62.0

### Minor Changes

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The canvas now says what it is doing while you author (ADR-0064 M1, `VITE_CANVAS_AUTHORING_FLOW`
  default-on): a band above the diagram naming the armed tool, the click it expects and — mid-link —
  which endpoint you already picked; a confirmation naming the direction that was created, with an
  Undo; keyboard parity so the Link tool works without a pointer; an empty plan that names the first
  gesture; and recalculation held while a two-click pick is open, so the bars cannot move between your
  two clicks.

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Behind `VITE_CANVAS_AUTHORING_FLOW` (**default on**): the canvas says which tool is armed and what
  the next click will do — including which endpoint a half-finished link has already picked — and
  confirms a created link with its **direction** plus an Undo. The band sits in the chrome above the
  diagram, so it never covers a bar you are trying to click, and takes no height at all when nothing
  is armed.

  _Corrected after release: this entry originally read "(default off)". The changeset was written
  while the flag was still off and was not revisited when it was flipped later in the same epic —
  the flag shipped **on** in 0.62.0, as the first entry above states. The wording is fixed here
  rather than left standing, because a changelog that contradicts itself about whether a feature is
  switched on is worse than one that admits an edit._

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Route dependency links around the bars between their lanes instead of straight through them, and
  make the direction arrowhead legible at Month zoom. The vertical corridor now steps aside when a bar
  stands in it — a bounded, deterministic search with a two-corridor fallback through the inter-lane
  gutter — so a line no longer appears to touch work it has nothing to do with. Behind
  `VITE_CANVAS_LINK_ROUTING` (default on); flag-off draws the previous line point for point.

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The canvas's name-a-new-activity popover gets a visible **Name** label, a submit called "Add to
  plan" (it was "Add", the same name as the toolbar's Add split-button on the same screen), and a
  shaded-with-a-reason submit instead of a natively disabled one — so it says why it cannot be used
  and keeps your focus when it flips.

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Give every canvas authoring tool the same way out. The Add split-button's primary region now arms
  and disarms the tool (it previously only opened its kind menu, while the neighbouring Link button
  armed — two adjacent controls doing different things on the same click, on a surface where the
  armed tool decides what the next canvas click means). Arming and closing the Add and Link tools is
  now announced, so the change is not conveyed only by a label on a control you may not be looking at.

### Patch Changes

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix five defects found by the canvas authoring & routing enablement reviews: the link confirmation
  no longer replays a stale "Linked A → B" (with an Undo bound to a different edit) the next time the
  Link tool is armed; the Add and Link split buttons return focus to their operable half rather than
  the caret, which is outside the tab order; pointer-driven link picks and pick-drops are announced,
  including the recalculation-cap drop nobody asked for; and Cancel in the create popover no longer
  looks and behaves enabled while announcing "unavailable" during a save it cannot abort.

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Draw a hub's many outgoing links as one trunk with branches instead of a comb of near-identical
  verticals. Corridors within six pixels snap to a shared line, unless doing so would put a link back
  through a bar it was routed around. Part of `VITE_CANVAS_LINK_ROUTING`.

- [#198](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/198) [`1737ec4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1737ec48af3b0236c6f5ed53e6f3820fc105b05f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the TSLD ruler's overprinted month label. When the viewport starts a day or two before a month
  boundary, the pinned "which month am I looking at" label and the boundary's own label were drawn a
  few pixels apart and ran together (`JuAug`). The pinned label now sits at the left edge where it
  belongs, and stands down when the real boundary would overprint it.

## 0.61.0

### Minor Changes

- [#195](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/195) [`22bc960`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/22bc960b641afd5426dc1d383d4ae7a64d069c73) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - WBS improvements: table multi-select, the band in the exported picture, and default-on.

  The epic's last three milestones. **M4b** adds bulk assign to the activities table — a selection
  column and a bar that files the ticked activities under one summary (or back to the top level),
  sharing the same minimal, version-carrying batch the Members panel sends. **M5** puts the pinned WBS
  band into the exported PNG/PDF and the derived Unassigned bucket into the printed programme, so the
  picture matches the screen; the band's derivation is now a single shared function rather than one
  copy per surface. **M6** ran the deferred specialist gates over the whole epic diff and flips
  `VITE_WBS_IMPROVEMENTS` **default-on**.

  The gates found four defects that had passed a human read, each folded with a regression test:

  - selecting a summary while the band was on lost the entire canvas selection-actions bar — the band
    lifts summaries out of the scene, and the anchor lookup only consulted the scene, so Dissolve and
    Edit left the screen _and_ the tab order for exactly the objects the band exists to show;
  - the Assign button used the native `disabled` attribute, which blurs to `<body>` the instant it
    flips, on a control that flips twice per save;
  - `POST …/activities/:id/dissolve` mutated its children's optimistic-lock `version` and returned
    `204`, leaving every cached child silently stale — it now returns the promoted rows at their new
    versions (**a breaking change to that endpoint's response**);
  - and it read those children's new parent from a snapshot taken _before_ the lock it takes to make
    that read safe.

  `PATCH …/activities/parents` also makes `parentId` required-but-nullable, so a forgotten field is a
  validation error rather than a silent promotion to the top level, and a row naming itself as its
  parent is now `422 SELF_PARENT` rather than sharing `PARENT_CYCLE` with the `409` case.

  Rollback: `VITE_WBS_IMPROVEMENTS=false`. Every flag-off parity suite is kept and pinned.

## 0.60.0

### Minor Changes

- [#193](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/193) [`8f94a06`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8f94a06a11b5ae35775196e8e0dfdcdb95cab09d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show the WBS: a pinned band on the TSLD canvas, and an honest home for unfiled work.

  Two surfaces behind `VITE_WBS_IMPROVEMENTS`, both answering the same complaint — a plan can have a
  WBS and still show none of it.

  The **Gantt** gathers everything not yet filed under one derived **Unassigned** row. A
  half-structured plan used to read as though it were fully structured: the activities nobody had
  grouped yet sat at the root beside the summaries, indistinguishable from top-level phases. The
  bucket is derived in the view layer and never persisted — a default summary per plan would change
  `computeSchedule`'s input for every plan in the system, for a display feature — and it appears only
  when there is both something unfiled and a real summary to contrast it with, because heading a flat
  list "Unassigned" invents a hierarchy that is not there.

  The **TSLD** gains a pinned band across the top, under `View▾ ▸ Structure ▸ WBS band` (default
  off), showing the programme at phase level with each bar column-aligned to the diagram beneath it.
  It is select-only: a summary's dates are an engine rollup, so there is nothing on it to drag.
  Summaries move out of the scene while the band is on — they stay fully reachable by keyboard and
  screen reader, which is the property the whole design turns on.

  Both read the same definition of what is filed where, so the two views cannot come to disagree
  about the word "unassigned". The printed programme gets the same grouping as the screen it was
  printed from. The CPM engine is untouched.

- [#193](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/193) [`8f94a06`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8f94a06a11b5ae35775196e8e0dfdcdb95cab09d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the **Members** tab — manage a WBS summary's contents from the summary (`VITE_WBS_IMPROVEMENTS`,
  default off).

  The shipped WBS could only be built one activity at a time, from each child's own editor: filing
  twenty activities meant opening twenty editors, and nothing anywhere answered "what is actually in
  this summary?". Opening a `WBS_SUMMARY` now offers a checklist over the plan, with one Save that
  sends one all-or-nothing batch.

  The checked set is **state, not a projection of the visible rows**. The list filters, so a member
  scrolled out of view or excluded by the search term is still a member; deriving the set from what is
  on screen would silently unfile everyone the filter hides, in a request that would be perfectly
  valid and atomic. Only genuine changes are sent, because every unnecessary row is another chance for
  someone else's stale version to reject the whole save.

  Membership reuses the existing **definition** gate object rather than re-expressing the same rule —
  an identity test asserts `gating.members === gating.general`, so "this changes no permission" is
  checkable rather than claimed. The panel shades its controls with a reason instead of hiding them: a
  reader without the pen can still see what is in a grouping.

### Patch Changes

- [#193](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/193) [`8f94a06`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8f94a06a11b5ae35775196e8e0dfdcdb95cab09d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Say what deleting a WBS summary actually does.

  Every activity got the same confirmation — `Delete “X”? You can restore it later.` — including a
  `WBS_SUMMARY`, whose deletion cascades to its entire subtree (ADR-0038). A planner removing a
  grouping was told the reassuring half of the truth: the restore is real, but everything filed under
  it goes too, and until then an unknown amount of work has vanished from the plan.

  A summary's confirmation now states the descendant count, says plainly that deleting a summary
  deletes everything it contains, and points at dissolve as the way to drop the grouping and keep the
  work. The count is derived from the already-loaded plan activities, so it degrades honestly: an
  empty summary says so, and a list that has not arrived warns about the cascade without inventing a
  number rather than claiming the summary is empty.

  One helper, asserted at both call sites — the plan workspace and the activities table raise the same
  dialog from different code, and a warning on only one of them is the same defect again.

- [#193](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/193) [`8f94a06`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8f94a06a11b5ae35775196e8e0dfdcdb95cab09d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix: assigning (or clearing) an activity's WBS summary now triggers the same auto-recalculate every
  other structural edit already gets.

  The auto-recalc coalescer decides whether to fire from a scheduling-input fingerprint built from
  each activity's duration, type and constraint — `parentId` was missing from it, so reparenting an
  activity under a WBS summary (or moving it back to top-level) never participated. The summary's
  rollup dates would then sit stale until an unrelated edit, or a manual Recalculate, happened to run
  one. `parentId` now joins the fingerprint.

## 0.59.0

### Minor Changes

- [#191](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/191) [`75d1069`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/75d1069c2e8c4e7621ba46fda57d559d889cc070) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - One activity is now one surface: Logic, Resources and Notes are tabs of the activity editor
  (ADR-0062).

  The row menu used to open the editor for three of its five items and a separate modal for the other
  two, so moving between an activity's duration and its predecessors meant closing one dialog and
  opening another. Worse, the Logic dialog's "Add predecessor" / "Add successor" buttons opened a
  **third** dialog on top of it — to do the thing that surface exists for.

  - **Logic** and **Resources** are tabs, rendering the same panels the dialogs render, so the two can
    never drift. **Notes** get a tab of their own, and the toolbar's **Add note** now lands on it
    directly instead of opening the Logic dialog and scrolling three panels down.
  - **Adding a link is inline**, below the two tables, with the new row appearing above the form as
    its confirmation. Direction is now a field that says what each choice means, rather than a fact
    carried by which of two buttons you pressed.
  - **Nothing about permissions changes.** Adding a link or an assignment still needs the role and the
    edit lock, exactly as it did from the dialogs; notes still need neither. Where you cannot write,
    the section is shown with the reason rather than hidden.
  - Adding a link is now undoable, matching removing one.
  - The tabs are ordered by subject — what the activity is, what it depends on, what does the work,
    how it is going, what it costs, what people said.

  Set `VITE_ACTIVITY_EDITOR_CONVERGENCE=false` to send every entry point back to the dialogs.

- [#191](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/191) [`75d1069`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/75d1069c2e8c4e7621ba46fda57d559d889cc070) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add a dependency inline in the Logic panel, instead of opening a second dialog

  The **Add predecessor** / **Add successor** buttons are replaced by one **Add a link** section
  below the two tables, carrying the direction as a field alongside the activity, type, lag calendar
  and lag. Adding a link is the Logic panel's main action and it opened a modal on top of a modal to
  do it; the new row appearing in the table above is also better feedback than a dialog closing over
  one. The refusals a planner can meet — a cycle, a duplicate — still come back from the server and
  show inline, and the "this plan has no other activities yet" way-out is unchanged.

  A Save that cannot be used is now shaded with the reason it cannot, linked to the button for screen
  readers, rather than simply disabled.

## 0.58.0

### Minor Changes

- [#189](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/189) [`8c8d049`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8c8d0490e83b160aaed633ae216cd7a1fdefff6a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Give every dialog a layout instead of a list of fields (ADR-0061).

  Dialog bodies were all the same shape — one `flex flex-col gap-4` around one field or around nine —
  so the structure said nothing about which fields belonged together or which mattered. Both the
  four-tab activity editor and the eight-field resource form were 448px wide, because `Dialog`
  defaults to `max-w-md` and neither passed a size.

  - New shared primitives (`FormSection`, `FieldGrid`, `ContextStrip`) carry the grouping, so it is a
    rule rather than something each dialog reinvents. Field groups are now named and announced as
    groups; controls that form one decision — a constraint and its date, a lag and the calendar
    counting it — sit side by side.
  - The activity editor moves to a two-pane layout at a new `xl` size: a rail showing every scope
    **and its state**, so a Contributor sees which sections are read-only on arrival rather than
    discovering each by clicking into it. Its computed dates, float and criticality now stay on
    screen while you edit them.
  - Applied across the activity form, resources, calendars, dependencies, cross-plan links, share
    links and schedule import. Confirm and reference dialogs are deliberately unchanged.
  - `(optional)` leaves the remaining labels; section descriptions say it in a sentence where it
    matters.

## 0.57.0

### Minor Changes

- [#187](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/187) [`dad7142`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dad71421b0d6dcf9f4ffd146d2688488a66dd49e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn the tabbed activity editor on by default (ADR-0060 M6, `VITE_ACTIVITY_EDITOR_TABS`). The
  activity's General, Scheduling, Progress and Cost fields now live on four tabs that save per write
  scope, and the progress model — the reported %, the value measure, and the weighted steps that
  override it — is co-located on one tab instead of spread across four dialogs.

  Four specialist reviews over the combined diff found six defects in code that had already passed a
  human read, all folded before the flip: a dropped calendar Combobox with its loading and error
  states, Save buttons that lost focus on every save, a reason sentence placed beside its control
  rather than associated with it, an invented edit-lock message that was false whenever nobody held
  the lock, no confirmation before discarding unsaved work, and a save bar duplicated across two files
  that had already begun to diverge. A flag-on Playwright journey with its own CI step proves the
  permission model end to end against a real API.

  `VITE_ACTIVITY_EDITOR_TABS=false` restores the previous three dialogs exactly, pinned by parity
  suites.

- [#187](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/187) [`dad7142`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dad71421b0d6dcf9f4ffd146d2688488a66dd49e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Converge the activity editor's entry points (ADR-0060 M5). Edit, Report progress and Steps — from the
  activities row menu, the canvas selection bar and the plan toolbar — now build one `ActivityEditorIntent`
  and open one editor on the tab that answers the action, instead of three dialogs driven by three pieces
  of state. The per-scope gate is derived once by the plan workspace and passed to every host, so the
  role-versus-pen reason a shaded control shows cannot differ between the table and the canvas.

- [#187](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/187) [`dad7142`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dad71421b0d6dcf9f4ffd146d2688488a66dd49e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Move the weighted-steps editor into the tabbed activity editor's Progress tab (ADR-0060 M4), beside
  the physical % complete it overrides — the two were previously in separate dialogs, reachable one at
  a time, with no cue that one silently won. The panel is pen-gated to match the server assertion added
  in M0, and its focus choreography now also covers reordering: moving a step to either end of the list
  used to disable the button just pressed and drop focus to the document body.

### Patch Changes

- [#187](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/187) [`dad7142`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dad71421b0d6dcf9f4ffd146d2688488a66dd49e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Co-locate the activity progress model on one tab (behind VITE_ACTIVITY_EDITOR_TABS, default off)

  Reported progress, the value measure and the manual physical % now sit on
  one Progress tab, each panel headed by what it does to the schedule
  ("Moves the activity's dates" vs "Earns value in Earned Value. Changes no
  dates"). The manual physical field is disabled with its reason when
  weighted steps override it, instead of staying editable and silently
  ignored. Three panels keep three Saves, because progress is not pen-gated
  and the measure is.

## 0.56.0

### Minor Changes

- [#185](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/185) [`8a9ae73`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8a9ae730b7b03d46d12be6bc0a5443c801e91863) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make resource-dependent activities reachable, and show when one has no driver.

  **Resource-dependent** joins the activity Type picker. The scheduling behaviour has been live since
  M7.2 — such an activity is scheduled on its driving resource's calendar rather than its own — but the
  type was missing from the picker, so the only way to create one was through the API or an import.

  The engine's "no driving resource assignment" flag is now visible too: a **Needs a driver** badge on
  the row and a **Missing a driver** count in the schedule summary, each explaining that the activity
  was scheduled on the ordinary calendar rather than skipped. Until now that flag was computed, stored
  and returned by the API without anything rendering it, so a plan could schedule work on the wrong
  working time and look completely normal.

  The per-activity calendar picker is disabled — with the reason shown — while the type is
  resource-dependent, since the driving resource's calendar wins and any value saved there is ignored.

### Patch Changes

- [#185](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/185) [`8a9ae73`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8a9ae730b7b03d46d12be6bc0a5443c801e91863) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity editor's per-scope schemas, body builders and gating (dark)

  The pure layer the tabbed editor stands on: four scope schemas partitioning
  `activityFormSchema` (with a structural test asserting the partition is exact in
  both directions), four PATCH body builders whose exact key sets are pinned, a
  `useUpdateActivityFields` partial-update hook beside the unchanged
  `useUpdateActivity`, and `deriveActivityEditorGating` with a full role × pen
  matrix test. Nothing consumes any of it yet, so nothing user-visible changes.

- [#185](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/185) [`8a9ae73`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8a9ae730b7b03d46d12be6bc0a5443c801e91863) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the tabbed activity editor's definition tabs (behind VITE_ACTIVITY_EDITOR_TABS, default off)

  General / Scheduling / Cost, each with its own form, its own Save and its
  own gate. Nothing reaches it yet — the entry points still open the existing
  dialog — so with the flag off, or on, today's behaviour is unchanged.

- [#185](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/185) [`8a9ae73`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8a9ae730b7b03d46d12be6bc0a5443c801e91863) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the `Tabs` design-system primitive (no consumer yet)

  A hand-rolled WAI-ARIA APG tablist in `components/ui/tabs.tsx`: roving
  `tabindex`, Arrow/Home/End with wraparound, automatic activation, and text
  markers that extend a tab's accessible name rather than tinting it. Built for
  `ActivityEditorDialog` (ADR-0060) and not yet wired to anything, so nothing
  user-visible changes.

## 0.55.0

### Minor Changes

- [#183](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/183) [`ad3e1f9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ad3e1f9bcc2e37499b5db52062a63eb679831c5f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the printed programme for the Gantt view (ADR-0059 M4, behind `VITE_GANTT_VIEW`).

  `Print` now follows the active view. With the Gantt showing it mounts a purpose-built print
  document rather than styling the live view for paper — because the live panel virtualizes, and
  printing it would emit a programme cropped to whichever rows happened to be scrolled into view.
  The printed document renders every row, fits the whole span to the page, repeats the column
  headings and the time ruler on each page via a native `<thead>`, forces the light palette, and
  carries a legend so a greyscale photocopy is still readable.

  The detached-container print convention the TSLD's image path already used is extracted to a
  shared module and both surfaces now use it. Column text and ruler tick placement are likewise
  shared, so the screen and the page cannot disagree about a date.

  Flag-off is unchanged: `Print` still rasterises the diagram.

- [#183](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/183) [`ad3e1f9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ad3e1f9bcc2e37499b5db52062a63eb679831c5f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn the Gantt view on by default (ADR-0059 M6, `VITE_GANTT_VIEW`).

  The plan workspace now carries a **Diagram | Gantt** switch. The Gantt is a grid-and-bar
  projection of the same schedule — WBS summary rows, criticality, float tails, progress, the
  baseline variance bar, and a printed programme — for the audience that does not read logic
  diagrams. The view choice lives in the URL, so it is deep-linkable and survives a reload.

  Read-only by design: editing stays in the diagram. Rendered as virtualized DOM rows rather than
  canvas, so the grid is keyboard-navigable and screen-reader-readable natively, and the live row
  count stays bounded by the viewport whatever the plan holds.

  The enablement pass fixed a control that was lit but did nothing: the zoom presets delegated only
  to the canvas, which is not mounted while the Gantt is showing. They now drive both views. Zoom
  in/out, Fit and Go-to-date are canvas-only and say so rather than sitting enabled and inert.

  Set `VITE_GANTT_VIEW=false` to roll back to the diagram-only workspace.

### Patch Changes

- [#183](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/183) [`ad3e1f9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ad3e1f9bcc2e37499b5db52062a63eb679831c5f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the authenticated app shell's height, which was a minimum rather than a height.

  The shell's outermost box was `min-h-dvh`, leaving its computed height `auto` — so every
  `flex-1 min-h-0` region beneath it sized itself against its own content instead of the viewport,
  and the plan workspace was silently unbounded. The diagram never showed it (a canvas fills whatever
  container it is given and cannot report that the container was wrong); the Gantt did, rendering
  every row of a plan instead of a viewport's worth.

  The shell is now exactly the viewport and the workspace region scrolls, so the header and Project
  Explorer stay put while long screens scroll their content — rather than the whole page moving the
  chrome off-screen.

  Also gives the plan workspace's canvas region the minimum height it was already documented to keep.
  Without it, a short viewport squeezed the region to nothing while the content inside it could not
  shrink, so it overlapped the docked activities panel: the panel stayed visible and enabled, but
  clicks landed on the canvas instead.

## 0.54.0

### Minor Changes

- [#180](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/180) [`bd011eb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd011eb9e99a233081096dfca0b21990d77ddf91) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Two tech-debt fixes in the plan workspace.

  **The "Calendar…" dialog is now "Schedule settings".** It had accumulated seven settings groups
  one migration at a time — working-day calendar, critical path & float, progress/recalc mode,
  expected finish, resource levelling, external relationships, earned value — while still being
  titled and described as if it only held the first. Six of its seven sections were not about
  calendars, and none of them rendered a visible heading, so a planner looking for the total-float
  measure had no reason to open "Calendar…" and no signpost once inside. The dialog, its description,
  and both entry points (the TSLD toolbar item and the plan-actions overflow menu) now name the whole
  scope, and each section carries its own `<h3>` beneath the dialog's `<h2>` so heading navigation
  reaches it.

  **The weekday picker now uses the shared `ToggleChip`.** The calendar form's working-days control
  was a hand-rolled `<Button variant={pressed ? 'default' : 'outline'}>` — the one-off styling the
  design system exists to prevent — while `ToggleChip` shipped with no call sites at all. Weekdays are
  independent booleans, which is exactly what that primitive is for, so the picker adopts it.

- [#180](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/180) [`bd011eb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd011eb9e99a233081096dfca0b21990d77ddf91) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Toolbar buttons now show their text labels when the row has room for them.

  A toolbar item's `tier` used to decide two unrelated things: what gets demoted into the `⋯`
  overflow first, and whether the button shows a text label. Those only coincided by convention, and
  the consequence was measurable — at 1920px the plan toolbar's second row carried roughly 1000px of
  unused width while showing exactly as many icon-only controls as it does at 1280px, because nothing
  ever asked whether a label was affordable at the width actually available.

  `ToolbarItem` gains a `showLabel` policy (`'always' | 'auto' | 'never'`, default `'auto'`) that is
  separate from `tier`, and `'auto'` resolves from the measured container width on every resize. The
  primary actions (Early/Visual mode, Add, Recalculate, and every button in the floating
  selection-actions bar) pin `'always'`, since their names are the affordance; everything else gains
  a label on wide viewports and keeps today's icon-only chrome on narrow ones. Labels are never
  promoted at the cost of pushing a command into the overflow.

### Patch Changes

- [#180](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/180) [`bd011eb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd011eb9e99a233081096dfca0b21990d77ddf91) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface load failures on the cross-plan link picker, and stop a nested dialog closing its `Sheet`.

  The four cascade pickers in **Add cross-plan link** (client → project → plan →
  activity) were still hand-rolled `Label`+`Select` blocks. A failed clients query
  rendered an error paragraph with no `id`, so it was never linked to the select
  and never reached assistive technology; failures on the project, plan and
  activity queries were not surfaced at all, leaving the control stuck on its
  placeholder with no explanation. All four now use `SelectField`, with the load
  failure announced (`role="alert"`) and the validation message left to the form's
  error summary.

  `Sheet` also gains the close-scoping guard `Dialog` received: a dialog nested
  inside a sheet would otherwise close the sheet out from under it. No screen does
  that today, so this is latent rather than a live fix.

- [#180](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/180) [`bd011eb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd011eb9e99a233081096dfca0b21990d77ddf91) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Confirming inside a dialog no longer closes the dialog behind it.

  Revoking a share link, or deleting a baseline, opened a confirmation on top of the dialog that
  launched it — and answering that confirmation tore down both. The user landed back on the plan with
  no way to see the result of what they had just confirmed, and had to reopen the parent to check.

  `close` and `cancel` do not bubble, but React listens at the root in the capture phase, and capture
  reaches every ancestor on the way down. So the inner dialog's close was delivered to the outer
  dialog's handler as well. The `Dialog` primitive now ignores a close whose target is not itself,
  which fixes every nesting rather than the two that had been noticed.

- [#180](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/180) [`bd011eb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd011eb9e99a233081096dfca0b21990d77ddf91) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - A shared `SelectField` primitive replaces 16 hand-assembled label-and-select blocks.

  The idiom had been written out 33 times across 15 files, and the copies had drifted: some errors were
  announced to screen readers and some weren't, some hints were rendered but never linked to their
  control, one screen pointed two different paragraphs at the same id. `SelectField` now owns that
  wiring, and every select in the activity form, the dependency and cross-plan link dialogs, plan
  status and invite role uses it.

  No visible change. The point is that the next accessibility fix to any of them lands once.

## 0.53.0

### Minor Changes

- [#178](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/178) [`07ba0dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/07ba0dd99515b6fcb45b58f9b6f305b623791c3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Header centring (tsld-toolbar-canvas-refinements M6, unflagged). The org switcher and nav now sit
  at the true centre point between the brand and the account chip via a `1fr auto 1fr` grid, instead
  of a flex row that merely absorbed leftover space. Centred while it fits, filling when it does
  not: a long org name or a crowded nav scrolls internally (`min-w-0` + `overflow-x-auto`) rather
  than pushing the account chip off-screen. The org switcher gains a bounded `max-w-[12rem]`
  truncating width. DOM order and tab order are unchanged — no behavioural change, only the layout
  mechanism.

- [#178](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/178) [`07ba0dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/07ba0dd99515b6fcb45b58f9b6f305b623791c3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Flip `VITE_CANVAS_TIME_AXIS` default-on (tsld-toolbar-canvas-refinements M7, ADR-0056 Accepted):
  range-anchored zoom presets, tiered gridlines, the interpolated Today marker + pill, and
  ground-vs-non-working shading are now on by default. Folds two fixes found by the pre-flip
  specialist review pass: the day/month gridline colours widen their contrast (WCAG 1.4.1 — the
  original values measured ~1.1:1, imperceptible) across all three themes, and the raised zoom
  ceiling (`MAX_PX_PER_DAY` 60 → 200) now threads through every zoom-scale clamp as a required
  parameter so it can never leak into the flag-off zoom range. Set `VITE_CANVAS_TIME_AXIS=false` for
  a byte-for-byte rollback to the pre-epic time axis.

- [#178](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/178) [`07ba0dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/07ba0dd99515b6fcb45b58f9b6f305b623791c3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD time-axis gridline tiers on the web, behind `VITE_CANVAS_TIME_AXIS` (default off,
  tsld-toolbar-canvas-refinements M3). The single batched grid stroke splits into three tiers —
  day, month, year — each with its own colour token (`--canvas-grid-day`/`-month`/`-year`) and, for
  year, a heavier `lineWidth` (2 vs 1), drawn in day → month → year order so a coarser boundary wins
  at a coincident x. Two cues (weight and colour), so the hierarchy survives monochrome print and
  colour-blind reading. Set `VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback
  to today's single `gridLine` pass.

- [#178](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/178) [`07ba0dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/07ba0dd99515b6fcb45b58f9b6f305b623791c3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD ground-vs-non-working differentiation on the web, behind `VITE_CANVAS_TIME_AXIS` (default
  off, tsld-toolbar-canvas-refinements M5). The non-working (weekend/holiday) column wash gains a
  diagonal hatch stripe — the same rhythm as the shipped float-tail hatch — so a weekend reads as a
  distinct kind of surface, not just a darker shade of the month band; guarded to fall back to the
  existing flat fill when an offscreen 2D context can't be built (older browsers, minimal test
  contexts), keeping the `fillRect` cost identical either way. The month-band ground also gains its
  own `View▾ → Structure → Month bands` switch (gated on `VITE_CANVAS_VISUAL_LANGUAGE`, which still
  decides whether the layer exists at all) so a user can turn the ground off for the session. Set
  `VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback to today's flat wash.

- [#178](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/178) [`07ba0dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/07ba0dd99515b6fcb45b58f9b6f305b623791c3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD Today marker refinement on the web, behind `VITE_CANVAS_TIME_AXIS` (default off,
  tsld-toolbar-canvas-refinements M4). The dashed vertical interpolates to the viewer-local
  time-of-day (`todayDayFraction`) instead of snapping to the midnight boundary, and carries a
  "Today" pill (mirroring the cursor date chip's geometry, offset 4px below it so the two never
  collide during a drag). A new `useNow` hook re-derives the marker every 60s while the tab is
  visible — pausing while hidden and re-syncing immediately on `visibilitychange` — which also
  repairs a pre-existing defect where a plan left open across midnight kept showing yesterday's
  line. Set `VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback to today's
  plain integer-offset dashed line.

- [#178](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/178) [`07ba0dd`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/07ba0dd99515b6fcb45b58f9b6f305b623791c3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Range-anchored zoom presets on the web, behind `VITE_CANVAS_TIME_AXIS` (default off,
  tsld-toolbar-canvas-refinements M2). Each `View▾` zoom preset now targets a fixed **visible
  range** (Day → 2 weeks, Week → 1 month, Month → 3 months, Quarter → 1 year, Year → 3 years)
  independent of canvas width, and the zoom menu states each preset's range so the names stop
  being ambiguous about what they frame; the trigger keeps its short name. `MAX_PX_PER_DAY` rises
  60 → 200 so the Day preset can actually reach 2 weeks visible at ordinary desktop widths. Set
  `VITE_CANVAS_TIME_AXIS=false` (the default) for a byte-for-byte rollback to today's fixed
  `ZOOM_STOPS` scale.

## 0.52.1

### Patch Changes

- [#176](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/176) [`f3dbbf2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f3dbbf2e6853ed049f7776a44843bccdba91f78b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD toolbar UX polish: fix the missing critical-path settings, a mislabelled colour picker, a
  duplicated icon, and an invisible row split.

  **Bug fix — the plan's critical-path definition settings were unreachable.** `PlanScheduleSettings`
  (critical-path definition, total-float measure, open-ends criticality — ADR-0035 §17/§18/§20) was
  never migrated into the ADR-0031 toolbar workspace: it only rendered in the legacy
  `CANVAS_TOOLBAR_ENABLED`-off fallback page, which the default-on flag means no user actually sees.
  Its five sibling settings (recalc mode, expected-finish, levelling, external relationships, earned
  value) all made the move into the toolbar's Calendar dialog; this one was dropped. It now joins them
  there, following the same pattern.

  **Clarity fix — the "Colour by" picker read as a fixed setting.** The toolbar button showed only the
  active mode's bare name (e.g. "Criticality"), with "Colour by" appearing solely in the `aria-label`/
  `title` — invisible to a sighted user, who could mistake it for a critical-path option living on the
  toolbar. It now reads "Colour · Criticality", mirroring the existing "Isolating · {mode}" idiom used
  by the neighbouring Isolate control.

  **Icon fix — "Resource view" and "Resource histogram…" shared the same glyph** (`BarChart3`) despite
  being two distinct commands visible across the toolbar's two rows. The histogram command now uses a
  distinct icon.

  **Discoverability — the toolbar's Look/Do row split was invisible.** Row 1 (view/navigate) and Row 2
  (build/manage) were distinguished only by each row's `aria-label`, with no visible cue for sighted
  users. Both rows now carry a small visible label matching their existing internal names.

## 0.52.0

### Minor Changes

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the **designed chrome band** behind `VITE_DESIGNED_CHROME` (default off, ADR-0055 S2).

  With the flag on, the header row and — when a plan is open — its two toolbar rows render as one
  full-bleed band across the top of the app, with the Project Explorer and the workspace below it.
  The band is navy in Corporate and neutral in Light/Dark, and its height follows its content: one
  row on a list screen, three on a plan.

  The toolbar reaches the band through a **portal**, so only its DOM node moves. In the React tree
  it stays exactly where it was, which is what keeps `usePlanWorkspaceModel`, `useTsldToolbarContext`
  and every ADR-0031 registry predicate untouched — and keeps the shell ignorant of plans (ADR-0029).

  Two shipped keyboard contracts had to be made portal-safe **first**, because both would have
  broken silently: the `?` shortcuts sheet and the ADR-0048 undo/redo accelerators were native
  `keydown` listeners on the workspace root, and a native listener follows the DOM tree. They are now
  one React `onKeyDown` (`usePlanWorkspaceKeyScope`), which follows the React tree and therefore
  crosses the portal by construction. Every binding is regression-tested from a portalled control.

  The flag also stamps `data-designed-chrome` on `<html>`, which activates the flagged token layer —
  so the rollback is byte-for-byte for colour as well as structure. `VITE_DESIGNED_CHROME=false`
  renders today's shell exactly: header as its own measure-capped chrome surface, no band, no slot,
  and `ChromePortal` an identity wrapper. Pinned by a flag-off parity suite that is kept, not
  weakened, when the flag flips.

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - The designed chrome band and the canvas visual language are now on by default

  `VITE_DESIGNED_CHROME` and `VITE_CANVAS_VISUAL_LANGUAGE` flip default-on (ADR-0055 S5-T4). The
  shell becomes one full-bleed chrome band — header row and, on a plan, the toolbar rows as a single
  surface — with the Project Explorer and the workspace below it, and the TSLD diagram sits on a
  ground of its own with alternating month bands, so a planner can count months without reading a
  label.

  The flip surfaced one real defect that only exists once the toolbar actually moves: closing the
  plan-notes dock looked its Comments button up **inside the workspace root**, which the portal had
  just moved the toolbar out of, so focus was stranded instead of returning (WCAG 2.4.3). Fixed, and
  the test that caught it now runs against the shipped default rather than the old one.

  Both flags remain a byte-for-byte rollback — set either to `false`. The flag-off parity suites are
  kept and pinned rather than weakened, and the flag-off Playwright suite now sets the flags
  explicitly instead of relying on the default that just changed: it is the rollback side of the
  contract, and its flag-on sibling covers what ships.

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Give the TSLD diagram a **ground of its own with alternating month bands**, behind
  `VITE_CANVAS_VISUAL_LANGUAGE` (default off, ADR-0055 S4).

  A time-scaled diagram exists to make time legible, and counting months by reading labels is work
  the surface should be doing. Banded ground makes it free. Three decisions worth knowing:

  - **Banding is ground, not a gridline**, so it deliberately does not follow the `Month grid`
    toggle — that toggle governs a line, this governs a surface.
  - **Parity is the absolute month ordinal**, not a running count of crossed boundaries, so the
    stripes cannot invert when the viewport pans.
  - **The band is opaque**, not an alpha wash: an alpha band would tint whatever it overlaps and
    would have to be re-checked against every layer above it.

  The canvas now reads `--canvas` / `--canvas-band` rather than borrowing `--card`, and the lag
  handle's halo follows that ground — it is the theme-inverse of the handle's core, so it must track
  the surface it is meant to match rather than silently drifting from it. Both tokens are valued
  identically to `--card` in every theme block, so the re-point is a **no-op** until the flagged
  cream values apply.

  The month/year boundary walk is now computed **once per frame** and shared by the bands and the
  gridlines. Two walks could disagree by a day; one cannot.

  Cost is pinned by a new counting-stub gate (`paint.band-budget.test.ts`) at 2,000 activities, at
  day zoom **and** at year zoom over a multi-year span — the case a naive per-day loop would blow up
  on: at most `visibleMonths + 1` extra `fillRect`, and not one glyph of text. Flag-off the scene
  carries no `monthBands` at all, so the band layer is skipped entirely and the frame is
  byte-for-byte today's paint.

  Not in this slice, and deferred deliberately rather than rushed into the hot path: the tiered
  ruler redesign and the TODAY chip.

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Light and Dark get their own designed chrome (behind `VITE_DESIGNED_CHROME`)

  The last theme values of the designed-UI epic, and deliberately the last: flipping structure and
  values in one change makes every flag-off parity suite meaningless on the day it is most needed.

  Light's band steps a shade off the page rather than being the page with a line under it, and its
  rail sits between the two — so band, rail and content read as a hierarchy. Dark goes the other
  way, because a dark theme has no "lighter than white" to reach for: a near-black band with the
  content lifted off it. Dark's field is a **raised dark**, not white — a white field on a
  near-black band is a glare source at night, which is the condition the theme exists for.

  The global flag layer and the `.dark`/`.corporate` blocks have equal specificity and all match
  `<html>`, so the global layer wins over a theme block by source order. Every theme-scoped layer
  therefore restates the global list in full, including values it does not change — pinned by
  `token-architecture.test.ts`, because a forgotten token would silently paint Light's grey on a
  dark theme and look like a colour choice rather than a bug.

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Split `--input` from `--border` so a control's outline is visible (WCAG 1.4.11)

  `--input` shared `--border`'s value, and because `--field` is deliberately identical to the
  surface it sits on, a text field's outline — the only thing indicating a field is there — sat at
  **1.26:1** in every theme, on every surface. It is now its own per-surface token held at ≥ 3:1 by
  the contrast suite, which previously reported the border ratio without asserting it and so never
  looked at this one. Reach for `border-input` on anything whose edge identifies a control;
  `border-border` is for dividers.

  Two further computed defects fixed in the same pass: `bg-muted text-muted-foreground` inside the
  Corporate chrome resolved to a light grey on a light grey (**1.81:1**), because the surface
  families carried `-muted-foreground` with no `-muted` fill of their own — `-muted` now joins the
  family. Corporate's solid warning fill carried a white label at **3.61:1**, and the light
  secondary grey missed 4.5:1 against `--muted`; both values were corrected.

  The theme options in the account menu are now a named `role="group"`, so the visible "Theme"
  heading relates to them programmatically and not only by proximity (WCAG 1.3.1).

### Patch Changes

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Extract the redesign's repeated patterns into shared primitives before any surface consumes
  them, so "no one-off styling" survives the rest of the epic (ADR-0055, S1).

  - `SegmentedControl` — the APG `radiogroup` lifted out of the workspace view toggle (roving
    tabindex, Arrow/Home/End, focus follows selection). Its caller keeps its exact behaviour.
  - `ToggleChip` — an `aria-pressed` button for independent booleans, with the segmented-vs-chip
    rule written down: a radiogroup means "one of a set", a pressed button means "this is on",
    and using one for the other misdescribes the control even when it looks right.
  - `CheckboxField` gains `density="compact"` for inline rows. Density is spacing only — the
    ≥24px hit target and the label association are unchanged and pinned by test.
  - The Add control gains the split-button _look_ (a caret divider). Deliberately not a real
    split button: two focusable halves inside one toolbar item would re-open the roving-tabindex
    gate ADR-0031 closed. A test pins the single stop.
  - `BrandMark` and `AccountChip` replace the header's product name, theme-cycling button,
    always-visible email and `outline` Sign-out button. Two Corporate contrast defects are fixed
    by deletion: the low-contrast email and the invisible Sign-out button no longer exist on the
    band — they live in a portalled menu that paints on the page's own colours. The theme becomes
    a radio group rather than a cycle, which is the first time the picker shows what the other
    options are.

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Docs: accept ADR-0055 and close the designed-UI epic's paper trail

  ADR-0055 moves to Accepted with the flip recorded. The ADR index had drifted badly — 0030–0037,
  0046–0048 and 0054 were never added — so it is filled in and re-sorted, and CLAUDE.md §16 gains
  0054 and 0055.

  `FRONTEND_QUALITY.md` gains the flag-on e2e suite alongside the flag-off one and a third habit
  next to the two it already listed: a reported ratio is **recomputed, not quoted**, and the
  decorative-border exemption covers `--border` only — never `--input`, which is how a 1.26:1 field
  outline survived in every theme.

  `TECH_DEBT.md` [#59](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/59) records what the epic did not establish: every draw measurement this project
  has made was on a headless cloud runner, not ADR-0026 §16's device envelope, so the ≤ 4 ms budget
  is a design target rather than a verified property.

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the Corporate theme's colour-contrast defects structurally, by giving the token
  vocabulary a notion of **surface** (ADR-0055 §1–§2, S0).

  Corporate paints a navy chrome around a light page, so a single `--muted-foreground` cannot
  be right in both places. Each theme now declares a complete 15-token family per surface
  (`chrome`, `panel`), and a new `<Surface>` primitive rebinds the ordinary semantic names
  inside a region — so the header and rail keep every class they had and simply start
  resolving colours that were validated against the fill they sit on. Six defects are fixed
  without touching the components that carried them: nav links at rest, on hover and on the
  current page; the account area; the rail's secondary text; and the tree rows.

  Also fixed, both found by the new gates rather than by eye:

  - The `outline` button variant specified a fill and inherited its ink — invisible on navy.
  - Placeholder text used the surface's grey rather than the field's, so a placeholder in a
    white input on navy chrome was 2:1. Fields now have their own `--field-muted-foreground`.
  - Corporate's primary action on the page is the brand navy; amber (1.9:1 against the
    off-white page) stays where it is legible — the navy chrome, the focus ring there, the
    row wash and the charts.

  New gates so this class of defect fails the build rather than reaching a user: a computed
  contrast matrix over 3 themes × 3 surfaces, structural pins on the token architecture and
  the surface seam, an ESLint rule against raw colour literals in markup, and a Playwright
  suite that runs axe over **all four** theme options instead of only the default.

  Light and Dark are unchanged.

- [#166](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/166) [`d9f4291`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d9f42919ffb427734f610168d4a6bfc4ce4cd0d6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Corporate's Project Explorer becomes a **light working surface** behind `VITE_DESIGNED_CHROME`
  (ADR-0055 S3).

  One dark band across the top and two light surfaces below it reads as a designed application;
  three competing dark/light regions does not. The values live in a `[data-designed-chrome].corporate`
  layer, so flag-off the rail is navy again with no code path involved — the rollback stays
  byte-for-byte for colour. Light and Dark are untouched here.

  The rail's boundary against the page is 1.09:1, which is deliberately a preference rather than a
  WCAG rule (1.4.11 exempts a decorative surface edge) — so the contrast suite reports it instead of
  gating it, and the rail keeps a real border rather than relying on the fill difference.

  Two rail refinements ride along, both token-only and geometry-safe: the root create affordance
  becomes a labelled `+ Client` primary button instead of a bare `+` glyph (creating the first client
  is the one action an empty explorer exists to offer), and client rows carry the heading weight their
  level implies.

  Deliberately **not** in this slice: the reference's rail search field and All/Clients/Projects/Plans
  filter chips. The tree loads lazily, one query per expanded node, so neither is buildable
  client-side — both need an org-scoped hierarchy search endpoint and belong to their own spec.

## 0.51.0

### Minor Changes

- [#164](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/164) [`d6accca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d6accca011926687f3a17e44e7aab9fa084b936d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): a Corporate theme — navy chrome, amber actions

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

## 0.50.2

### Patch Changes

- [#162](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/162) [`0221d71`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/0221d71c9f2681b303dc2f97bed74c7dafb9f38c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): dragging a bar's end grows it by one working day per column

  Resizing an existing activity had the same units bug the previous release fixed for drawing a new
  one, one step further along. A 4-day activity that spans a weekend occupies six columns on the
  diagram; dragging its end one column right sent seven — read as seven **working** days — and the bar
  jumped to nine calendar days. One column of drag now means one working day of growth, on both the
  finish and the start edge, and a start dragged onto a weekend lands on the next working day.

  The duration shown in the chip while you drag is converted the same way, so it always states the
  number the activity will actually have rather than a count of columns.

## 0.50.1

### Patch Changes

- [#160](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/160) [`399ec1c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399ec1c9b7bc06cf5343ca853c3a9ed332066119) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): the canvas draws live again, and a bar lands the length you drew it

  Two defects made on-canvas authoring feel broken.

  - **Nothing appeared while drawing.** The overlay the canvas paints ghosts, the cursor guideline
    and the resize readout onto is a second canvas that only exists while editing — and it was being
    sized only when the _window_ changed size. Taking the pen doesn't change the window, so that
    canvas kept its default 300×150 while everything was drawn in full-screen coordinates: the live
    bar, the guideline and the date chip all landed off the surface. Resizing the window happened to
    fix it, which is why it looked intermittent rather than simply broken. Now the surface is sized
    whenever it appears, so a bar grows and shrinks under the pointer from the first drag.
  - **A bar drawn across a weekend came back too long.** The diagram's horizontal axis is calendar
    time — a weekend still takes up two columns — but an activity's duration is counted in _working_
    days. Dragging Friday to Tuesday is five columns and three working days, and the five was being
    saved as the duration, so the engine laid the bar out two days past where the pointer was
    released. The drawn span is now converted properly, and a drag that starts on a weekend or a
    holiday begins on the next working day rather than being pushed later by the schedule afterwards.

  No API, schema or scheduling change — the engine and the recalculation results are untouched.

## 0.50.0

### Minor Changes

- [#158](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/158) [`be0e5ab`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be0e5ab8de45d915e6a293c2f6c906dfb4a333c7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): the canvas tells you when and how much room — live date readout, bar dates, GPM float & drift (ADR-0054)

  A time-scaled logic diagram exists to answer two questions graphically: **when** does this happen,
  and **how much room** does it have. The canvas now answers both without leaving the diagram.

  - **Manipulation reads as the bar itself moving.** While you drag or resize, the original bar
    recedes and the shape following your pointer carries the real bar's name, progress and milestone
    shape — one thing moving, instead of a bar plus a floating rectangle.
  - **A date follows the cursor.** A guideline and a chip show the date you are actually choosing,
    through every gesture and while simply scrubbing the canvas. It states the datum in question —
    the tentative finish while dragging a bar's right edge, the start while dragging its left or
    moving the whole bar, the span and duration while drawing a new one. The number is read from the
    same place the edit is committed from, so it cannot disagree with what you get.
  - **Start and finish dates on every bar** (new `Dates` toggle in `View▾`) — drawn flanking the bar,
    left and right, so they stay legible at any bar width.
  - **Float and drift as tails** (new `Float & drift` toggle) — a hollow, hatched tail extending right
    for total float and left for drift, in the same time-scale as the bar, so slack is comparable
    between two activities at a glance. Drift is only ever non-zero in Visual mode or where a
    constraint pushes an activity later; in Early mode everything is already as early as logic
    allows, so no drift tail appears — that is correct, not missing.
  - **Relationship slack** (new `Link slack` toggle) — the gap each tie leaves, shown on the
    **selected** activity's own links, answering "why is this waiting?" without papering the whole
    network in numbers. An SS tie's number sits between the two starts, an FF tie's between the two
    finishes, so it always sits on the run it explains.

  Every new mark is in the diagram key, and every new number has a spoken equivalent: the float and
  drift tails, the per-tie slack and the drift days all read out through the keyboard listbox, so
  none of this is sighted-pointer-only.

  The three new `View▾` toggles ship **off**: measuring the date labels at 2,000 activities could not
  certify they stay inside the canvas's draw-time budget, and an uncertified cost should be a choice
  rather than something imposed on every plan. They are one click away for anyone who wants them.

  Frontend only — every value shown was already computed and sent by the scheduling engine, so
  nothing about how schedules are calculated has changed. Set `VITE_CANVAS_LIVE_FEEDBACK=false` for a
  byte-for-byte rollback to the previous canvas.

## 0.49.0

### Minor Changes

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): the calendar scope tier in the UI — project calendars, tier-aware pickers (ADR-0053, M2, behind `VITE_LIBRARY_SCOPING`)

  The organisation/project calendar split that shipped dark in M1 gets its web surface, behind the new
  compile-time flag `VITE_LIBRARY_SCOPING` (off by default). With it on:

  - **Calendar library** — each row shows a `Scope` badge (Organisation, or `Project: <name>`), and an
    Organisation · Project · All filter reads the API's `?scope=` list.
  - **Project → Calendars** — a project's detail screen gains a Calendars section listing what that
    project's plans can actually be scheduled on (its own calendars plus every organisation one),
    with a "New calendar" that defaults to the project.
  - **Creating** a calendar gains a scope choice. The shared organisation library additionally
    requires `calendar:manage_org`; without it the option is disabled with a plain explanation
    instead of silently missing.
  - **Moving tiers** — promote a project calendar into the shared library, or narrow a shared one to a
    project. A narrowing the server refuses now reads as, e.g., "Still used by 2 plans and 3
    activities outside it — reassign them to another calendar first", not a bare error code.
  - **Pickers** — the plan and per-activity calendar pickers offer the project's own calendars
    alongside the organisation's, grouped and labelled by tier. The resource picker stays
    organisation-only and says so, because the resource pool is shared across every project.

  Frontend only: every endpoint, permission and error code behind it shipped with M1, and the CPM
  engine is untouched. With the flag off every touched screen renders exactly as before and every
  calendar list requests the same URL it always did.

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): flip `VITE_LIBRARY_SCOPING` on by default — calendar project tier, resource hierarchy, archive and search go live (ADR-0053, M6)

  The library-scoping epic's web surface is now **on by default**. Everything below shipped dark
  across M1–M5 and was reachable only by setting the flag; from this release it is what planners see:

  - **Calendars have a project tier.** A calendar belongs either to the shared organisation library or
    to one project. The library screen shows each row's tier and filters by it; a project's detail
    screen lists exactly what its plans can be scheduled on; creating a calendar from a project
    defaults to that project; and a calendar can be promoted to the shared library or narrowed to a
    project (a narrowing that would strand other work is refused with the counts that explain why).
    Plan and activity pickers group their options by tier, so a picker can never offer a calendar the
    server would reject. The resource picker stays organisation-only, because the resource pool is
    shared across every project.
  - **Resources nest.** A non-assignable `Group` kind plus a parent picker turn the flat pool into a
    browsable tree, without fragmenting the single shared pool that cross-plan over-allocation and
    levelling depend on.
  - **Both libraries can be archived and searched.** Archiving retires a calendar or resource from the
    pickers **without touching anything already using it** — every existing plan, activity and
    assignment keeps scheduling exactly as before. That distinction is stated on screen next to every
    archive control, badged on every archived row, and reversible from the same place. Search and the
    filters are server-side and now live in the URL, so a filtered view survives a reload and can be
    shared as a link.
  - **Every picker pages properly.** The shared searched combobox replaces the raw dropdowns, closing
    the defect where a library of more than 20 rows was silently truncated in every picker. "Load
    more" is reachable by keyboard as well as pointer.
  - **Imports no longer pollute the shared library.** A `.xer`/`.xml` import tiers its calendars to the
    target project by default; an Org-Admin-level importer can opt the file's global calendars into
    the shared library from a checkbox in the import review dialog, which re-runs the dry-run so the
    report always describes the import being confirmed.

  Frontend only — no API, schema or CPM-engine change, so the schedule-recalculation parity gate is
  untouched. Set `VITE_LIBRARY_SCOPING=false` for a byte-for-byte rollback to the previous surface.

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): nested resource library with groups (ADR-0053 §3, M3 — behind `VITE_LIBRARY_SCOPING`)

  The web surface for the resource hierarchy, behind the existing `VITE_LIBRARY_SCOPING` flag
  (**off by default**). With it on:

  - the **resources library** lists rows in tree order — a group is followed by its own contents,
    indented — with a `Group` column naming each row's parent and a **Not assignable** badge on
    every group, so the constraint is readable rather than implied;
  - a group shows **Not scheduled** in the Calendar column, distinct from the "—" that means
    "inherits the plan calendar";
  - the **resource form** offers `Group` as a kind and a **parent group picker** (indented by depth)
    that never offers a resource its own contents as a parent; choosing `Group` hides the calendar,
    capacity and cost fields, and those values are never sent for a group;
  - deleting a group that still contains assigned resources explains **how many are assigned inside
    it**, rather than the misleading "this resource is assigned".

  Groups are excluded from the **assign-a-resource** picker regardless of the flag — the API rejects
  a group assignment, so offering one could only ever produce an error.

  With the flag off, the library renders exactly as before: flat, in the server's order, with no
  group column, badge, kind option or parent picker.

- [#156](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/156) [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): a shared searchable picker, plus library search and archive (ADR-0053, M4)

  A new shared **combobox** replaces the plain dropdowns used to pick a calendar, a resource or a
  resource group. It searches the server as you type, pages the rest in on demand, groups options by
  tier, and annotates them ("Project", "Archived") — so choosing from a library of hundreds is
  typing, not scrolling.

  - Full keyboard operation and screen-reader support (WAI-ARIA combobox pattern): arrows, Home/End,
    Enter, Escape, an announced result count, and disabled options that stay discoverable without
    being selectable.
  - The current selection is always shown, even when a search or filter has hidden it — a picker can
    never silently blank out what you already chose, and an archived selection keeps its badge.
  - The calendar and resource libraries gain a search box, a "Show archived" toggle, a kind filter,
    and Archive / Unarchive row actions with wording that makes clear an archived row still
    schedules — it is retired from the pickers, not deleted.

  All of it sits behind `VITE_LIBRARY_SCOPING`, which remains off by default: with the flag off the
  screens and pickers behave exactly as before.

### Patch Changes

- Updated dependencies [[`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e), [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e), [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e), [`f2de423`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f2de42312711bf94864983a43bc96d06285f150e)]:
  - @repo/types@0.17.0
  - @repo/interchange@0.5.0

## 0.48.1

### Patch Changes

- [#153](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/153) [`a496bf3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a496bf3efb0302e379a222c5fd23cb9f6e33ebd3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): library lists and pickers no longer truncate at the first 20 rows — the resource and calendar libraries (and the members list, recycle bin, client/project/plan navigator, baselines, and the predecessor/successor/cross-plan link lists) called their cursor-paginated endpoints with no pagination params, so they silently showed only the server's default 20-row page and the rest of an org's rows could be neither seen nor selected. Each now pages through every row via `apiFetchAllPages`, the helper already used by the plan workspace.

- [#153](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/153) [`a496bf3`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a496bf3efb0302e379a222c5fd23cb9f6e33ebd3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): visible draggable lag/lead handle on the TSLD canvas (the ADR-0052 M3 anchor was grabbable but painted nothing, so the drag was undiscoverable) — a two-tone disc at every draggable anchor, emphasised on hover/drag, plus a 24px pointer target (WCAG 2.5.8)

## 0.48.0

### Minor Changes

- [#151](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/151) [`38f3d85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/38f3d854be30501940aa05566b1e3a7921bc5fc2) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): flip VITE_CANVAS_DIRECT_MANIPULATION on by default (direct manipulation + visual refresh live: time-true anchors, duration resize both edges, draggable lag, refreshed bars + links)

## 0.47.0

### Minor Changes

- [#149](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/149) [`afb1f82`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afb1f82bffc95c54d6a29b9f6be0edd4e6714060) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): activity-bar visual refresh on the TSLD canvas (canvas direct manipulation M4, ADR-0052)

  Fourth slice of the canvas direct-manipulation upgrade, behind the SAME
  `VITE_CANVAS_DIRECT_MANIPULATION` flag (default **off**). Render-only and role-independent
  (Viewer/External Guest included): when on, the activity bars get the M4 visual refresh —

  - **Refreshed bar shape + stroke layering:** subtly rounded corners (`roundRect`, with a square
    fallback on contexts without it), a calm hairline definition stroke (the border token) on
    normal bars, and a **stronger 2px critical/near-critical emphasis outline** — the solid/dashed
    non-colour cue is retained (WCAG 1.4.1) — so the critical path pops against calmer normal bars.
  - **In-bar progress fill:** the completed portion (`percentComplete`, the same value the row/AT
    reports) as a shape-bounded band along the bar bottom plus a hairline divider at the progress
    front (a boundary/shape cue, never colour alone). Drawn in the bar's **paired label ink**
    (or the Colour-by `barInk` override), so contrast holds on every fill in both themes and under
    every lens; culled below the label LOD zoom threshold and on too-narrow bars.
  - **Consistent glyph language:** refined milestone diamond (hairline-outlined when not
    emphasised), an LOE/hammock **bracketed-span** glyph (overhanging end caps) and a WBS-summary
    **bracket** (downward end tabs), each drawn in the bar's own resolved fill so the colour-mode
    lenses recolour the whole glyph as one shape.
  - **Interaction states:** a rounded selection ring that tracks the bar's corners, an idle
    **hover ring** (muted, lighter than selection — published from the already-armed hover
    hit-test, no new per-move work), and rounded drag/resize ghosts with elevation approximated by
    a double stroke — no shadow/blur (the ADR-0026 draw budget).
  - **Labels + badges:** inside labels nudge clear of the rounded corner (LOD gating, truncation
    and collision logic unchanged); the constraint pin gains the foreground outline the other three
    badges already carry (one badge family) — every badge **shape, legend entry and a11y string is
    byte-identical** (string-parity tests).

  All colour resolves from the semantic design tokens via the extended `TsldPalette`
  (`barStroke`, `hoverRing` — resolved once per theme bump, never per frame); the refresh composes
  with `barFill`/`barInk` (the lens owns colour, M4 owns shape) and the legend stays accurate.
  Frontend-only — no API/schema/engine change (the recalc parity gate is untouched). Flag-off the
  canvas paints byte-for-byte today's (recording-context parity tests).

- [#149](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/149) [`afb1f82`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afb1f82bffc95c54d6a29b9f6be0edd4e6714060) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): logic-link visual refresh on the TSLD canvas (canvas direct manipulation M5, ADR-0052)

  Fifth and final slice of the canvas direct-manipulation upgrade, behind the SAME
  `VITE_CANVAS_DIRECT_MANIPULATION` flag (default **off**). Render-only and role-independent
  (Viewer/External Guest included): when on, the logic network gets the M5 visual refresh —

  - **Rounded elbows:** the orthogonal routing's hard 90° corners round with a small arc
    (`arcTo`, guarded with a hard-corner fallback like M4's `roundRect`), the per-corner radius
    clamped by a pure helper to half each adjoining segment so adjacent arcs never overlap. The
    shared `routeOrthogonal` stays the single source of the line's shape.
  - **Deterministic fan-out / de-crowding:** when several relationship ends share the same bar
    edge (many successors off one finish, many predecessors into one start), they spread a few px
    about the bar centreline — grouped by the bar edge their type anchors to, ordered by **edge
    id** (stable across frames and input permutations — no jitter), stepped and capped so anchors
    stay on the bar; crowded parallel verticals also separate via a clamped elbow shift.
    Uncrowded ends — the common zero-lag FS chain — are byte-for-byte unmoved. Computed once per
    frame, O(edges), no viewport coupling (pan-stable).
  - **Lag/lead depiction:** with the time-true anchors on, the on-bar stretch between a walked
    lag anchor and its zero-lag bar edge draws as a subtle dashed hairline in the existing edge
    colour, painted above the bars — so lag reads as "waiting time", sharing the ONE forward
    anchor mapping (the run and the anchor can never disagree).
  - **Incident-link highlight:** selecting an activity highlights its incident links
    persistently — the keyboard/AT-reachable equivalent (WCAG 2.1.1, selection is listbox-
    reachable); hovering a bar (the same already-armed idle-hover classify the M4 hover ring
    reads — editing surfaces only) highlights them transiently. Highlighted ties re-draw one
    weight step heavier (non-driving 2px still-dashed, driving 3px solid, arrowheads matching) in
    the selection (`--color-ring`) colour — a weight change WITH the colour, so neither the
    highlight nor the retained driving dash cue is ever colour-only (WCAG 1.4.1/1.4.11).

  **No palette entry added** — the highlight reuses `selection`, the lag run reuses `edge`; the
  a11y strings are byte-identical (`lagPhrase` already speaks lag). Rect/line/arc primitives
  only, no shadow/blur, all passes batched and O(visible) (the ADR-0026 draw budget). Frontend-
  only — no API/schema/engine change (the recalc parity gate is untouched). Flag-off the canvas
  paints byte-for-byte today's, including on crowded scenes (recording-context parity tests).

## 0.46.0

### Minor Changes

- [#147](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/147) [`af0de56`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/af0de56ed8cd0396f43f01871ede588e9b17f1e7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): time-true TSLD link anchoring + arrowheads (canvas direct manipulation M1, ADR-0052)

  First slice of the canvas direct-manipulation upgrade, behind `VITE_CANVAS_DIRECT_MANIPULATION`
  (default **off**). When on, every dependency link renders **time-true**:

  - Each end anchors at the point in time its lag actually constrains — `lagDays` walked from the
    constrained edge on the relationship's **lag calendar** (plan working days; `TWENTY_FOUR_HOUR`
    lags walk elapsed days — ADR-0036 §6), a lead (negative lag) walking left. FS/FF shift the
    successor anchor from the predecessor's finish; SS/SF embed the anchor along the predecessor bar
    (the GPM embed point). Zero-lag ties keep today's endpoints; anchors clamp to their bar's span;
    null computed dates fall back to the extreme-end routing.
  - Links carry a directional **arrowhead** at the successor end (batched fills, edge colour — the
    driving weight/dash emphasis is retained, never colour alone).
  - The working-day walk is a pure, injected, memoised and horizon-bounded helper
    (`makeWorkingDayWalk`), keeping the render model CPM-free and the draw cost O(visible edges).
  - `summarizeLogic` speaks a lagged driving tie ("SS + 3 working days") via the new `lagPhrase`;
    zero-lag sentences are unchanged.

  Render-only — no gestures, no writes, no API/schema/engine change (the recalc parity gate is
  untouched). Flag-off paints byte-for-byte today's canvas (parity paint test). Records ADR-0052.

- [#147](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/147) [`af0de56`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/af0de56ed8cd0396f43f01871ede588e9b17f1e7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): finish-edge duration resize on the TSLD canvas (canvas direct manipulation M2, ADR-0052)

  Second slice of the canvas direct-manipulation upgrade, behind `VITE_CANVAS_DIRECT_MANIPULATION`
  (default **off**). When on, a Planner (pen held, not under the read-only Late overlay) can change a
  task's duration directly on the canvas:

  - In `select` mode the bar-end grab-zones are repurposed as **duration-resize handles** (ADR-0052
    §1 — link creation stays the two-click Link tool; the legacy edge-drag-link is gated off under
    the flag). Dragging the **finish** edge resizes with a live ghost + duration readout, snapped to
    whole day columns and clamped at ≥ 1 day; an `ew-resize` cursor advertises the zone. Milestones,
    Level-of-Effort and WBS summaries (duration-derived) offer no handles. The start-edge zone is
    classified now but stays inert until M3.
  - The drop issues a `PATCH durationDays` carrying the **full definition round-trip**
    (`activityDefinitionInput` — durationType/EV/accrual/constraints resent verbatim, never silently
    cleared) at the live optimistic version, under the existing 409 conflict / 423 pen contracts,
    then notifies the coalesced auto-recalc.
  - One-step **undo**: a new coalescable `durationResizeCommand` (key `resize:{activityId}`) folds a
    drag / held-key burst into a single reversible step (ADR-0048).
  - **Keyboard equivalent** (WCAG 2.5.7): `Shift+←/→` on the focused bar nudges duration ±1 day,
    coalesced like the existing Alt+arrow moves, announced via the polite live region, and listed in
    the shortcuts help sheet.

  Frontend-only — no API/schema/engine change (the recalc parity gate is untouched). Flag-off the
  bar ends, keymap and paint are byte-for-byte today's (parity tests).

- [#147](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/147) [`af0de56`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/af0de56ed8cd0396f43f01871ede588e9b17f1e7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): start-edge resize + draggable lag anchors on the TSLD canvas (canvas direct manipulation M3, ADR-0052)

  Third slice of the canvas direct-manipulation upgrade, behind `VITE_CANVAS_DIRECT_MANIPULATION`
  (default **off**). When on, a Planner (pen held, not under the read-only Late overlay) can now:

  - **Resize from the start edge** (mode-aware, ADR-0052 §3): dragging a bar's start moves the start
    and keeps the finish pinned (`duration = finish − newStart + 1`, clamped ≥ 1 day), with a live
    ghost labelled with the tentative start date + duration. EARLY mode commits ONE full-definition
    `PATCH {constraintType: SNET, constraintDate, durationDays}` (the spike-verified combined PATCH,
    mirroring the reposition payload); VISUAL mode commits the minimal
    `PATCH {visualStart, durationDays}` through the existing `setVisualStart` seam. One-step undo on
    the shared `resize:{activityId}` coalescing key (a new `visualResizeCommand` restores the prior
    placement AND duration in VISUAL mode).
  - **Drag a link's lag anchor** along the time axis: each drawn (offset) lag anchor gains a grab
    zone; the tentative lag runs through the exact **inverse** of the M1 anchor mapping
    (`lagFromAnchorDay`, one shared pure fn with round-trip property tests), snapped to whole days on
    the relationship's **lag calendar** (negative = lead), with a live `SS + 3d` readout chip. The
    drop issues `PATCH /dependencies/:id` echoing the unchanged type + lag calendar at the live
    version, under the existing 409 conflict / 423 pen contracts, then notifies the coalesced
    auto-recalc. One-step undo via the coalescable `lagDragCommand` (key `lag:{dependencyId}`).
  - **Keyboard lag nudge** (WCAG 2.1.1): the canvas has no per-dependency keyboard surface, so
    `Shift+←/→` lands on the Logic panel's dependency rows (with a focused row's Edit/Remove button)
    — coalesced like the sibling nudges and announced via the polite live region, with an in-panel
    hint advertising the chord.

  Frontend-only — no API/schema/engine change (the recalc parity gate is untouched; the one web-API
  seam change is `useSetActivityVisualStart` optionally carrying `durationDays`). Flag-off the
  zones, gestures, keymaps and paint are byte-for-byte today's (parity tests).

### Patch Changes

- [#147](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/147) [`af0de56`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/af0de56ed8cd0396f43f01871ede588e9b17f1e7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): dock the plan-notes panel instead of overlaying it

  The **Comments** toolbar button opened plan notes as a modal-less `<dialog>` side-sheet that
  mispositioned over the canvas, obscured the workspace, and did not toggle shut. It now behaves like the
  activities and Project Explorer panels — a docked, resizable RIGHT panel that participates in the layout
  and pushes the canvas rather than overlaying it.

  - Notes render in a resizable right column (persisted width via `useNotesPanelPrefs`) with an
    end-anchored `PanelResizer` (`reverseKeys` so keyboard resize matches the pointer). Below `md` the
    panel takes the single pane.
  - **Comments** is now a genuine toggle carrying `aria-pressed` (reflects `notesOpen`), replacing the
    one-way `aria-haspopup="dialog"` opener; closing returns focus to it, and Escape closes the dock.
  - `PlanNotesSection` gains a `chromeless` mode so the panel's `SheetHeader` is the single header and its
    `<section>` the sole landmark (no nested card / duplicate heading).
  - Removes the now-dead overlay-sheet machinery (`Sheet` modal-less path, the `HTMLDialogElement.show`
    test shim, and the toolbar `ariaHasPopup` plumbing).

  Behind `VITE_ENTRY_ROUTES` (default on); flag-off the inline notes block is byte-for-byte unchanged. No
  API or schema change.

## 0.45.1

### Patch Changes

- [#144](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/144) [`5bc9fcc`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5bc9fccfb953ea053ecbd2a9f0f80cd147bcf579) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): dock the plan-notes panel instead of overlaying it

  The **Comments** toolbar button opened plan notes as a modal-less `<dialog>` side-sheet that
  mispositioned over the canvas, obscured the workspace, and did not toggle shut. It now behaves like the
  activities and Project Explorer panels — a docked, resizable RIGHT panel that participates in the layout
  and pushes the canvas rather than overlaying it.

  - Notes render in a resizable right column (persisted width via `useNotesPanelPrefs`) with an
    end-anchored `PanelResizer` (`reverseKeys` so keyboard resize matches the pointer). Below `md` the
    panel takes the single pane.
  - **Comments** is now a genuine toggle carrying `aria-pressed` (reflects `notesOpen`), replacing the
    one-way `aria-haspopup="dialog"` opener; closing returns focus to it, and Escape closes the dock.
  - `PlanNotesSection` gains a `chromeless` mode so the panel's `SheetHeader` is the single header and its
    `<section>` the sole landmark (no nested card / duplicate heading).
  - Removes the now-dead overlay-sheet machinery (`Sheet` modal-less path, the `HTMLDialogElement.show`
    test shim, and the toolbar `ariaHasPopup` plumbing).

  Behind `VITE_ENTRY_ROUTES` (default on); flag-off the inline notes block is byte-for-byte unchanged. No
  API or schema change.

## 0.45.0

### Minor Changes

- [#142](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/142) [`8d7bc43`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8d7bc4361a5fd00bc97c89971dd9647c6bf29784) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): entry-route consistency for the plan workspace (behind `VITE_ENTRY_ROUTES`)

  Makes plan and activity actions reachable from every context where a user expects them, and
  converges duplicated wording. Behind a new compile-time flag `VITE_ENTRY_ROUTES` (default off) for the
  new entry points; label/read-only consistency fixes are unconditional.

  - **Plan notes → right-side drawer.** The always-inline notes block becomes a right-anchored `Sheet`
    drawer toggled by the toolbar **Comments** button (which previously only scrolled to the section),
    reclaiming canvas space. Adds a `side?: 'left' | 'right'` prop to the `Sheet` primitive.
  - **Canvas selection bar** now offers **Resources**, **Report progress** (role-gated, not pen-gated),
    and **Steps** (behind Earned-Value + Steps flags, hidden for milestones/duration-derived), each
    opening the existing dialog — so a planner authoring on the canvas no longer has to drop to the
    activities table. Steps/Progress dialogs are mounted once in the shared workspace dialogs.
  - **Wording convergence.** The selection bar now reads **Edit / Delete / Logic** to match the table,
    and the toolbar progress command is **Report progress…** to match the table and dialog.
  - **Discoverability.** The toolbar "Add note" item gains a tooltip noting it opens the Logic panel
    (links & notes) — adds an optional `description` to the toolbar item registry (appended to the hover
    title, never the accessible name).
  - **WBS parent read-only column** in the activities table (behind `VITE_ADVANCED_ACTIVITY_TYPES`),
    mirroring the existing Calendar/Constraint read-only columns.

  Flag off ⇒ the new selection-bar items and the notes drawer are absent (the inline notes block and the
  prior three-item bar are byte-for-byte unchanged). No API or schema change.

## 0.44.0

### Minor Changes

- [#140](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/140) [`bc4522f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bc4522f1b254bd924d1f77a57cc8a4b12b65a7ad) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: show the running API + web version in the app shell

  Adds a public `GET /api/v1/version` endpoint (unauthenticated, like `/health`) returning
  `{ data: { version } }` — the API's own package version, read once at startup. The web app bakes its
  own version at build time and renders a subtle `web x.y.z · api x.y.z` line in the Project Explorer
  rail footer (muted, non-interactive, screen-reader labelled), fetching the API version via a cached
  query. Makes the deployed versions visible in-product for support/debugging.

- [#140](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/140) [`bc4522f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bc4522f1b254bd924d1f77a57cc8a4b12b65a7ad) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): flip live cross-plan / programme scheduling on by default (ADR-0045)

  `VITE_PROGRAMME_SCHEDULING` — the last dark web flag — is now **on by default** (set `=false` to
  roll back). The programme surface (cross-plan dependency links, "Recalculate programme" over the
  plan-level DAG, and the stale-schedule banner) is exposed in the web UI, layered on the already-live
  API (its component/ux/a11y quality gates and the flag-on Playwright journey are green). This closes
  the last remaining feature flag; every shipped web feature is now on by default.

### Patch Changes

- [#140](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/140) [`bc4522f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bc4522f1b254bd924d1f77a57cc8a4b12b65a7ad) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): load the whole plan into the workspace instead of the first page

  The canvas, activities table and logic view fetched a single default page (20 rows) from the
  cursor-paginated activities and dependencies endpoints, so a plan with more than 20 activities showed
  only the first ~20 and — because a dependency edge only draws when both its endpoint bars are loaded —
  almost none of its links. Adds an `apiFetchAllPages` helper that follows `meta.nextCursor` to
  exhaustion (100 rows/page) and points the plan-workspace activity and dependency queries at it, so the
  full network loads and renders. No API or schema change.

## 0.43.0

### Minor Changes

- [#138](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/138) [`7889f5c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7889f5cde753754511a9b4aa6712d55fb1f715c7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: show the running API + web version in the app shell

  Adds a public `GET /api/v1/version` endpoint (unauthenticated, like `/health`) returning
  `{ data: { version } }` — the API's own package version, read once at startup. The web app bakes its
  own version at build time and renders a subtle `web x.y.z · api x.y.z` line in the Project Explorer
  rail footer (muted, non-interactive, screen-reader labelled), fetching the API version via a cached
  query. Makes the deployed versions visible in-product for support/debugging.

- [#138](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/138) [`7889f5c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7889f5cde753754511a9b4aa6712d55fb1f715c7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): flip live cross-plan / programme scheduling on by default (ADR-0045)

  `VITE_PROGRAMME_SCHEDULING` — the last dark web flag — is now **on by default** (set `=false` to
  roll back). The programme surface (cross-plan dependency links, "Recalculate programme" over the
  plan-level DAG, and the stale-schedule banner) is exposed in the web UI, layered on the already-live
  API (its component/ux/a11y quality gates and the flag-on Playwright journey are green). This closes
  the last remaining feature flag; every shipped web feature is now on by default.

## 0.42.0

### Minor Changes

- [#136](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/136) [`1e4dde4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1e4dde48fe474d4b15468661fa2dd35a6eba8d49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): External-Guest share links surface (ADR-0051 F-M4)

  Ship the web surface for External-Guest per-plan share links, **on by default** behind
  `VITE_GUEST_SHARE_LINKS` (set `=false` to roll back). The TSLD toolbar `share` item opens a member
  **Share links** dialog (list / create — with the one-time guest URL + Copy — / revoke, gated on
  `plan:share`), and a public read-only `/share` guest view (session-less, token in the URL fragment,
  no app-shell chrome, `noindex`, its own lazy-loaded chunk) renders the plan over the F-M3 endpoints.
  Flag-off is byte-identical: the toolbar keeps its "Coming soon" placeholder and no `/share` route is
  registered. Completes ADR-0051 (the fifth product role — External Guest) and closes the last "Coming
  soon" TSLD toolbar placeholder. Ships with the five specialist reviews (security / a11y / ux /
  component / performance) green after the review fold, and a flag-on Playwright journey in CI.

## 0.41.0

### Minor Changes

- [#127](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/127) [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): schedule-export surface in the TSLD Export menu (ADR-0050 M4d)

  Add a web entry point so a planner can download a plan as a foreign schedule file, behind the (already-on)
  `VITE_SCHEDULE_INTERCHANGE` flag.

  - **Export menu items** — the canvas **Export ▾** menu gains an "Interchange" group with **Primavera P6
    (XER)** and **Microsoft Project (MSPDI)**, after the existing CSV/PNG/PDF/Print items (no second menu),
    matching the sibling items' uppercase-acronym labels. Both show a loading spinner and disable while an
    export is in flight (guarding a double-click). The whole group renders only when the
    `VITE_SCHEDULE_INTERCHANGE` flag AND the caller's `interchange:export` permission are both true — the
    latter is held by every member (Viewer upward), so most users see it. Flag-off / permission-off ⇒ the
    menu is byte-for-byte the Stage-C1 set.
  - **Download client** (`features/interchange/api/use-export-plan.ts`) — a cookie-authenticated `GET` that
    reads the response as a Blob, parses the `Content-Disposition` filename (quoted / unquoted / RFC 5987 /
    fallback) and the `X-Interchange-Report` header (JSON, validated against the shared
    `@repo/interchange` Zod schema, tolerating its absence), then triggers a browser download. Pure parsing
    is split from the IO for unit-testing; non-2xx maps to `ApiFetchError` + friendly copy (403/404/422/offline).
  - **Report surfacing** — after a successful download the outcome is announced politely. When the export
    approximated/dropped anything (notably MSPDI), a **visible, dismissible info notice** appears beside the
    toolbar with a **"Download report"** button — the report is offered on click (with export-direction copy)
    rather than auto-downloaded, since the browser's multi-download guard can silently block a second
    download. A clean export shows no persistent notice.

  The CPM engine, the pure `@repo/interchange` package, and `apps/api` are untouched — this is a
  frontend-only download surface over the already-live export endpoint.

### Patch Changes

- Updated dependencies [[`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548), [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548), [`dcfeb5f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/dcfeb5f6a8f84c0a3201a400c36b0c2bae215548)]:
  - @repo/interchange@0.4.0

## 0.40.0

### Minor Changes

- [#125](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/125) [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Wire Microsoft Project MSPDI import through the stack (ADR-0050, Stage C2 M3). A new format-agnostic
  `importSchedule` entry point in `@repo/interchange` detects the interchange format (Primavera P6 XER vs
  MS Project MSPDI XML) from the bytes and routes to the matching orchestrator — both produce the same
  import graph + report, so callers stay format-blind. The interchange commit/dry-run endpoints now call
  `importSchedule` instead of the XER-specific path, so an uploaded `.xml` MSPDI file imports through the
  exact same review→commit pipeline as `.xer` (an unrecognised file gets a single user-safe rejection). The
  web **Import from file…** dialog accepts `.xer` **or** `.xml`, with updated copy and the unparseable-file
  message naming both formats. On by default under the existing `VITE_SCHEDULE_INTERCHANGE` flag.

### Patch Changes

- Updated dependencies [[`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4), [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4), [`1886e03`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1886e03cf6c79070abc07dd3f211e690193981c4)]:
  - @repo/interchange@0.3.0

## 0.39.1

### Patch Changes

- Updated dependencies [[`522b838`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/522b838be2b3fc3ff94c36b6b4fc9d7e77d310a6)]:
  - @repo/interchange@0.2.0

## 0.39.0

### Minor Changes

- [#121](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/121) [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the schedule-import **review UI** (ADR-0050, Stage C2 M1), **on by default** (`VITE_SCHEDULE_INTERCHANGE`).
  Gated on the `interchange:import` permission (Planner + Org Admin), a project's plan-create
  surface gains an **Import from file…** entry that opens a two-phase review dialog: pick a Primavera P6
  `.xer` → the app **dry-runs** it (parse-only, no write) and renders the returned report (mapped
  counts + approximation / repair / drop findings, downloadable) → **Confirm import** commits it (creates
  the plan server-side, recalculates) and opens the new plan on the TSLD canvas. Client-side size guard,
  friendly mapping of the server's 422 reject / 413 oversize / network failures, and a fixed
  display-only target project. **Accessibility (WCAG 2.2 AA):** the file-input error is linked to the
  control (`aria-invalid` + conditional `aria-describedby`), the resolved dry-run report and the
  committed import are announced via the shared polite live region (4.1.3), the commit phase shows a
  `role="status"` spinner, and the mapped-counts list carries an accessible group name. Flag-off leaves
  the plan-create surface byte-for-byte unchanged.

### Patch Changes

- Updated dependencies [[`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb), [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb), [`58c9c85`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/58c9c85a5dcbcb2ab2474efafe6cc1bdbb7afedb)]:
  - @repo/interchange@0.1.0

## 0.38.0

### Minor Changes

- [#119](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/119) [`c31e9f8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c31e9f8c8311ab7e93e9152e0a9293d3750de869) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas resource view & over-allocation highlight on by default (VITE_CANVAS_RESOURCE_VIEW)

  Turn the `resource-view` TSLD-toolbar placeholder into a real Look-row lens over
  already-shipped engine output — no API/schema/`@repo/types`/CPM-engine change (the
  recalc parity gate is untouched):

  - **Resource view** — toggles a **canvas-axis-aligned demand strip**: a Canvas 2D
    sibling layer (the third ADR-0026 layer: scene · interaction · strip) painted by
    the existing TsldCanvas rAF loop from the same viewport, so bucketed
    resource-loading bars sit under the diagram's day/week/month columns and pan/zoom
    with zero desync. Strip chrome (resource picker + bucket-size select + accessible
    data table) is a DOM `ResourceStripPanel` docked above the reserved band; strip
    bars are canvas. Reads the shipped resource-histogram read-model.
  - **Flag over-allocated** — a sibling lens that rings over-allocated activity bars
    with a rising-histogram shape badge (a non-colour-only cue distinct from the
    constraint pin / conflict / lane-overlap badges), plus a parallel listbox marker
    and a polite count announcement, derived from the shipped levelling flags
    (`levelingWindowExceeded`/`selfOverAllocated`). Independent of the demand strip;
    disabled-with-reason when nothing is over-allocated but stays clickable-to-off
    while active.

  Behind `VITE_CANVAS_RESOURCE_VIEW` (on by default, gated on the resource-histogram
  data source): set it to `false` to ship both ids as their "Coming soon"
  placeholders and paint the canvas byte-for-byte as today (the rollback / parity
  path). See ADR-0049. Stage E of the toolbar-placeholder burn-down.

## 0.37.0

### Minor Changes

- [#117](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/117) [`a50b27b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a50b27bab7126d4856463b34547723efb755f62b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): Level of Effort (hammock) on the canvas Add flow (VITE_CANVAS_ACTIVITY_TYPES)

  Turn the canvas Add split-button's two "Coming soon" placeholders (Level of effort +
  Hammock) into ONE live **Level of Effort (hammock)** item that arms a two-click
  endpoint-pick tool: pick a start driver, then a finish driver, and SchedulePoint
  composes a `LEVEL_OF_EFFORT` activity plus its SS/FF driver edges as one undoable
  action, then recalcs and redraws. Frontend-only over the already-shipped LOE
  engine — no API/schema/`@repo/types`/CPM-engine change (the recalc parity gate is
  untouched).

  - The armed Add trigger shows "Pick start driver" → "Pick finish driver"; the item
    shades with "Add activities to span between them" below two activities; the tool
    disarms and announces on commit/cancel; a keyboard-picked start survives a
    pointer-picked finish (single-sourced pick, WCAG 4.1.3).
  - A raw `HAMMOCK` is never created — SchedulePoint's LOE **is** the span-derived
    hammock (P6 vocabulary kept on the single item for discoverability).

  Set `VITE_CANVAS_ACTIVITY_TYPES=false` to keep the Add menu's disabled placeholders
  byte-for-byte and leave the tool unreachable (rollback / opt-out).

## 0.36.0

### Minor Changes

- [#115](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/115) [`8d770c2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8d770c2f630322c62861a8e8fe2ea5d6341edf94) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): TSLD export & print on by default (VITE_EXPORT_PRINT)

  Turn the two "Coming soon" TSLD-toolbar placeholders (`export`, `print`) into real
  client-side deliverables — no API/schema/`@repo/types`/CPM-engine change (the recalc
  parity gate is untouched):

  - **Export ▾** — a grouped APG menu: **Schedule / All activities (CSV)** (Excel-safe,
    formula-injection-guarded, UTF-8 BOM) with a conditional **Matching activities only
    (N)** item when a filter/isolate lens narrows the set; **Diagram — whole plan /
    current view** as both **PNG** (off-screen `paintScene` in a light print palette)
    and **PDF** (lazy `import('jspdf')`, absent from the initial bundle). Each output
    carries a distinct filename, announces "Preparing…" then its outcome, and raises a
    visible banner on failure.
  - **Print…** — a browser print of the whole diagram via a print-only container +
    `@media print` stylesheet.

  Set `VITE_EXPORT_PRINT=false` to restore the toolbar, canvas paint and a11y tree
  byte-for-byte (rollback / opt-out); no export module or jsPDF chunk loads. `share`
  and XER/MSP interchange are deferred to C2; app-handled `Ctrl/Cmd+P` is a deferred
  fast-follow.

## 0.35.0

### Minor Changes

- [#112](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/112) [`96ab413`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/96ab413580809c83e343345478b2afa79718f814) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas navigation & authoring aids on by default (VITE_CANVAS_NAV)

  Turn three shaded TSLD-toolbar placeholders into real client-side commands over
  already-shipped engine output — no API/schema/`@repo/types`/CPM-engine change (the
  recalc parity gate is untouched):

  - **Isolate logic path** — a split button that dims every activity NOT on the
    selected activity's transitive predecessor+successor chain (full, or a
    driving-only sub-chain), reusing the canvas-lenses dim seam and marking the a11y
    listbox; the chevron picks Full / Driving / Stop, the main button toggles.
  - **Next conflict** — cycles the plan's flagged activities (constraint violation,
    visual conflict, external-driven, levelling-window exceeded, negative total
    float), centring, selecting and announcing each, with a visible "Conflict i of n
    · reason" chip.
  - **Snap to grid** — a Visual-mode, pen-gated session toggle that rounds a dropped
    `visualStart` to the nearest working day before the existing PATCH.

  Set `VITE_CANVAS_NAV=false` to restore the toolbar, canvas paint and a11y tree
  byte-for-byte (rollback / opt-out).

## 0.34.0

### Minor Changes

- [#104](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/104) [`c27a6e9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c27a6e9fcdf8c08c597a308a60285e3627b8d149) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD canvas insight lenses (Stage A of the toolbar-placeholder burn-down) — three previously-"Coming
  soon" Look-row controls are now wired to already-shipped data as pure client render lenses, **on by
  default** (`VITE_CANVAS_LENSES`, set it to `false` to restore the placeholders). Frontend-only: no API,
  schema, `@repo/types`, or CPM-engine change; the recalc parity gate is untouched.

  - **Filter / Search** — a live search field + a Filter menu (Critical / Has constraint / Has conflict)
    that **dim** non-matching bars (shade-don't-remove; geometry, lanes and logic lines stay put), mirror
    the parallel a11y listbox, and announce the match count.
  - **Colour by…** — recolour bars by Criticality (default, byte-for-byte today's fills) / Total-float
    bucket / WBS group, with a mode-aware Legend, contrast-safe inside-bar labels, and the critical outline
    retained in every mode (never colour-only). Driving-resource colouring is a deferred fast-follow.
  - **Baseline overlay** — ghost outline bars behind the live bars at the active baseline's captured dates
    (reusing the shipped variance read; culled with the bar layer), with a Legend key; disabled-with-reason
    when there's no active baseline.

  All three are theme-reactive (a shared `useThemeVersion` hook re-resolves the palette on a light/dark
  switch). WCAG 2.2 AA; covered by unit tests. `VITE_CANVAS_LENSES=false` restores the toolbar and the
  canvas paint byte-for-byte (rollback).

## 0.33.0

### Minor Changes

- [#102](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/102) [`1dcd074`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1dcd0749516198ebe432d09488f15bf988971d15) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD toolbar quick-wins — five previously-"Coming soon" toolbar buttons are now wired to already-shipped
  features, **on by default** (`VITE_TOOLBAR_QUICK_WINS`, set it to `false` to restore the placeholders).
  Frontend-only: no API, schema, `@repo/types`, or CPM-engine change; the recalc parity gate is untouched.

  - **Go to today** — pans the canvas to today's date line (the `goToDate` left-inset view jump); view-only,
    available to every role.
  - **Comments** — reveals and focuses the plan-level notes thread (behind `VITE_NOTES`).
  - **Update progress…** — opens the activity progress editor for the selected activity (Contributor+).
  - **Add note** — opens the selected activity's Logic panel at its Notes section (behind `VITE_NOTES`).
  - **Clear visual placement** — drops the selected bar's hand-placed `visualStart` back to the computed
    date (Visual mode, pen-gated); announces success and surfaces a stale-version conflict non-destructively.

  The canvas selection is lifted into the workspace so the toolbar's selection-aware items enable only when
  an activity is selected (each with its own role / pen / mode gate and an exposed disabled reason). Every
  action reuses an existing REST mutation, so the server stays the sole trust boundary. WCAG 2.2 AA; covered
  by unit tests. `VITE_TOOLBAR_QUICK_WINS=false` ships the five ids as their prior "Coming soon" placeholders,
  byte-for-byte.

## 0.32.0

### Minor Changes

- [#100](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/100) [`25e6090`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/25e6090a1fd50daf87b43161e184db151d25e6db) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Undo / redo for plan authoring (ADR-0048) — a client-side, per-plan, per-pen-session command stack,
  **on by default** (`VITE_UNDO_REDO`, set it to `false` to ship it inert). Undo replays plan **inputs**
  through the existing mutation hooks and the normal auto-recalc redraws, so
  the CPM engine and the recalc parity gate are structurally untouched; every inverse rides the unchanged
  pen (423) + RBAC + org-scope + optimistic (409) gates.

  - **Coverage**: reposition, relane, activity update, create, leaf delete (re-create), dependency
    add/remove, `visualStart`, and auto-arrange (one reversible step). A pointer drag / nudge burst
    coalesces to a single undo step; a WBS-summary cascade delete truncates history rather than offering a
    broken partial undo (id-stable cascade restore is a deferred follow-on).
  - **Surface**: pen-gated Undo/Redo in the TSLD toolbar (disabled with a reason when there's nothing to
    undo/redo, entity-named labels), keyboard `Cmd/Ctrl+Z` · `Cmd/Ctrl+Shift+Z` · `Ctrl+Y` (scoped to the
    workspace, inert in fields and while a modal is open, suppressing browser Back/Forward), the shortcuts
    sheet, and live-region announcements.
  - **Conflict-safe**: a 409/404 aborts non-destructively, refetches server truth and clears redo; a 423
    clears the stack and hands off to the shared edit-lock banner. Linear history, depth 50, cleared on
    plan switch / pen release / reload.

  WCAG 2.2 AA; covered by unit tests and a flag-on Playwright journey (`playwright.undo.config.ts`, wired
  into CI). Set `VITE_UNDO_REDO=true` to enable the surface in an environment.

## 0.31.0

### Minor Changes

- [#98](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/98) [`c0e7cc2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c0e7cc2864535bb85b621da481bcb76d092845fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Notes M3 — the web surface (the Notes feature, ADR-0046) — **on by default** (`VITE_NOTES`, set it to
  `false` to hide the web surface in an environment). It puts the live note-thread API (M2) in front of a
  planner: attributed, time-ordered note threads on plans and activities — the weekly-progress "why", not
  just the "what".

  - **Thread + composer**: a newest-first `NoteThread` (cursor "Load more", loading/empty/error states)
    with a RHF + Zod `NoteComposer` (trimmed body, 1–5000, live character cue). Each `NoteItem` shows the
    author, timestamp and an "edited" marker; **Edit and Delete are offered only to the note's own author**
    — a non-author sees no affordance. Inline edit sends the optimistic `version` and handles the **409**
    ("updated elsewhere — review and edit again") and **403** ("you can no longer edit this note") paths by
    refetching the thread and announcing via `role="status"`.
  - **Surfacing**: an activity **Notes** section in the Logic panel (beside Predecessors/Successors/
    Cross-plan links) plus a route-composed **note-count badge** on the activities-table row (fed by one
    batch counts query, not per-row); a plan **Notes** section on the plan detail route and both canvas
    workspaces (context-aware heading level, no outline skip).
  - **Write-gating**: the composer/edit/delete render only for `note`-writers (Contributor → Org Admin);
    a Viewer sees a read-only thread. Notes are **not** plan-edit-lock gated.

  Reuses design-system primitives (`TextareaField`, `Button`, `Badge`, `ConfirmDialog`, the announcer);
  no one-off styling. WCAG 2.2 AA (labelled controls, keyboard, focus management on inline-edit/delete,
  `role="status"` async notices, distinguishing per-note action labels). Covered by component tests and a
  flag-on Playwright journey (`playwright.notes.config.ts`, wired into CI). Setting `VITE_NOTES=false`
  restores the prior behaviour (no sections mount, the counts query never fires, the badge is suppressed).

### Patch Changes

- Updated dependencies [[`c0e7cc2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c0e7cc2864535bb85b621da481bcb76d092845fe)]:
  - @repo/types@0.16.0

## 0.30.0

### Minor Changes

- [#96](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/96) [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Live cross-plan / programme scheduling web surface (inter-project M2, ADR-0045 §4/§5/§6, F8) — behind
  a **new default-OFF flag `VITE_PROGRAMME_SCHEDULING`**, so it changes nothing until an operator opts in.
  It puts the already-live cross-plan link CRUD, programme-recalc orchestration and staleness read (F3–F6)
  in front of a planner:

  - **Cross-plan links** — a new section in the activity Logic panel (the **successor** activity's home,
    CQ-2) to draw a **live** inter-project link from an upstream activity in **another plan** of the org.
    An org-scoped endpoint picker (client → project → plan → activity — the successor's own plan is
    excluded, so N31 can't be chosen) plus FS/SS/FF/SF type + signed lag + lag-calendar inputs (mirroring
    the intra-plan dependency editor), a both-direction link list ("Driven by" / "Drives") with delete,
    and the shared `CROSS_PLAN_DEPENDENCY_CONFLICT_MESSAGES` copy for the same-plan / cycle / duplicate
    rejections. RHF + Zod.
  - **Recalculate programme** — an action (Planner/Org Admin) beside the existing Recalculate that runs
    the synchronous `…/schedule/recalculate-programme` solve, with a result panel (per-plan summaries
    upstream-first + the summed missing-upstream **N32** warning), the **423 `PROGRAMME_PLANS_LOCKED`**
    blocked-plans path (a link per blocked plan to request/override its pen), and the **422
    `PROGRAMME_TOO_LARGE`** path.
  - **Stale banner** — a `role="status"` notice shown when the plan summary carries `scheduleStale` (an
    upstream plan was recalculated more recently), prompting a programme recalculate.

  The whole surface is unobtrusive: it renders only for a plan that actually has cross-plan links (the
  summary's `scheduleStale` field is present only then), so an ordinary plan is unaffected even with the
  flag on. Reuses design-system primitives (Dialog, Select, Badge, DataTable, Button, form fields); no
  one-off styling. WCAG 2.2 AA (labelled controls, keyboard, focus management, `role="status"` async
  notices). Covered by component tests (links section, add-link cascade + validation + conflict copy,
  programme control success/423/422/staleness) and a flag-on Playwright journey
  (`playwright.programme.config.ts`, wired into CI). Flag default OFF ⇒ existing behaviour byte-identical.

### Patch Changes

- Updated dependencies [[`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22), [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22), [`7aa0132`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7aa0132662097a928224901833896b07df583f22)]:
  - @repo/types@0.15.0

## 0.29.0

### Minor Changes

- [#94](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/94) [`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Turn on the remaining eight off-by-default web surfaces (Resources, Duration types, Resource
  levelling, Earned Value, Cost accrual, Activity steps, Resource curves, Inter-project external dates)
  by flipping their `VITE_*` flags from default-off to default-on — after clearing every documented
  pre-flip blocker. The engine/API behind each surface was already live; this exposes it in the UI by
  default.

  Pre-flip remediation (TECH_DEBT [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)/[#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)/[#40](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/40)/[#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)/[#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):

  - **API (`@repo/api`)** — **Pen-gate resource-assignment writes** ([#39](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/39)): assign / edit / unassign now
    call `PlanEditLockService.assertHoldsPen` like the activity write path (a units/rate edit persists the
    owning activity's derived duration, a scheduling mutation), returning **423** to a non-holder when
    `PLAN_EDIT_LOCK_ENFORCED` is on; 423 e2e added. **Money overflow guards** (#40a): every integer
    minor-unit money field (`budgetedExpense`/`actualExpense`/`budgetedCost`/`actualCost`) gains
    `@Max(MONEY_MINOR_UNITS_MAX)` and every `Decimal(18,4)` field
    (`costPerUnit`/`maxUnitsPerHour`/`budgetedUnits`/`unitsPerHour`/`actualUnits`) `@Max(DECIMAL_18_4_MAX)`,
    so an over-range value is a clean **422** rather than a precision-loss / column-overflow 500; boundary
    specs added. **Engine-owned `external_driven`** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): a new per-activity boolean column mirroring
    `constraint_violated` (metadata-only migration), written by the recalc batched `unnest` UPDATE and
    aggregated in the read-summary so `externalDrivenCount` is truthful on a plain summary read.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `externalDriven: boolean`; new
    `MONEY_MINOR_UNITS_MAX` / `DECIMAL_18_4_MAX` bounds.
  - **Web (`@repo/web`)** — **Row-actions `Menu`** ([#38](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/38)): the activities table's per-row actions move from
    a spread of ghost buttons to a single overflow `⋯` trigger opening the APG `Menu`
    (Logic/Progress/Resources/Steps/Edit/Delete, role-gated) — meeting the "dense row actions use a Menu,
    never hover-only" standard. **External badge** ([#41](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/41)): an "External" row badge in the Name cell mirrors
    the "Conflict" badge, driven by the engine's per-activity `externalDriven`. **Context gating** ([#44](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/44)):
    the Steps row action is coupled to Earned Value (its only consumer), and the resource loading-curve
    picker is hidden for zero-span milestones. Then all eight `flagDefaultOff` flags become `flagDefaultOn`.

  Parity: `compute.ts` and `level.ts` are untouched; `external_driven` is engine-owned output written on
  every recalc (false when not external-driven), so absent-data byte-parity holds and existing engine / EV
  goldens do not move. Not addressed here (documented follow-ups): #40b Contributor cost-progress wiring,
  [#42](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/42) shared `SelectField`, [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/43) histogram bucket in URL.

### Patch Changes

- Updated dependencies [[`4e78ff1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/4e78ff11f9468ed8511f2e780dc2072abacc7050)]:
  - @repo/types@0.14.0

## 0.28.0

### Minor Changes

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cost accrual (M7 rung 5, ADR-0044 F1 / ADR-0035 §32). Each activity gains a settable `accrualType`
  (`START` / `UNIFORM` (default) / `END`) that governs **when** its cost lump-sum is recognised in the
  Earned-Value read's Planned-Value time-phasing — `START` at the activity start, `END` at its finish,
  `UNIFORM` linearly — reshaping the cost / cash-flow S-curve. It **never changes a CPM date**, feeds the
  scheduler nothing, and is a pure read-model extension of `earned-value.ts`: `UNIFORM` (or absent) is
  byte-identical to the pre-ADR-0044 phasing (the parity gate), so the existing Earned-Value goldens stay
  green. The engine (`compute.ts`) and the levelling pass (`level.ts`) are untouched.

  - **API (`@repo/api`)** — the create/update activity DTOs, the activity response DTO, and the EV read
    path (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`) all carry `accrualType`
    (reuses `activity:update`; the EV read stays `cost:read`-gated). `AccrualType` / `ACCRUAL_TYPES`
    round-trip through `@repo/types`.
  - **Types (`@repo/types`)** — `ActivitySummary` gains `accrualType: AccrualType`.
  - **Conformance** — the EV adapter reads the fixture's `expenses.accrual_type` and collapses per-expense
    → one activity value (ADR-0044 §Q4); new first-principles goldens assert the phased PV to the minor
    unit for **E001** (£45,000 crane mobilisation, `START` — full PV at the start), **E002** (£68,000,
    `UNIFORM` — 50% at mid-window) and **E004** (£3,500 retention, `END` — nothing until the finish), plus
    a `UNIFORM`→`START` flip differential. The `accrual_start` / `accrual_uniform` / `accrual_end`
    capability tags flip ✅ (32 ✅ / 1 ⚪); ADR-0035 gains an **Accepted §32**.
  - **Web (`@repo/web`)** — a **Cost accrual** select (Start / Uniform / End) in the activity form's
    "Cost & earned value" fieldset, behind the new **off-by-default** `VITE_COST_ACCRUAL` flag; wired
    through the create/update mutation and seeded from the row so a stored value round-trips when hidden.

  Deferred (later ADR-0044 slices, not in this change): the period-trend cost **S-curve** chart series
  (read-model + web), weighted **activity steps** (F2), and **resource loading curves** (F3).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`b60f2c7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/b60f2c74dfbd297d64083d35f9b1d52e30e3f27e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Duration types & the resource-units rate on the web, behind `VITE_DURATION_TYPES` (default off, M7
  rung 4, ADR-0040). The activity form gains a **Duration type** picker (Fixed Duration & Units/Time
  (default) / Fixed Duration & Units / Fixed Units / Fixed Units/Time), shown for types that carry an
  entered duration. The per-activity resource assignment editor gains, on the **driving** assignment, a
  **units/time (rate)** field with its own save and a live "Duration becomes N days" preview for a
  units-driven type — a pure client-side mirror of the server's `resolveTriad` (the server stays
  authoritative; the preview also mirrors the N20 zero-rate block). A units/rate edit on a rated driving
  assignment names its `editedField` so the server recomputes the triad and — for `FIXED_UNITS` /
  `FIXED_UNITS_TIME` — derives the activity's duration, refetched into the table. Everything behind it (the
  `durationType` / `unitsPerHour` fields, the recompute, the conformance proof) was already live; this only
  exposes it in the UI. Set `VITE_DURATION_TYPES=true` to enable it in an environment.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`9e5a4d9`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9e5a4d9dc000b9aa7b1115822f165f1680ee3dfe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable the two remaining dark web surfaces by default. **Float & critical plan settings**
  (`VITE_FLOAT_CRITICAL_SETTINGS`, ADR-0035 §17/§18/§20) and **advanced activity types**
  (`VITE_ADVANCED_ACTIVITY_TYPES`, ADR-0035 §21/§24 — Level of Effort + WBS summary/parent pickers) now
  default **on**, having cleared their component/ux/a11y reviews. The engine, API, and conformance behind
  both were already live; this flips the web pickers on so a planner can use them without an env override.
  Set either flag to `false` to roll back to the prior surface, byte-for-byte. (The server-side
  `PLAN_EDIT_LOCK_ENFORCED` stays the one deliberate ops switch, enabled after the pen bundle is live per
  ADR-0028 §9 — unchanged.)

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Cost & Earned Value on the web, behind `VITE_EARNED_VALUE` (default off, EV4b / ADR-0042). The plan
  scheduling settings gain an **EAC method** picker (CPI (default) / Remaining-at-budget / CPI × SPI) and a
  plan **Currency** (ISO-4217) field. The resource form gains a **Cost per unit** rate; the activity form
  gains a **% complete type** picker (Duration (default) / Units / Physical), a **Physical % complete**
  field (shown for the Physical measure), and **Budgeted / Actual expense** money fields — hidden for types
  with no cost meaning (milestone, LOE, WBS summary); the resource-assignment editor gains **Budgeted cost**
  (an optional override), **Actual cost**, and **Actual units**. The headline is a new **Earned Value**
  analysis surface — KPI tiles for the plan total (SPI, CPI, EAC, plus BAC/EV/AC/VAC) and a per-activity +
  WBS table (BAC, PV, EV, AC, SV, CV, SPI, CPI, EAC) — reading `GET …/schedule/earned-value`; a behind-
  schedule / over-budget index is flagged with a word + icon, never colour alone (WCAG 2.2 AA), and a
  **403** (a non-Planner without `cost:read`) renders a friendly "restricted" state rather than a generic
  error. Money is entered in **major units** (e.g. dollars) and stored/rendered as integer **minor units**
  in the plan currency (`lib/format-money`, `narrowSymbol`, a 2-decimal-currency assumption). Every cost
  input seeds from the row even when hidden, so with the flag off the surface is byte-identical to today and
  an edit never clobbers a stored value. Everything behind it (the settable cost DTOs and the earned-value
  read endpoint) was already live; this only exposes it in the UI. Set `VITE_EARNED_VALUE=true` to enable
  it in an environment.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Flagged web surface for external / inter-project dates (ADR-0043 / ADR-0035 §30, M1), behind
  `VITE_INTER_PROJECT_DATES` (default off). The activity form gains an **External dates** section with
  optional **External early start** / **External late finish** calendar-day fields (imported commitments
  gating the activity from another project), including a client-side check that the late finish is not
  before the early start (the N26 rule, also enforced server-side as a 422). Plan settings gain an **Ignore
  external relationships** toggle that drops all external bounds so the plan can be viewed on its own logic.
  The schedule summary strip shows an **Externally driven** count when a recalculation reports one. Everything
  is default-off and additive; a stored external date still round-trips through the form when the flag is off.

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource levelling on the web, behind `VITE_RESOURCE_LEVELLING` (default off, ADR-0041). The plan
  scheduling settings gain a **Level resources** toggle (the opt-in switch for the second levelling pass)
  and, when it is on, a **Level within float only** toggle (delay only within total float, never extending
  the schedule). The resource form gains a **Max units/hour** capacity field (the availability ceiling the
  levelling pass respects; blank = uncapped), and the activity form gains a **Levelling priority** field
  (lower wins the resource when two activities contend), hidden for types levelling never moves (milestone,
  LOE, WBS summary). Once a plan has levelled, the schedule summary shows a **levelled overlay** — the
  levelled project finish and the levelled / window-exceeded / over-capacity counts — alongside the
  unchanged pure-network critical path and floats. Everything behind it (the plan `levelResources` /
  `levelWithinFloatOnly` options, resource `maxUnitsPerHour`, activity `levelingPriority`, the opt-in second
  engine pass and its levelled overlay + summary counts) was already live; this only exposes it in the UI.
  Set `VITE_RESOURCE_LEVELLING=true` to enable it in an environment.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`d366218`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/d366218f2e793d06859b1cbb0cdabb64d63f308e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Activity form can create **Level-of-Effort** activities (M5-epic F4, ADR-0035 §21), behind
  `VITE_ADVANCED_ACTIVITY_TYPES` (default off). When on, the Type picker offers "Level of effort"; picking
  it hides the Duration and Expected-finish inputs (an LOE's duration is derived from its SS-predecessor →
  FF-successor span) and explains that the span comes from its links. The picker otherwise offers only the
  three fully-supported types (Task, Start/Finish milestone) — Hammock and the not-yet-built WBS-summary
  are no longer offered — while a legacy/seeded value stays visible and selected when editing (the
  honest-selector pattern). The engine, API and conformance proof for LOE are already live (F1–F3).

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Resource loading curves (M7 rung 5, ADR-0044 F3 / ADR-0035 §31) — **the final capability-matrix slice**.
  Each resource assignment gains a settable `curveType` (`UNIFORM` (default) / `BELL` / `FRONT_LOADED` /
  `BACK_LOADED` / `DOUBLE_PEAK`) — a named P6 loading curve — plus a new pure read-model
  (`resource-histogram.ts`) that distributes each assignment's `budgetedUnits` across its effective span
  (`start + assignment-lag → finish`, on the activity's own calendar, ADR-0037) per the named 21-point
  profile and aggregates a **units-over-time histogram per resource**, **conserving units** exactly
  (`Σ buckets === Σ budgetedUnits`). It moves **no CPM date**, owns **no engine column**, and does **NOT**
  feed the levelling pass this rung (Q2). `UNIFORM`/absent is a **flat** load — byte-identical to a
  flat-rate distribution — so the parity gate is trivial. `compute.ts` and `level.ts` are untouched.

  - **API (`@repo/api`)** — the create/update assignment DTOs, the assignment response DTO, and the
    assignment repository/service all carry `curveType` (reuses the existing `resource:assign` permission;
    a plain enum, not cost-gated). New `GET …/schedule/resource-histogram` endpoint (`schedule:read` — the
    units histogram is **schedule data, not cost**, Q5) with a `granularity` param (`DAY`/`WEEK`/`MONTH`)
    and offset paging over the per-resource series; the `meta` carries the shared bucket axis, series total,
    and `curveNormalisedCount` (N29). The new pure `computeResourceHistogram` read-model is a dependency-free
    sibling of `float-paths.ts` / `earned-value.ts`.
  - **Types (`@repo/types`)** — `ResourceCurveType` / `RESOURCE_CURVE_TYPES`, the histogram response types
    (`ResourceHistogram*`, `HistogramGranularity`), and `curveType` on `ResourceAssignmentSummary`.
  - **Conformance** — a new `resource-histogram-adapter.ts` reads the fixture's `resource_curves` +
    `assignments.curve`; the built-in profile constants are asserted **byte-equal to the fixture's
    profiles** (self-baselined, no external oracle, ADR-0034). Goldens prove **AS0026** (FRONT_LOADED,
    2400 u), **AS0042** (BACK_LOADED, 640 u), **AS0015** (BELL, 1200 u) and **AS0043** (DOUBLE_PEAK, 560 u)
    distribute to the exact profile shape and sum to `budgetedUnits`, plus a UNIFORM-vs-FRONT_LOADED
    differential (`resultsDiffer`), the assignment-lag case (**AS0027**), and **N29** (a profile not summing
    to 100 ⇒ normalise to the budget, units conserved, counted). The `res_curve_bell` /
    `res_curve_front_loaded` / `res_curve_back_loaded` / `res_curve_double_peak` capability tags flip ✅ —
    **closing the matrix (34 ✅ / 0 ⚪)**; ADR-0035 gains an **Accepted §31** + N29.
  - **Web (`@repo/web`)** — a **loading-curve picker** (Uniform / Bell / Front-loaded / Back-loaded /
    Double-peak) on the resource-assignment dialog and a **Resource histogram** read view (a bar chart with
    a keyboard-navigable data-table equivalent for WCAG 2.2 AA), behind the new **off-by-default**
    `VITE_RESOURCE_CURVES` flag; the picker round-trips through the assignment create/update mutation.

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`f3bec8d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f3bec8d81e0227b40010c91077a02eec42a9a225) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Flagged web surface for **WBS summaries** (M5-epic F8, ADR-0038 / ADR-0035 §24). Behind
  `VITE_ADVANCED_ACTIVITY_TYPES` (off by default), the activity form's Type picker now offers **WBS
  summary** alongside Level of Effort: choosing it hides the Duration/Expected-finish inputs (a summary's
  dates roll up from its branch) and explains the roll-up. A new flag-gated **WBS parent** picker nests any
  activity under one of the plan's existing summaries — round-tripping `parentId` through create and update,
  excluding the activity itself, and keeping a seeded parent visible under an honest label if it isn't in
  the list (the honest-selector pattern). The picker distinguishes loading, an honest load error, and a
  resolved-empty plan (which guides the planner to create a summary first) as separate states, and the
  WBS-summary explainer describes the real nesting flow (open each activity in the branch and set its WBS
  summary to this one). The engine/API/conformance for WBS rollup are already live (F5–F7); this only lets a
  planner pick the type and set the parent. Canvas summary-bar rendering and navigator-tree visual nesting
  remain deferred (TECH_DEBT [#37](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/37)).

- [#91](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/91) [`cc7b02f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cc7b02fcaa36ff130ace19501c245029b377637c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the **resource management** web surface (M7-F6, ADR-0039), behind a new **default-off** flag
  `VITE_RESOURCES` so it ships dark. An org-level **Resources library** screen
  (`/orgs/:orgSlug/resources`) lists, creates, edits and deletes resources — each with a name, optional
  code/description, a kind (Labour / Equipment / Material) and an optional own calendar — and a per-activity
  **Resources** dialog (from the activities row) assigns a resource with budgeted units and an optional
  **driving-resource** flag, plus edit/unassign. A Material resource can never be the driving resource: the
  driving toggle is disabled with an explanatory hint (the API's `MATERIAL_CANNOT_DRIVE` is the backstop),
  and setting a driver moves the flag off the previous one (announced). Reads are open to any member; create/
  edit/delete/assign are Planner + Org Admin. With `VITE_RESOURCES` off the app is byte-identical to before —
  no nav link, no route, no row action. The activities row-actions crowding this adds a fifth item to is
  recorded as tech debt (migrate the cell to the `Menu` primitive before the flag is flipped on).

- [#93](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/93) [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Weighted activity steps (M7 rung 5, ADR-0044 F2 / ADR-0035 §33). An activity gains a **weighted progress
  step checklist** (`activity_steps` child table — `seq` / `name` / `weight` / `percentComplete`) whose
  weight-weighted mean `Σ(w·p)/Σw` becomes the activity's **PHYSICAL** %-complete and **wins** over the
  manual `physicalPercentComplete` when steps are present. Steps feed the ADR-0042 `PHYSICAL` Earned-Value
  measure only — they **never change a CPM date**; with no steps the manual field stands exactly (the
  byte-identical parity path, so the existing EV goldens stay green). The engine (`compute.ts`) and the
  levelling pass (`level.ts`) are untouched; the pure resolver already in `earned-value.ts`
  (`rollupPhysicalPercent`) is unchanged — this change only adds layers around it.

  - **API (`@repo/api`)** — a steps sub-resource following the reference-template layering
    (controller → service → repository, deny-by-default, org-scoped): `GET …/activities/:activityId/steps`
    (list active, seq-ordered) and `PUT …/activities/:activityId/steps` (`{ version, steps: [...] }`
    bulk-replace, Q3) — retained rows updated in place, new ones appended, removed ones soft-deleted, the
    server assigns `seq`, and the parent **activity's** `version` is optimistic-locked (stale ⇒ 409). Reuses
    `activity:update` (a step is activity-write) — no new permission. **N28** (a step `percentComplete`
    outside 0–100 ⇒ 422 `STEP_PERCENT_OUT_OF_RANGE`) and a negative `weight` are DTO-boundary rejects,
    backstopped by DB CHECKs. The EV read (`schedule.service.getEarnedValue` + `loadEarnedValueActivities`)
    loads each activity's active steps into the `PHYSICAL` rollup and reports a plan-level
    **`stepWeightZeroCount`** (N27 — all-zero-weight ⇒ manual fallback, never a divide-by-zero), mirroring
    `costWarningCount`. The soft-delete cascade is wired into `HierarchyLifecycleService` (steps sweep and
    restore with their activity under the same `delete_batch_id`, both directions).
  - **Types (`@repo/types`)** — new `ActivityStep`, `ActivityStepInput`, `ReplaceActivityStepsRequest`;
    `PlanEarnedValue` gains `stepWeightZeroCount`.
  - **Conformance** — the EV adapter reads the fixture's `steps` and attaches them to A4200 / A7100; new
    goldens assert the weighted-mean rollup **A4200 → 35.0005%** (the fixture's own
    `prog_rd_vs_pct_divergence` — steps-physical ≠ its 40% duration-%) and **A7100 → 0%**, a
    steps-present-vs-manual differential (`resultsDiffer`), and the N27 fallback + count. **N28** is
    DTO-tested. The `code_steps` capability tag flips ✅ (33 ✅ / 1 ⚪ — only resource curves remain);
    ADR-0035 gains an **Accepted §33** + N27/N28.
  - **Web (`@repo/web`)** — an `ActivityStepsEditor` (editable name / weight / %-complete rows with
    add/remove/reorder) opened from the activities table row menu behind the new **off-by-default**
    `VITE_ACTIVITY_STEPS` flag, showing the rolled-up physical % and a "steps override the manual %" note,
    wired to the bulk-PUT mutation (TanStack Query).

  Deferred (the last ADR-0044 slice, not in this change): **resource loading curves** (F3), the one
  remaining ⚪ capability row.

### Patch Changes

- Updated dependencies [[`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`272eb42`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/272eb420313809d0867ef81753ae4c705f631005), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`21818b7`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/21818b7af12c16f481d7547d6f9c1d0464a05a2c), [`a763a54`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a763a5488370935dfaa44b6dc68198f2706270a4), [`7b29ccb`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7b29ccb64208a29aed92836dc46bc35cb691a05b), [`7952f5e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7952f5e1c60119ff7ffb31f34908e401dfc2731e), [`816d0a0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/816d0a09f262a1076f1a0aa1cd38b9590d2eec9b), [`62d7a97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/62d7a974d752249fefa31ee7fea7e45e92a3e179), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1), [`afd4690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/afd4690ed6832ff43b4e551e530346bbaaaaec68), [`7074b77`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7074b7703ff1b9bf784676a87c5a692a49741bc6), [`481d063`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/481d063a2c65722901dc8f66d6d08d710a1f88a1)]:
  - @repo/types@0.13.0

## 0.27.0

### Minor Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Plan float & critical scheduling settings (M6-F7), behind `VITE_FLOAT_CRITICAL_SETTINGS` (default off).
  A new `PlanScheduleSettings` block on the plan detail screen adds three controls — **Critical-path
  definition** (Total float / Longest path), **Total-float measure** (Finish / Start / Smallest), and a
  **Make open ends critical** toggle — mirroring the existing recalc-mode / expected-finish pickers
  (optimistic select, live-region announce, read-only summary for non-editors). Each persists as a
  targeted plan PATCH; a later Recalculate applies it to the computed critical path. The engine/API
  behind these options is already live (M6-F2/F3/F4); this exposes them in the UI.

### Patch Changes

- [#89](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/89) [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - TSLD canvas: flag a **same-lane time overlap** (TECH_DEBT #24c). Auto-arrange never packs two
  time-overlapping bars into one lane, but a manual lane drop (drag or `Alt+↑/↓`) could — with no cue.
  A pure `laneOverlapIds` pass now marks both overlapping bars at the mapping seam; the painter draws a
  stacked-squares badge above each (a shape cue, never colour-only — WCAG 1.4.1 — named in the legend),
  and the accessible listbox line speaks "overlaps another activity in its lane". No API/engine change.
- Updated dependencies [[`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a), [`a283c0c`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a283c0c2064e48b531e35cc911be018696275d3a)]:
  - @repo/types@0.12.0

## 0.26.0

### Minor Changes

- [#87](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/87) [`047b08e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/047b08e4bd04a568a7f8bab754386fdfa661740d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable the **advanced schedule constraints** (`VITE_ADVANCED_CONSTRAINTS`, ADR-0035 §7–§11, M4) and
  **per-activity calendar picker** (`VITE_ACTIVITY_CALENDAR`, ADR-0037, M5) by default. The activity
  form's Advanced-scheduling group (secondary constraint, as-late-as-possible, expected-finish), the
  plan-level Expected-finish toggle, the activities-table Conflict badge, and the per-activity Calendar
  select now ship on. Both surfaces' quality gates are cleared (the advanced-constraints editor's
  accessibility/component/UX reviews are green; the activity-calendar picker reuses the reviewed
  plan-calendar picker's primitive and states). No API or engine change — those were already live
  regardless of the flags. Set `VITE_ADVANCED_CONSTRAINTS=false` or `VITE_ACTIVITY_CALENDAR=false` to
  roll either back.

## 0.25.0

### Minor Changes

- [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/82) [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Web activity calendar picker (M5, ADR-0037), behind `VITE_ACTIVITY_CALENDAR` (off by default). The
  activity form gains a **Calendar** `Select` — "Plan default (inherit)" or a specific org calendar —
  writing the activity's `calendarId`; the activities table shows an activity's own calendar when it
  isn't inheriting the plan's. The picker ships dark until its component/accessibility/UX gates are
  cleared; the underlying field, engine, and API are already live, so the flag only governs whether a
  planner can pick a per-activity calendar in the UI. The dialog always seeds `calendarId` from the
  row, so editing with the picker hidden round-trips the stored value unchanged.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Mandatory constraints now **produce-and-flag** instead of being silently parked (M4-F2, ADR-0035 §7).
  `MANDATORY_START`/`MANDATORY_FINISH` still pin their date with the same MSO/MFO arithmetic, but when a
  pin drives an activity earlier than its logic allows the engine now **produces the (impossible)
  schedule as pinned and flags it** — a new engine-owned `constraintViolated` boolean on each activity —
  surfacing the broken relationship as negative float on the predecessor, and never repairing it. A pin
  the network can satisfy is not flagged.

  The schedule summary's dishonest `parkedConstraintCount` is **replaced** by two honest counts:
  `constraintViolationCount` (mandatory pins that broke logic) and `constraintWarningCount` (the N15 case
  — a Start-No-Earlier-Than dated before the data date, honoured but unable to pull work back). The
  recalc response, read summary, and structured recalc log all carry the new counts; the summary strip
  shows "Constraint conflicts" / "Constraint warnings" figures with accessible explanations in place of
  the old "Parked constraints" figure. Plans with no mandatory constraints are byte-identical (the
  golden suite is unchanged) and report both counts as zero.

- [#85](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/85) [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable progress ingestion by default (`VITE_PROGRESS_INGESTION`, ADR-0035 M2).
  The progress editor's remaining-duration + suspend/resume inputs and the
  plan-level recalc-mode picker now ship on; set `VITE_PROGRESS_INGESTION=false` to
  roll back to the percent-plus-actual-dates editor. No API or engine change — those
  were already live regardless of the flag.

- [#84](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/84) [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Progress ingestion web controls (M2, ADR-0035), behind `VITE_PROGRESS_INGESTION`
  (off by default). When enabled:

  - The progress editor gains a **remaining duration** input (blank derives it from
    percent complete) plus **suspend / resume** dates for a paused activity — with
    client-side validation mirroring the API (resume ≥ suspend).
  - Plan settings gain a **recalc mode** picker — Retained Logic / Progress Override
    / Actual Dates — persisted with a targeted PATCH and applied on the next
    recalculation.

  The activity read model now exposes `remainingDurationDays`, `suspendDate`, and
  `resumeDate` (`@repo/types` + the activity response DTO), so the editor seeds and
  round-trips a stored value even with the inputs hidden. The engine, the settable
  API fields, and the plan recalc-mode column were already live; this slice only
  adds the flag-gated authoring UI.

- [#85](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/85) [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface progress-repair warnings and clarify the progress editor (M2 follow-up,
  ADR-0035 §6).

  - The progress endpoint (`PATCH …/activities/:id/progress`) now returns
    `meta.warnings` (a `ProgressWarning[]`) when it repairs a complete activity —
    `COMPLETE_WITHOUT_FINISH` (finish set to the data date) or
    `REMAINING_ON_COMPLETE` (remaining forced to zero). The write still succeeds and
    `data` reflects the corrected value; an ordinary report omits `meta`. Adds a
    reusable single-resource `ResourceEnvelope` for `{ data, meta }` responses.
  - The web progress editor announces those repairs on save, and a note makes clear
    the remaining/suspend/resume fields reschedule the remaining work rather than
    change the derived status.

- [#86](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/86) [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Web advanced-constraints editor (M4, ADR-0035 §7–§11), behind `VITE_ADVANCED_CONSTRAINTS` (off by
  default). The activity form gains an **Advanced scheduling** group — a **secondary constraint**
  (paired type + date, driving the backward pass), an **As-late-as-possible** toggle, and an
  **expected-finish** date — and the plan settings gain an **Expected-finish scheduling** on/off
  toggle (`useExpectedFinishDates`). An engine-flagged `constraintViolated` activity (a mandatory pin
  produced-and-flagged against its logic) surfaces a **Conflict** badge in the activities table's
  Constraint column. The editor ships dark until its component/accessibility/UX gates are cleared; the
  underlying fields, engine passes, and API are already live, so the flag only governs whether a
  planner can edit and see them in the UI. The dialog always seeds the advanced fields from the row,
  so editing with them hidden round-trips a stored value unchanged.

- [#82](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/82) [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-activity working-time calendars (M5, ADR-0037). Each activity can now carry its own
  `calendarId` (create/update/response API + shared `ActivitySummary`) — `null` inherits the plan
  default. The CPM engine moved to an **absolute working-instant** axis so each activity's duration,
  float, and dates are measured on **its own** calendar: a 24/7 commissioning activity inside a 5-day
  plan works across weekends, and a relationship's `PREDECESSOR`/`SUCCESSOR` lag now resolves to the
  endpoint activity's calendar (completing M3's forward-wiring). A plan where every activity inherits
  the plan calendar recalculates **byte-identically** (the golden suite is the parity gate). The
  activity calendar is validated in-org under the calendar advisory lock (like the plan picker), and
  the recalculation resolves each distinct calendar once (O(distinct calendars), not O(activities)).

### Patch Changes

- Updated dependencies [[`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`a4ff745`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a4ff745def49f3ff70b463cd48884c16ad72bedb), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`3111809`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3111809cb46eb8c51848493ff6837dad6f717fbd), [`399afc8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/399afc8893dd2f50441a0a922edf3571961beab8), [`f382196`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/f382196bc0d38fceec1938e8a30f5504389708ec)]:
  - @repo/types@0.11.0

## 0.24.0

### Minor Changes

- [#80](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/80) [`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Per-relationship lag calendars (M3, ADR-0036 §6). Dependencies gain a `lagCalendar`
  field (`PREDECESSOR` / `SUCCESSOR` / `TWENTY_FOUR_HOUR` / `PROJECT_DEFAULT`, default
  `PROJECT_DEFAULT`) exposed on the create/update/response API, with a lag-calendar selector
  on the dependency editor (and a lag-calendar label in the Logic panel's link lists). The CPM
  engine now measures each edge's lag on that calendar: `TWENTY_FOUR_HOUR` schedules the lag as
  **elapsed** time (e.g. concrete cure's `168h` = 7 elapsed days, not 7 working days), while the
  other three coincide with the plan calendar today (Predecessor/Successor become distinct once
  per-activity calendars land in M5). The default path is unchanged — a plan with no 24-Hour
  lag recalculates byte-identically.

### Patch Changes

- Updated dependencies [[`1cdc8b1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1cdc8b1d5ef80ddf6caa94fe90fff6b4c307893e)]:
  - @repo/types@0.10.0

## 0.23.1

### Patch Changes

- [#72](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/72) [`ba3ca38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ba3ca389a107c5accd60d0d43826f4b2fb13bebb) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Two small plan-toolbar fixes: the Auto-arrange lanes control now stays on the bar and greys out in
  View mode (shade-don't-hide), instead of disappearing and reappearing when switching between View and
  Edit — consistent with the other authoring icons. The search / filter field also gets a little more
  spacing from the divider on its left.

## 0.23.0

### Minor Changes

- [#70](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/70) [`ff5ec8d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ff5ec8d214611ef9244732815a5dd29b1fe045d3) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Consolidate the plan toolbar and move the diagram legend onto the canvas (ADR-0031 amendment). The
  Link tool becomes a split-button that mirrors Add — one menu-button that picks the FS/SS/FF kind and
  arms link-mode in a single gesture. Plan details and Edit plan fold into the Row-1 Summary popover
  (status, data date and mode now sit above the schedule strip, with an Edit-plan shortcut), plus a
  quick edit-pencil beside the status pill. Keyboard shortcuts move beside Legend on Row 1 and the
  global `?` key opens them.

  The legend now lives on the canvas: the Legend control toggles a floating, draggable key panel
  overlaid on the diagram that can be positioned anywhere and pinned (its open state and position
  persist), so the key stays visible while reading the plan. Plus polish — the finish chip no longer
  wraps, "Coming soon" tooltips name their button, the zoom controls are more compact, and the search
  field gets a little breathing room.

## 0.22.0

### Minor Changes

- [#68](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/68) [`bb11b7f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bb11b7f3b67bf641e954378934d0f85d425013b5) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Redesign the plan toolbar as two rows split by "look vs change" (ADR-0031 two-row amendment). Row 1
  (Look) carries always-live view/navigate controls — Go-to-date, the zoom cluster, View, the
  Early | Visual scheduling-mode selector, a search/filter field with the find & analyse lenses, and
  right-aligned Finish / Summary / Legend. Row 2 (Do) carries a pen-gated authoring cluster (Add, Link,
  Auto-arrange, notes, Recalculate, Undo/Redo) that shades as one block when you're not editing, beside
  always-live plan & deliverable actions (Baselines, Calendar, Plan details, Edit plan, Export, and
  more). The toolbar no longer changes shape between viewing and editing — controls shade rather than
  disappear — and on a desktop the full labelled command set is visible with no `⋯` overflow.

  Also: the persisted data date leaves the toolbar (set at plan creation, changed via Edit plan;
  Go-to-date stays for navigation); the header collapses to one line (breadcrumb → plan name + status
  pill + pen status) and the redundant read-only banner is removed; the Add menu previews Hammock and
  Level-of-effort under "Span between activities"; and the Gantt/Resource view-mode switch is kept
  reserved (hidden) until a second view exists.

## 0.21.0

### Minor Changes

- [#66](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/66) [`ebb4ff5`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ebb4ff59114578224d2988b392edcd7a9b2d99f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): consolidate the plan toolbar — one zoom dropdown, a stable shape, and future-feature placeholders (ADR-0031 amendment)

  Refines the TSLD plan toolbar so it stops "changing what's visible" as plan/mode state shifts:

  - **One zoom control.** The five scale buttons (Day/Week/Month/Quarter/Year) collapse into a single
    `Zoom: <level> ▾` dropdown. This removes the Frame-group overload that made the width-based
    overflow silently demote Year/Quarter into the `⋯` at common widths.
  - **Shade, don't hide.** Zoom/Fit (and View/Legend/Shortcuts) now stay on the bar from the empty
    canvas onward — the zoom cluster is _disabled with a reason_ until a diagram is computed, rather
    than vanishing. The toolbar's silhouette no longer shifts between planning states.
  - **Future-feature placeholders.** Reserved slots now render as disabled "Coming soon" controls so
    the toolbar reads as fully designed: Undo/Redo inline; and — in the `⋯` overflow — Recenter-on-today,
    Search, Filter, Isolate-logic-path, Next-conflict, Colour-by, Baseline-overlay, Snap-to-grid,
    Resource-view, Add-note, Clear-visual-placement, Export, Print, Share, Comments and Update-progress.
    Full catalogue + how-to-enable in `docs/TOOLBAR_ROADMAP.md`.

  Frontend only, within the existing `VITE_CANVAS_TOOLBAR` surface; the flag-off `TsldViewControls`
  fallback is unchanged. No API/DB/type change.

## 0.20.0

### Minor Changes

- [#65](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/65) [`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling modes — mandatory project start + Visual planning (ADR-0033)

  Delivers ADR-0033's scheduling model. The **mandatory project start (M1)** is a live product
  change; the **Visual-planning surface (M2–M4)** ships behind the default-off `VITE_SCHEDULING_MODES`
  flag until enablement.

  **M1 — Mandatory project start (live):**

  - A plan can no longer exist without a start date. A backfill+NOT-NULL migration sets
    `plans.planned_start` for existing plans (CQ-6 chain: earliest active constraint date → actual
    start → creation day) and makes the column NOT NULL. `CreatePlanDto.plannedStart` is required (422
    without); `UpdatePlanDto` rejects an explicit `null` (the data date can be moved, never cleared).
    The web plan form requires it, and the ADR-0032 "first draw anchors to today" hack is gone.

  **M2–M4 — Visual planning (behind `VITE_SCHEDULING_MODES`):**

  - A plan-level `schedulingMode` (**Early** = computed-earliest CPM, **Visual** = hand-placed) with a
    toolbar mode selector, and a Planner-owned `Activity.visualStart` placement input fed through the
    engine's second, forward-only effective-Visual pass (placements pin the bar and push unplaced
    successors; the pure-network pass still owns early/late/float).
  - A Visual-mode canvas drag hand-places `visualStart` (no implicit SNET constraint); Early mode keeps
    the SNET path. Engine-owned conflict flags surface as an on-canvas warning triangle (shape, not
    colour-only) with a spoken read-out — placements are flagged, never auto-moved.
  - Navigation/data split: a "Go to date" view jump distinct from the persisted "Project start" anchor.
  - A read-only **Late-start overlay** renders bars from the late dates for float analysis (editing
    suppressed while on).

  Flag-off, the TSLD renders exactly as before.

### Patch Changes

- [#62](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/62) [`84ef690`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/84ef69089e06fecd78739a7099dba5da7f741169) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): anchor TSLD dependency lines to the correct edges per relationship type

  Dependency lines on the canvas were always drawn predecessor-finish → successor-start (FS geometry),
  ignoring the tie's actual type. They now attach to the edges the relationship constrains: **FS**
  finish→start, **SS** start→start, **FF** finish→finish, **SF** start→finish. The orthogonal elbow for
  cross-lane links is routed clear of the anchored edges (outside a finish edge, outside a start edge,
  or split for SF) so the line no longer cuts back across a bar. Pure render-model change; the engine
  already scheduled every type correctly — only the drawn line was wrong.

- [#64](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/64) [`c073c75`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/c073c750d7c329286bd3106cb3f5e6dc3501ceb0) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling-modes M0 dark foundations (ADR-0033)

  Additive, behind-the-flag foundations for the scheduling-modes feature — **no user-visible change**
  (nothing sets `visual_start` yet and no UI reads the flag; existing plans recalc identically):

  - **Schema (additive, reversible):** a `SchedulingMode` enum + `Plan.schedulingMode` (default `EARLY`),
    the Planner-owned `Activity.visualStart` placement input, and four engine-owned outputs
    (`visualEffectiveStart/Finish`, `visualConflict`, `visualDriftDays`) modelled like the CPM columns.
  - **Engine:** a second, forward-only _effective-Visual_ CPM pass — honours each `visualStart` exactly,
    pushes successors from the feasible finish, and emits the conflict/drift outputs. The pure
    forward/backward pass is untouched, so `early*`/`late*`/float stay a pure function of the network
    (proven by a golden-parity test).
  - **Recalc wiring:** `visual_start` feeds the engine and the four outputs are persisted by the same
    batched `unnest` UPDATE — still out of the optimistic-lock `version`/`updated_at` path.
  - **Flag:** `SCHEDULING_MODES_ENABLED` (`VITE_SCHEDULING_MODES`, default-off), gated on the canvas host.

  The mandatory-`plannedStart` migration and the UI (mode selector, Visual drag, Late overlay, Go-to-date)
  land in later milestones.

- [#65](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/65) [`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat: scheduling-modes M2 — navigation vs data-edit split (ADR-0033)

  Behind the default-off `VITE_SCHEDULING_MODES` flag — **no user-visible change** until it is enabled.
  De-overloads the single inline TSLD timeline date picker into two clearly-separated controls so that
  "looking at a date" no longer silently re-anchors the schedule (ADR-0033, Sub-feature 1):

  - **Go to date** — a labelled navigation popover that pans the canvas so the chosen date sits at the
    left edge. Pure view state: it issues no request, persists nothing (CQ-1), and is offered to every
    role, read-only viewers included. Backed by a new imperative `goToDate(iso)` on the canvas control
    handle and the pure `panToDate` viewport helper.
  - **Project start** — the persisted schedule anchor (`plannedStart`), now explicitly labelled and kept
    as the pen-gated data control; read-only viewers see it as a static read-out.

  Flag-off, the single "Timeline start" picker renders exactly as before.

- Updated dependencies [[`5e4e1a8`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5e4e1a88b56e6e561102d80129a711ecdcaeec8c)]:
  - @repo/types@0.9.0

## 0.19.0

### Minor Changes

- [#61](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/61) [`1395359`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/1395359c11c160936fe5e931250b38ab8811b78f) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): mount the floating TSLD selection-actions bar (ADR-0031)

  Selecting an activity on the TSLD canvas now shows a small **floating toolbar** just above it with
  its object actions — **Open logic**, **Edit activity**, **Delete activity** — so the common actions
  are where the planner's attention already is, while the main toolbar stays stable (ADR-0031, Fork-2;
  resolves TECH_DEBT #31a — the bar was built + unit-tested but not previously mounted).

  - The bar follows the canvas **imperatively**: the canvas writes the selected activity's live
    viewport anchor to a ref each frame (ADR-0026 D3 — no per-frame React state) and the bar reads it
    on its own `requestAnimationFrame` to reposition, so pan/zoom track without re-rendering the
    toolbar. It flips below the selection when there's no room above, and hides when the selected bar
    scrolls off-screen or the pane is hidden.
  - Mutating actions (Edit / Delete) are **pen-gated as a set** (disabled with a reason) exactly like
    the main toolbar; **Open logic** stays available read-only. Edit/Delete open host-owned dialogs via
    a new shared `ActivityCrudDialogs`, keeping the tsld feature dependency-free (ADR-0026 D8).
  - The redundant **"Set constraint"** action was dropped (it duplicated Edit; there is no dedicated
    quick-constraint editor).

  No other capability changes — Open logic / Edit / Delete remain reachable from the parallel listbox
  and the activities table.

### Patch Changes

- [#59](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/59) [`65da1be`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/65da1be7c8aa9978227434000ec02b897c9a06ff) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - perf(web): pause the TSLD render loop when the canvas is off-screen; a11y + dedup cleanups

  Fast-follow debt paydown on the canvas-first plan workspace (TECH_DEBT [#30](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/30)/[#31](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/31)):

  - **Perf (#30d):** the TSLD canvas now pauses its `requestAnimationFrame` paint/measure work when
    it's off-screen (the below-`md` Activities pane showing, so the diagram pane is `display:none`),
    via an `IntersectionObserver`, and re-arms a repaint the moment it returns — no more painting an
    unseen canvas every frame on mobile.
  - **A11y (#30h):** the docked activities panel's landmark is renamed "Activities panel" so it no
    longer collides with the inner table's "Activities" scroll region (axe `landmark-unique`).
  - **Dedup (#31b/#30b):** the Plan details / Baselines / Calendar dialogs are extracted into one
    shared `PlanChromeDialogs` used by both plan layouts (so their copy can't drift), and the plan
    header's overflow menu adopts the shared `useMenuTrigger` hook.

  No behaviour change beyond the two polish items above.

## 0.18.0

### Minor Changes

- [#58](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/58) [`3e12e97`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/3e12e9757f21eb754ec876fec3a81016b1979334) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan authoring on by default (ADR-0032)

  `VITE_CANVAS_AUTHORING` now defaults **on** (M1–M5 shipped with green a11y/ux/perf/e2e gates). A
  planner builds a plan directly on the TSLD canvas: a blank draw-ready canvas on a new plan, an inline
  timeline start-date, unified auto-recalculation after any structural edit, on-canvas activity types
  (Task + Start/Finish milestone via the Add split-button), and a two-click Link tool in place of
  edge-drag. It requires the toolbar + workspace flags (both default-on); turning either off disables
  authoring too. Set `VITE_CANVAS_AUTHORING=false` to roll back to table-first authoring + edge-drag
  linking, byte-for-byte.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — blank draw-ready canvas (ADR-0032, M0–M1)

  Behind the new `VITE_CANVAS_AUTHORING` flag (default-off; layered on `VITE_CANVAS_TOOLBAR`):

  - **M0:** the flag + ADR-0032 + the flag-on Playwright scaffold (`test:e2e:authoring`).
  - **M1:** a brand-new plan opens on an interactive, **blank draw-ready canvas** — the `TsldPanel`
    render gate is relaxed so the canvas mounts whenever there's a timeline anchor
    (`dataDate = plannedStart ?? today`), not only after a recalculation; uncalculated bars simply
    don't paint. Drawing the first activity on a start-less plan silently pins `plannedStart` to
    today (the canvas anchor) before the create, so the schedule dates stay coherent.

  Flag-off keeps today's table-first behaviour byte-for-byte. Frontend only; no API/DB change.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — inline timeline start-date control (ADR-0032, M2)

  Behind `VITE_CANVAS_AUTHORING`: an inline start-date control in the toolbar's Frame group reads and
  (pen-gated) writes the plan's `plannedStart` — the canvas day-zero origin — so a planner sets/adjusts
  the timeline start next to the canvas instead of opening the Edit-plan dialog. A writer edits it via a
  native date input; a read-only viewer sees the date as a focusable static read-out. Changing it
  re-anchors the timeline. Uses the `useSetPlanStart` targeted PATCH.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — unified auto-recalculate (ADR-0032, M3)

  Behind `VITE_CANVAS_AUTHORING`: after any structural edit — from the canvas **or** the activities
  table — the CPM schedule recalculates automatically, so the canvas plots new/changed rows without a
  manual Recalculate (the original pain of adding via the table). A plan-scoped `usePlanAutoRecalc`
  coalescer (trailing ~500 ms debounce + single-flight) drives it: the workspace model watches the
  activity/dependency count for creates/deletes (any surface) and the canvas edit callbacks `notify()`
  for repositions; the manual Recalculate button becomes a `flush()`. Guarded on role + pen + a start
  date. The recalculate endpoint and ADR-0022's engine-owned batched write are unchanged — only the
  client cadence. Flag-off keeps the per-edit inline recalc byte-for-byte.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — Add split-button + on-canvas milestones (ADR-0032, M4)

  Behind `VITE_CANVAS_AUTHORING` (default-off): the plain "Add activity" toggle becomes an APG
  menu-button **Add split-button** that arms the draw kind — **Task**, **Start milestone**, or
  **Finish milestone** — so planners create milestones directly on the canvas. A milestone draw
  collapses to a zero-duration point at the click; the workspace maps the chosen kind to a
  zero-duration create. While adding, the button reads "Adding {kind}" and offers "Stop adding".

  Flag-off the toolbar keeps the plain Add toggle byte-for-byte. Frontend only; no API/DB change.

- [#56](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/56) [`265d7e2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/265d7e22af2f4d8a3b07a294cb351cebbc6c6b07) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first authoring — two-click Link tool replacing edge-drag (ADR-0032, M5)

  Behind `VITE_CANVAS_AUTHORING` (default-off): a new `'link'` edit mode is the canvas-first way to
  draw dependencies — click a predecessor, then a successor — with the dependency kind (**FS / SS /
  FF**) chosen from a toolbar selector instead of a keyboard chord. The picked predecessor rings on
  the interaction layer while the tool waits for the second click; Escape drops the pick, a second
  Escape leaves the tool. The flag suppresses the edge-handle rubber-band affordance so edge-drag is
  replaced, not duplicated.

  Flag-off the edge-drag linking path (Shift = SS, Alt = FF) is unchanged byte-for-byte. Frontend
  only; no API/DB change.

## 0.17.0

### Minor Changes

- [#54](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/54) [`38d6934`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/38d6934e1478f792398519571863895c1518518d) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-maximal toolbar-hosted plan workspace (ADR-0031)

  Build the future-proof Toolbar architecture and the canvas-maximal chrome reclaim behind the
  `VITE_CANVAS_TOOLBAR` flag (default-off; layered on `VITE_CANVAS_WORKSPACE`):

  - A generic APG `<Toolbar>` primitive + declarative item registry (7-group taxonomy, three
    prominence tiers, responsive overflow, pen-gated authoring group, and non-interactive
    presentational read-outs kept out of the roving-tabindex order).
  - The TSLD command registry — every current canvas control (scale/zoom/fit, view toggles, add
    activity, auto-arrange, recalculate, baselines/calendar/plan-details, legend, summary + a pinned
    Project-finish chip) expressed as registry items over a `ToolbarContext`.
  - A compact pen-status control (replacing the big edit-lock banner card) and a floating
    selection-actions bar, both reusing the ADR-0028 hand-off internals via one shared hook.
  - The toolbar-hosted layout: a slim header + one command toolbar over a full-height **chromeless**
    canvas with the activities panel **collapsed by default**, and a below-`md` Diagram/Activities
    pane switch. Flag-off keeps the ADR-0030 workspace byte-for-byte (`TsldPanel` gains an optional
    controlled `canvasUi` + `chromeless` prop).

  Includes the flag-on Playwright journey and the specialist-review remediation: a shared
  recalculate command (loading + no-start hint restored), memoised toolbar context/UI-state so an
  unrelated re-render no longer churns the toolbar's `ResizeObserver`, one CVA for every toolbar
  control surface, and the accessibility fixes (presentational finish chip, disabled-overflow focus
  ring, popover close-on-blur).

  Frontend only. **ON by default** (`VITE_CANVAS_TOOLBAR`); set it to `false` to fall back to the
  ADR-0030 workspace byte-for-byte (emergency rollback / opt-out). Remaining fast-follows: TECH_DEBT [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/issues/31).

## 0.16.0

### Minor Changes

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): make the canvas-first plan workspace the default plan surface (ADR-0030)

  Flip `VITE_CANVAS_WORKSPACE` **on by default** now that the M5 quality gates are green
  (a11y/ux/perf review findings folded in, the flag-on Playwright journey wired into CI, 538
  unit tests passing). Opening a plan now renders the TSLD canvas as the primary workspace
  surface with the activity table as a draggable, collapsible bottom panel, replacing the legacy
  long stacked plan-detail page. The old page remains as the flag-off fallback — set
  `VITE_CANVAS_WORKSPACE=false` for an emergency rollback. The flag-off Playwright suites are
  pinned to `VITE_CANVAS_WORKSPACE=false` so the legacy fallback stays covered too.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M1 scaffold behind `VITE_CANVAS_WORKSPACE` (ADR-0030)

  Introduces the layout skeleton for opening a plan directly in the app-shell workspace with
  the TSLD canvas as the primary surface (ADR-0030, spec `docs/specs/canvas-first-plan-workspace.md`).
  **Off by default** behind the new `VITE_CANVAS_WORKSPACE` flag — flag-off keeps today's stacked
  plan-detail page byte-for-byte, so this ships dark.

  With the flag on, the plan surface becomes a `PlanWorkspace`: a slim header (plan identity,
  Recalculate, the edit-lock pen banner and schedule summary, with baselines + calendar behind a
  disclosure), the TSLD canvas filling the workspace height (`TsldPanel` gains a `fill` mode), and
  the activity table docked as a bottom panel (static height in M1; a draggable, collapsible
  resizer lands in M2). The route-composed orchestration (queries, gating, TSLD edit callbacks) is
  extracted into a shared `usePlanWorkspaceModel` hook so both the legacy page and the workspace
  render identical behaviour — the flag only chooses the layout.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M2 resizable/collapsible activity panel (ADR-0030)

  With `VITE_CANVAS_WORKSPACE` on, the bottom activity panel can now be **dragged up/down to
  resize** and **collapsed to a handle** (pointer + keyboard), with its height and collapsed state
  persisted. The panel's height is clamped against the live workspace height so the canvas always
  keeps a minimum, and the canvas no longer **jumps/re-fits** while the panel is dragged (the TSLD
  canvas preserves its viewport across a surface resize; explicit Fit and a data-date change still
  re-frame).

  Per the product-owner steer, this extracts a single **orientation-aware resizable-panel
  primitive** — `PanelResizer` (a WAI-ARIA window splitter) + `useResizablePanelPrefs` (clamp +
  persist + reset-on-corrupt) — and **refactors the Project Explorer rail onto it**, so the rail
  (vertical splitter → width) and the activity panel (horizontal splitter → height) share one
  implementation. No behaviour change to the rail. Frontend only; still off by default.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M3 header overflow menu (ADR-0030)

  Consolidate the plan workspace header's lower-frequency chrome — **Edit plan, Baselines,
  Calendar** — into a single "⋯" **overflow menu** (the shared WAI-ARIA APG `Menu` primitive),
  replacing M1's interim `<details>` disclosure. Baselines and Calendar now open in the shared
  modal `Dialog`; Edit plan is shown to writers only. The header stays slim and canvas-first:
  plan identity + Recalculate + the pen banner + the schedule summary. Still off by default
  behind `VITE_CANVAS_WORKSPACE`; frontend only.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): canvas-first plan workspace — M4 responsive single-pane (ADR-0030)

  Make the canvas-first workspace usable on narrow viewports. At/above `md` it keeps the vertical
  split (canvas + drag-resizable activity panel); **below `md` it switches to a Diagram / Activities
  segmented view toggle** showing one pane at a time — the canvas can't usefully share a phone's
  height with a table. Both panes stay mounted and are toggled with `hidden`, so switching preserves
  the canvas viewport and the table scroll. Adds a small reusable `useMediaQuery` hook (structure-
  changing queries only; pure styling stays on Tailwind `md:`/`lg:`). Still off by default behind
  `VITE_CANVAS_WORKSPACE`; frontend only.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): canvas-first plan workspace — M5 review fixes (a11y/perf/ux) (ADR-0030)

  Fold in the blocking findings from the accessibility, UX and performance reviews of the canvas-
  first workspace (still off by default behind `VITE_CANVAS_WORKSPACE`; frontend only):

  - **a11y** — the mobile Diagram/Activities view toggle is now a proper `radiogroup` of two
    `radio`s with roving `tabIndex`, arrow/Home/End keys and a 44px target; on collapse/expand the
    panel moves focus onto the reciprocal control instead of dropping to `<body>`; menu items get a
    visible `focus:` ring (WCAG 1.4.11); a single consolidated pen read-only note replaces the two
    duplicated notes.
  - **perf** — `formatCalendarDate`/`formatTimestamp` reuse module-scope `Intl.DateTimeFormat`
    singletons instead of constructing a formatter per call; the activity listbox descriptions are
    memoized; the panel resizer coalesces pointer moves onto a single `requestAnimationFrame`.
  - **ux** — a "Plan details…" read surface (available to every role) exposes the status/planned-
    start/description the slim header omits; the loading state renders a workspace-shaped skeleton so
    the load→loaded transition doesn't jump; header breadcrumbs restored.

- [#52](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/52) [`e4e6a3b`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/e4e6a3b8c6b750d52e3695fc199dafe44a298b3c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): on-canvas activity labels for the TSLD

  The Time-Scaled Logic Diagram now draws each activity's label
  (`{code} {name} · {n}d`) directly on the canvas, so a planner can read which
  activity each bar is without selecting it — realising the on-canvas text
  ADR-0026 D1 budgeted for. Labels place adaptively (inside a wide-enough bar,
  truncated + ellipsised; beside a short bar or milestone when the lane leaves
  room; suppressed when zoomed too far out), are culled to the visible viewport,
  and are drawn in the Canvas 2D painter (no DOM overlay). A sixth "Labels" view
  toggle (default on) hides them for a denser diagram.

  The visible label and the accessible name build on one shared identity builder
  so they can't disagree (WCAG 2.5.3); inside text uses each fill's paired
  `*-foreground` token for contrast in both themes. Re-verified within the
  ADR-0026 draw budget (p95 3.9ms at 2,000 activities). No backend change.

## 0.15.0

### Minor Changes

- [#47](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/47) [`8cc3a68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8cc3a68d18d2458231089de8f5abf46d6dc817af) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): turn Project Explorer in-tree CRUD on by default

  `VITE_NAV_TREE_CRUD` now defaults **on** — the row context menu (create/rename/
  soft-delete via the ⋯ button, right-click, ContextMenu/Shift+F10 key, and touch
  long-press) and the rail-header "New client" control are live for writers
  (Planner/Org Admin); Contributors/Viewers keep a read-only tree. Adds the flag-on
  Playwright journeys (create client→project→plan from the rail, rename, and
  cascade-delete → Recently Deleted) with an accessibility pass. Set
  `VITE_NAV_TREE_CRUD=false` to fall back to the navigation-only tree.

- [#47](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/47) [`8cc3a68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8cc3a68d18d2458231089de8f5abf46d6dc817af) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - feat(web): in-tree CRUD for the Project Explorer (ADR-0029 Phase 2)

  Planners and Org Admins can create, rename, and soft-delete clients, projects,
  and plans directly from the Project Explorer rail — via a per-row "⋯" button,
  right-click, or the ContextMenu/Shift+F10 key — plus a "New client" control in
  the rail header for the empty-org case. It reuses the existing form dialogs,
  `ConfirmDialog` (with kind-appropriate cascade copy), mutation hooks, optimistic
  locking, and the soft-delete/Recently-Deleted flow; there is no backend change.

  Introduces a hand-rolled, tokenised `Menu`/`MenuItem` design-system primitive
  (WAI-ARIA APG Menu Button — no new dependency) and a shell-layer `NavigatorCrud`
  coordinator that owns the dialogs, so the shared tree emits CRUD intents without a
  `feature → feature` import (an extension within ADR-0029; recorded in
  `docs/DECISIONS.md`). Selection stays a pure projection of the URL, so a new plan
  navigates + reveals while new folders are revealed by expansion.

  Ships behind `VITE_NAV_TREE_CRUD` (off by default) and additionally gated by write
  RBAC, so Contributors/Viewers keep a read-only tree.

### Patch Changes

- [#47](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/47) [`8cc3a68`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8cc3a68d18d2458231089de8f5abf46d6dc817af) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - fix(web): give the public accept-invite page a single `main` landmark

  Promote the invitation-accept card's centered layout into a shared
  `InviteShell` (mirroring `AuthShell`) and route the no-token empty state
  through it, so every branch of the accept-invite flow renders exactly one
  `main` landmark instead of the route and the card each defining their own
  (WCAG 2.2 — 1.3.1 Info and Relationships).

## 0.14.1

### Patch Changes

- [#45](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/45) [`6587054`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/65870545a9a6c2b37d544f4a6ef952d016ea067b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Virtualize the Project Explorer tree (ADR-0029, C2). The flattened visible rows are
  now windowed with `@tanstack/react-virtual`, so the rail stays cheap at org scale
  (hundreds of plans). ARIA `setsize`/`posinset` come from the full model and the
  focused/selected node is always kept rendered, so roving-tabindex keyboard navigation
  and deep-link selection still reach any node even when it is scrolled out of view. No
  visible behaviour change for small trees.

- [#45](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/45) [`6587054`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/65870545a9a6c2b37d544f4a6ef952d016ea067b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Compose the shell's workspace region as a single `<main>` (ADR-0029, M3). The routed
  screens (clients, projects, plans, the plan workspace, members, calendars, baselines,
  recently-deleted, onboarding, and the welcome landing) now render their content into
  the shell's one main region instead of each owning a `<main>` of its own — removing
  per-page landmark duplication so the top bar + rail are truly composed once. Purely
  structural: each view's content and layout are unchanged.

## 0.14.0

### Minor Changes

- [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/43) [`85eb923`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/85eb9238f33c3ac9ddd64af34d76eaaddc9a1e52) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Introduce the persistent **app-shell** foundation (ADR-0029), behind `VITE_NAV_TREE`
  (off by default). The authenticated layout becomes a mounted-once shell — top bar +
  a **Project Explorer** rail + a single workspace region — so navigating between plans
  swaps only the main region and the rail keeps its state. On `lg`+ the rail is pinned,
  **collapsible and resizable** (a keyboard-operable splitter; width/collapsed state
  persisted); below `lg` it is an off-canvas **drawer** opened from the header. With no
  plan selected the workspace shows a neutral **welcome empty-state** ("Select a plan
  from the Project Explorer", plus a getting-started hint for a brand-new org).

  This is the M1 slice: the rail body is a placeholder — the accessible Client → Project
  → Plan tree lands in M2. Flag-off is byte-for-byte today's layout. Adds a reusable
  `Sheet` (off-canvas drawer) primitive on the native `<dialog>`. No API or database
  change.

- [#43](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/43) [`85eb923`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/85eb9238f33c3ac9ddd64af34d76eaaddc9a1e52) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Ship the **Project Explorer** navigator and turn the persistent app-shell **on by
  default** (ADR-0029). The rail now hosts an accessible Client → Project → Plan tree:

  - **Lazy drill-down** — expanding a client loads its projects, a project its plans,
    one query per expanded node (reusing the existing hierarchy reads, so page CRUD
    refreshes the tree for free). Nothing is fetched until you open it.
  - **URL-projected selection + deep-linking** — the open plan is highlighted; landing
    on a plan/project URL auto-reveals and scrolls its ancestor path into view.
  - **Keyboard-first** — a WAI-ARIA `tree` with roving focus and the full APG keymap
    (↑/↓, ←/→ to expand/collapse/move, Home/End, Enter/Space). Per the product
    decision, **client/project rows only expand**; only a **plan** opens on the canvas.
  - The shell (top bar + collapsible/resizable rail, drawer below `lg`, welcome
    landing) is now the default navigation surface; set `VITE_NAV_TREE=false` for the
    previous header-only layout (emergency rollback). No API or database change.

## 0.13.0

### Minor Changes

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Close the "date constraints" loop in the UI. The activity form's constraint
  selector now offers only the **six** kinds the CPM engine honours exactly as
  labelled (`SNET`/`SNLT`/`FNET`/`FNLT`/`MSO`/`MFO`); the two `MANDATORY_*` kinds —
  which the engine silently parks as their moderate equivalents (ADR-0023 §6) — are
  no longer newly selectable, so a planner can't set a constraint that behaves
  differently than it reads. An activity that already carries a parked value keeps it
  as an honest, spelled-out option ("Mandatory start — applied as Must start on") and
  is **never silently changed** on open.

  A set constraint is now visible without opening each row: a text **Constraint**
  column in the activities table (`"SNET · 01 May 2026"`, with the full label as its
  accessible name), a small **pin** on the constrained edge of a bar on the TSLD
  canvas (a shape cue, not colour — with a legend entry and a spoken equivalent in the
  diagram's accessible listbox), and an explanation of the "Parked constraints" figure
  in the schedule summary.

  `@repo/types` gains `SELECTABLE_CONSTRAINT_TYPES` / `PARKED_CONSTRAINT_TYPES` /
  `isParkedConstraintType` (the honoured-as-labelled set, mirroring the engine). No
  API, database, or engine change — the constraint write path, optimistic locking, and
  pen gating are untouched.

- [#41](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/41) [`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make the TSLD canvas read like a time-scaled document. The diagram now has a sticky,
  **adaptive date ruler** across the top (year → month → day bands that re-scale as you
  zoom), **zoom presets** (Day / Week / Month / Quarter / Year) with zoom −/+ alongside
  Fit, a **TODAY** marker, **non-working-day shading** (weekends _and_ the plan
  calendar's holiday exceptions), and five **layer toggles** (day / month / year grid,
  today, non-working) to declutter. All view controls are available whether or not
  you're editing, and every control is a real, labelled, keyboard-operable button or
  checkbox.

  Entirely client-side and within the existing canvas architecture (ADR-0026): the
  ruler is a DOM overlay updated imperatively from the render loop so the viewport
  stays ref-authoritative (no per-frame React state), the new paint layers are culled
  and batched to hold the draw budget, and the accessible parallel listbox is
  unchanged. No API, database, or schedule-engine change.

### Patch Changes

- Updated dependencies [[`32e843f`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/32e843f4136460aa403c26ef45ac4496c82d1f6b)]:
  - @repo/types@0.8.0

## 0.12.0

### Minor Changes

- [#39](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/39) [`8b3e08d`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/8b3e08de1d9ea6e60c77d893762672cafe098a24) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Enable the TSLD on-canvas editing surface and the plan edit-lock "pen" by
  default. The two web flags — `VITE_TSLD_EDITING` (create/move/link/relane on the
  logic diagram) and `VITE_PLAN_EDIT_LOCK` (the single-editor "pen": a Planner takes
  an exclusive lock via **Start editing** before the schedule-editing affordances go
  live, peers see who holds it and can request/take over control) — now **default
  ON**, with `=false` as the rollback/opt-out. This lands now that every
  pre-enablement gate is green: the flag-on Playwright harness, the accessibility
  sign-off, and the manual cross-browser `Alt+←/→` history-suppression sweep
  (Firefox/Safari/Edge).

  The API write-gate `PLAN_EDIT_LOCK_ENFORCED` is unchanged (still **default-off**)
  and remains the single deliberate rollout switch: enable it only once a bundle with
  the pen on is deployed (ADR-0028 §9 ordering) — enabling it ahead of the web bundle
  would 423 the activities-table / dependency / recalculate flows. Until then the pen
  coordinates editors in the UI while the server still accepts writes.

  Read-only consumers are unaffected: the Contributor progress path is never
  pen-gated, and setting `VITE_TSLD_EDITING=false` restores the read-only diagram
  byte-for-byte.

## 0.11.0

### Minor Changes

- [#35](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/35) [`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the plan edit-lock **web "pen" layer** (edit-lock M2, ADR-0028), behind a new
  `VITE_PLAN_EDIT_LOCK` flag (default **off** — ships inert). When enabled, the plan
  screen shows a single **"who holds the pen"** banner: a Planner clicks **Start
  editing** to take an exclusive edit-lock (a background heartbeat keeps it alive,
  released on Stop / navigation / tab-close), and the on-canvas schedule editing
  affordances — the TSLD canvas, activity create/edit/delete, the positions batch,
  the dependency editor, and Recalculate — become live only while holding it.
  Everyone else sees who's editing (and, per their role, can **request control**,
  **take over** once the holder goes idle / a grace window elapses, or — as an Org
  Admin — take over immediately via a confirm); the Contributor progress path and
  plan-metadata edits are never pen-gated. A **423 `LOCKED`** response drops the
  surface to read-only with distinct copy, separate from the 409 "changed elsewhere"
  conflict. With the flag off, nothing polls or changes — current behaviour
  byte-for-byte. Enable `VITE_PLAN_EDIT_LOCK` **before** the backend's
  `PLAN_EDIT_LOCK_ENFORCED` (ADR-0028 §9 rollout ordering).

### Patch Changes

- [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/38) [`bd3b2d1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd3b2d117521090618fa76a4d7163849de661318) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix stale driving-arrow styling on the TSLD canvas after a recalculate. The CPM
  recalculate rewrites each dependency's engine-owned `isDriving` flag, but
  `useRecalculate` only invalidated the schedule summary, activities and baseline
  variance — not the dependency query where `isDriving` lives. So after a
  reposition-in-time or create-activity edit (which recalc but don't otherwise touch
  the dependency cache), the driving-vs-non-driving arrows could render stale until a
  manual refresh. `useRecalculate` now also invalidates the plan's dependency query,
  closing the last gap in TSLD M3 (live critical path + driving arrows).

- [#37](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/37) [`ce59178`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/ce591786a5e3db36db2b5e061eb2fb4941e05a6c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the (flag-gated) TSLD on-canvas editing surface toward enablement — no
  user-visible change, both editing flags remain off by default.

  - **fix(web):** the coalesced keyboard-nudge now flushes a delta queued _behind_ an
    in-flight write on unmount (previously a `!busyRef` guard could silently drop it).
  - **perf(api):** the edit-lock heartbeat resolves the caller's own holder profile
    from the session instead of a `users` query — the common beat issues zero extra
    DB reads.
  - **test:** a flag-on Playwright harness (`test:e2e:edit`, wired into CI) that serves
    the app with the editing flags on and the API enforcing the lock, with pen-gating,
    single-actor pen-lifecycle, and keyboard-edit journeys (the latter automating the
    `Alt+←/→` history-suppression check on Chromium); plus a route-level `plan-detail`
    gating/reposition-seam test. Operators: see
    `docs/runbooks/tsld-editing-enablement.md` for the enablement procedure.

- [#38](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/38) [`bd3b2d1`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/bd3b2d117521090618fa76a4d7163849de661318) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add a client-side link-legality pre-check to the TSLD dependency-draw (flag-gated
  editing, `VITE_TSLD_EDITING`). While drawing a dependency, the hovered target now
  rings by legality — a legal drop rings solid; a self-link, duplicate, or cycle rings
  dashed in the critical colour (colour and dash, not colour alone) — and an illegal
  drop the loaded graph already proves invalid is refused locally with an explanation
  (no round-trip to the server, which stays authoritative). Closes the ADR-0026 D5
  "live legality feedback" follow-up.
- Updated dependencies [[`76b9041`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/76b9041c995eab9ee711082baf74dbd06cdb6263)]:
  - @repo/types@0.7.0

## 0.10.0

### Minor Changes

- [#33](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/33) [`be36f12`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be36f12f653489bad900406ab1b5270bbc9652fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Complete the Time-Scaled Logic Diagram's keyboard **edit** model (M8 M5, slice 5.2; behind
  `VITE_TSLD_EDITING`). Keyboard users can now reposition an activity **in time** — `Alt+← / Alt+→`
  nudges its start one day earlier / later (an SNET constraint that recalculates) — alongside the
  existing `Alt+↑ / ↓` lane move, and press **`n`** to create an activity pre-filled at the focused
  lane and start. A **held** Alt+arrow is now coalesced into a single net write per burst (with an
  optimistic preview) and writes are serialized, so holding a key smoothly moves several lanes/days
  and issues one PATCH at the current version instead of racing several — which also removes the
  self-inflicted "changed elsewhere" conflicts a fast key-repeat used to cause. An `Alt+↑` at the top
  lane now says "Already in the top lane." rather than silently doing nothing. The in-app keyboard
  shortcuts help lists the new edit keys.

- [#33](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/33) [`be36f12`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/be36f12f653489bad900406ab1b5270bbc9652fe) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the Time-Scaled Logic Diagram's keyboard accessibility (M8 M5, slice 5.1 — read; ships with
  editing off). The activity list now supports **driving-first chain navigation** (`[` / `]` jump to
  the predecessor / successor that drives the schedule, so a keyboard user can trace the driving path)
  and an on-demand **logic summary** (`Space` announces how many ties an activity has and which are
  driving) — delivering the driving/critical context without bloating the per-keystroke announcement,
  which additionally now states **total float**. **Focus-follows-viewport** pans the diagram the
  minimum distance to keep the selected bar's focus ring on-screen (WCAG 2.4.7 / 2.4.11), and if the
  selected activity is deleted elsewhere, selection reconciles to the nearest survivor. A **`?`
  keyboard-shortcuts help** sheet (also reachable by button) documents the full keymap in-app.

## 0.9.0

### Minor Changes

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **Auto-arrange lanes** to the Time-Scaled Logic Diagram (M8 M4 4.3, ADR-0026, behind
  `VITE_TSLD_EDITING`). A toolbar action repacks the diagram's activities into the **fewest lanes
  with no time-overlap** using a pure, deterministic greedy first-fit packer, and persists the
  result in one all-or-nothing batch write (no schedule recalculation — it changes only vertical
  layout). Because a bulk reorder can move many bars and isn't undoable yet, it's guarded by a
  confirm dialog; only the activities whose lane actually changes are written (the minimal diff),
  an already-tidy diagram reports "nothing to move", and a concurrent edit is surfaced
  non-destructively (the whole pack is refused, nothing moves).

- [#31](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/31) [`fd8de38`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/fd8de385fe7f84c11359871345470e07f8bbc3f7) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Make on-canvas bar dragging **two-dimensional** in the Time-Scaled Logic Diagram (M8 M4,
  ADR-0026, behind `VITE_TSLD_EDITING`). A body drag now moves an activity **freely in both axes
  at once**: horizontally to a new start day (an SNET constraint that recalculates the schedule —
  the existing M2 move) **and** vertically to a new lane (`laneIndex`, layout only — no recalc).
  Per-axis snapping gives a half-cell dead-zone, so a mostly-horizontal drag won't accidentally
  change lanes (and vice-versa). A drop commits only the axes that actually changed as one
  optimistically-locked write: a lane-only move is the cheap `{ laneIndex, version }` PATCH (no
  recalc); a time move (with or without a lane change) is one PATCH carrying the SNET constraint
  (and the lane) followed by a recalc. Keyboard users get the same reach: **`Alt+↑ / Alt+↓`** on
  the focused activity in the parallel listbox nudges it one lane (WCAG 2.1.1). A stale-version
  conflict is surfaced non-destructively and never re-sent.

## 0.8.0

### Minor Changes

- [#29](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/29) [`5c3fbf4`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5c3fbf47d3e900c3e73f9724713e8e677bcbc7c9) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **live driving arrows** to the Time-Scaled Logic Diagram (M8 M3, ADR-0026).

  The CPM engine now computes, on every recalculate, whether each dependency is **driving** — the
  binding logic tie that sets its successor's early start (CPM/GPM "driver") — and persists it as the
  engine-owned `dependencies.is_driving` (ADR-0022 batched write; never touches `version`/`updated_at`,
  so a recalc stays invisible to optimistic locking). It's exposed as `DependencySummary.isDriving` on
  the dependency API. The flag is derived purely from the forward-pass timing, so computed dates are
  unchanged and the golden CPM suite still holds; an edge with slack, or one whose successor is clamped
  by a constraint above every incoming bound, is non-driving.

  On the TSLD canvas, driving links are now drawn **emphasised** — a heavier solid line — versus a thin
  dashed line for non-driving links, so "which relationships are actually driving the schedule" reads at
  a glance. The weight-plus-dash encoding never relies on colour (WCAG 1.4.1), matching the bar
  criticality cue, and the diagram legend gains **Driving link** / **Non-driving link** entries.

## 0.7.0

### Minor Changes

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add on-canvas **create-by-drag** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind
  the OFF-by-default `VITE_TSLD_EDITING` flag. When enabled for a writer (Planner/Org Admin),
  the diagram gains an **Add activity** tool: drag on the timeline to draw a task (a click or
  sub-day drag makes a 1-day task), then name it in an inline popover — `Enter` creates it,
  `Esc` cancels with nothing persisted. The new activity is placed at the dropped day via an
  SNET constraint and the schedule recalculates authoritatively (no client-side CPM); the drag
  shows an instant ghost on a dedicated interaction layer so feedback never waits on the network.

  Every gesture keeps a keyboard-operable equivalent (the create dialog/table), so nothing is
  pointer-only. With the flag off — the default build — the diagram is byte-for-byte the M1
  read-only surface.

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **dependency-draw** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
  OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags from an activity bar's
  start/finish **edge handle** to another bar to create a logic link: a rubber-band follows the
  pointer, the valid drop target is highlighted, and modifiers pick the type — plain drag is
  **FS**, **Shift** is **SS**, **Alt** is **FF** (the rarer **SF** stays in the dependency
  dialog). On drop the link is created via the existing `POST /dependencies` and the schedule
  recalculates authoritatively. A cycle or duplicate (ADR-0021) is surfaced as a non-destructive
  conflict banner with the engine's reason — nothing is created and the draw is never retried. The
  capability is keyboard-reachable too: pressing **Enter** on a focused activity in the diagram's
  listbox opens its logic editor, so link-draw adds no pointer-only capability (WCAG 2.1.1).
  Editing remains off in the default build.

- [#26](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/26) [`04fc100`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/04fc1003f87d08ad6e617dd8458051f5d3d6fd13) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add **reposition-in-time** to the Time-Scaled Logic Diagram (M8 M2, ADR-0026), behind the
  OFF-by-default `VITE_TSLD_EDITING` flag. In Select mode a writer drags an activity bar's body
  sideways to move it in time: the drag shows an instant ghost of the moved bar, and on drop the
  new start is imposed as an **SNET constraint** via the existing activity update (carrying the
  live `version` for optimistic locking) and the schedule recalculates authoritatively — the
  engine still owns the working-day placement (a bar may settle a day or two off the ghost on a
  non-working day). A press without moving simply selects the bar. If someone else changed the
  plan first, the stale-`version` 409 surfaces as a non-destructive conflict banner and the move
  is not re-sent. Editing remains off in the default build.

## 0.6.0

### Minor Changes

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Show per-activity baseline variance in the activities table (M7 Task D2, ADR-0025).
  When a plan has an active baseline, the plan route fetches the variance read and passes a
  per-activity map into the existing `ActivitiesTable` as an optional prop, which renders
  **Start / Finish / Float variance** columns: "3 d behind" / "2 d ahead" / "On baseline"
  (working days on the plan calendar; float flips the sign so lost float also reads as
  behind), "Added" for an activity created since capture, "Removed" for a baselined activity
  now gone, and "—" when not comparable. A plan-level **roll-up** ("vs. Contract Baseline:
  worst slip 6 d · 3 activities behind · 1 added") sits above the table. Meaning is carried
  by the text, not colour alone (WCAG 2.2); the tone colour only reinforces it. All variance
  UI is absent when there is no active baseline. `features/activities` stays dependency-free — it takes a
  shared `@repo/types` shape and the route composes it from the baselines feature (no
  feature→feature import). A Playwright journey covers capture → active → variance visible
  with an axe check. The stale `ROADMAP.md` is refreshed to reflect the delivered M0–M7
  milestones and the candidate next steps.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the baselines panel to the plan view (M7 Task D1, ADR-0025). A new
  `features/baselines` surfaces a plan's baselines under the Schedule section: name, an
  **Active** badge, when captured, the captured project finish, and the frozen activity
  count. Planners/Org Admins get **Capture baseline** (a dialog that freezes the plan's
  current computed schedule; a duplicate name or a never-calculated plan surface as
  friendly inline messages with a "recalculate first" hint), plus per-row **Activate**
  (exactly one active — activating one deactivates the rest server-side) and **Delete**
  (with a warning when removing the active baseline). Everyone else reads. The shared API
  client gains `apiFetchEnvelope` so the variance read can access the `{ data, meta }`
  roll-up; the `baselineKeys` query keys and hooks (list/detail/variance/capture/activate/
  delete) land here too. Empty/loading/error states and delete confirmation reuse the
  shared DataTable/ConfirmDialog primitives.

- [#24](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/24) [`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Time-Scaled Logic Diagram (TSLD) canvas — read-only (M8, ADR-0026). The plan
  detail's "Logic diagram" section now plots a plan's computed activities on a **Canvas 2D**
  surface: task bars and milestone diamonds positioned by their early dates on a
  time-scaled grid, dependency logic drawn as routed connectors, and the critical /
  near-critical path highlighted — by a fill colour **paired with a solid / dashed outline**
  (and a visible legend) so criticality is never conveyed by colour alone. The view is
  **drag-to-pan, scroll-to-zoom** (cursor-anchored) with a **Fit to plan** control, and
  repaints only dirty frames off a `requestAnimationFrame` loop so an idle diagram costs
  nothing.

  Because a `<canvas>` is opaque to assistive technology, the diagram is `aria-hidden` and
  paired with a **parallel focusable listbox** of the same activities: a keyboard or
  screen-reader user tabs into the diagram, arrows through activities (each announced with its
  dates, lane and criticality) and selects one, which rings it on the canvas — no capability is
  pointer-only (WCAG 2.2). The activities table remains the fuller conforming alternative.
  On-canvas **editing** (create/move/draw logic) arrives in a later release.

### Patch Changes

- Updated dependencies [[`300f386`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/300f38685578f1bc432c9b48051f58bc10c22883)]:
  - @repo/types@0.6.0

## 0.5.1

### Patch Changes

- Updated dependencies [[`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14), [`5756fa0`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/5756fa0932f7b45ba71a3ae30ee20ef996404a14)]:
  - @repo/types@0.5.0

## 0.5.0

### Minor Changes

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the Recalculate action to the plan view (Planner/Org Admin). A `Recalculate`
  button triggers the CPM engine and refetches the schedule summary and activities
  so the computed dates, float and critical-path badges update in place; a plan
  with no start date surfaces a friendly inline prompt (from the API's 422) instead
  of a raw error, and other failures are announced politely. Readers don't see the
  action. Also darkens the `--primary` design token slightly so white-on-primary
  buttons clear the WCAG 2.2 AA 4.5:1 contrast bar (verified by axe) — an app-wide
  accessibility fix the new page surfaced.

- [#20](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/20) [`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Surface the computed CPM schedule in the plan view (read-only). The activities
  table gains early/late start & finish and total-float columns plus a
  critical / near-critical badge (late dates hide first on narrow screens; an
  uncomputed plan shows em dashes). A new schedule summary strip shows the data
  date, project finish, and the activity / critical / near-critical counts, with a
  "not yet calculated" empty state and its own loading/error states. Adds a shared
  `Badge` primitive and `scheduleKeys` / `useScheduleSummary`. The Recalculate
  action is a separate control (next).

### Patch Changes

- Updated dependencies [[`9f614f2`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/9f614f22d9e233fb4783c4c81bc01bb9cc5b398c)]:
  - @repo/types@0.4.0

## 0.4.0

### Minor Changes

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activities table and definition CRUD to the plan-detail screen. A plan now
  lists its activities (code, name, type, duration, progress); Planners and Org
  Admins can add, edit, and soft-delete them from a form dialog that mirrors the API
  rules — the duration field is hidden for milestone types (which have no duration),
  and the constraint date only appears once a constraint type is chosen (the two are
  sent, or cleared, together). The graphical Time-Scaled Logic Diagram will edit
  these on a timeline in a later release.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the activity progress editor with role gating. A "Progress" action on each
  activity row opens a dialog to set percent complete and the actual start/finish
  dates; the resulting status is shown as a live, read-only preview (the API derives
  it). The action is gated on `canReportProgress` (Contributor upward), so a
  Contributor — who cannot edit an activity's definition — can still report progress,
  while Planners and Org Admins see it alongside Edit/Delete. Client-side validation
  mirrors the API (a finish needs a start and cannot precede it).

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add/edit/remove dependencies from the Logic panel. Planners and Org Admins
  (`canManageLogic`) get "Add predecessor"/"Add successor" buttons and per-row
  Edit/Remove: adding picks the other activity from the plan (self excluded),
  chooses a type (FS/SS/FF/SF) and a signed lag; editing changes type/lag with
  optimistic locking; removing confirms first. The API stays the source of truth
  for the acyclic guarantee — a cycle, duplicate, or stale-version rejection is
  surfaced inline. Viewers and Contributors keep the read-only panel.

- [#18](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/18) [`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the read-only Logic panel for activities. Each activity row on the plan-detail
  screen gets a "Logic" action (available to any member) that opens a panel showing
  its **predecessors** (what must finish before it) and **successors** (what it
  drives) — each a table of the other-end activity, dependency type (FS/SS/FF/SF),
  and signed lag. The activities table stays dependency-free: it emits an
  `onOpenLogic` callback and the plan-detail route owns the panel. Add/edit/remove
  affordances land next.

### Patch Changes

- Updated dependencies [[`7a8ebba`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7a8ebba2b1fe336b9d1e0c95ef302da80db840c6)]:
  - @repo/types@0.3.0

## 0.3.1

### Patch Changes

- [#15](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/15) [`509a94e`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/509a94e40935a3ccc171306a68bf64819e7de135) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Fix the post-login redirect bouncing back to the sign-in screen. After a
  successful sign-in/sign-up the session query was only _invalidated_, which does
  not refetch an inactive query, so the `_authed` route guard — which reads the
  session via `ensureQueryData` (cached, no revalidation) — saw the stale
  unauthenticated `null` and redirected straight back to sign-in. The user
  appeared "stuck" and only got in by manually refreshing. The mutations now
  `fetchQuery` the session (awaited) so the cache holds the logged-in user before
  navigation, landing the user in the app (or onboarding) on the first attempt.

## 0.3.0

### Minor Changes

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the web screens to browse and manage clients and projects (E1). New routes
  `/orgs/:orgSlug/clients` (list), `/orgs/:orgSlug/clients/:clientId` (a client's
  projects), and `/orgs/:orgSlug/projects/:projectId` (the plans shell, filled in
  by E2), reachable from a new "Clients" nav item. Each screen has create/edit
  dialogs and a confirm-first soft delete, breadcrumbs, and loading/empty/error/
  not-found states; write affordances are hidden for non-writers (Viewer/
  Contributor) while the API still enforces authorisation. Covered by component
  tests and a Playwright journey (create client → open → create project) with an
  accessibility check.

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the web plans slice (E2): a project's plans table (name → plan detail,
  status, planned start) with create/edit/delete for writers, a plan form with a
  status select and an optional planned-start date (`<input type="date">`, wire
  format `YYYY-MM-DD`), and a plan-detail route (`/orgs/:orgSlug/plans/:planId`)
  showing the plan's metadata plus a region reserved for the future Time-Scaled
  Logic Diagram canvas. The project screen now lists real plans instead of a
  placeholder.

- [#14](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/14) [`34f1604`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/34f160433f80c294f00114ab5c3847aa9ceebd37) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the recycle-bin web slice (E3): a "Recently deleted" screen
  (`/orgs/:orgSlug/recently-deleted`, linked from the org nav for writers) listing
  soft-deleted clients, projects and plans newest-first, each with a Restore
  action. An item whose ancestor is still deleted can't be restored on its own, so
  its row guides the user to restore the parent first (the top-down invariant);
  restoring a client or project brings back everything deleted with it. Restore
  outcomes (and name-collision errors) are announced via the shared live region.

### Patch Changes

- [#13](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/13) [`7c96a33`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/7c96a3335182f90b0628d44f4c4e31b9748fed49) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the hierarchy authorisation and lifecycle foundation: `client|project|plan`
  read/create/update/delete/restore permission codes (read for every member,
  write for Planner + Org Admin), a shared `HierarchyLifecycleService` implementing
  cascade soft-delete + batch restore (one `delete_batch_id` per delete, top-down
  `PARENT_DELETED` invariant, `NAME_TAKEN` on colliding restore), and the
  `ClientSummary`/`ProjectSummary`/`PlanSummary`/`PlanStatus`/`DeletedHierarchyItem`
  cross-boundary types.
- Updated dependencies [[`a3e9e01`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/a3e9e01d4684f945b48cd116374a545d39a7f9bc)]:
  - @repo/types@0.2.2

## 0.2.1

### Patch Changes

- Updated dependencies [[`cfe1d24`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/cfe1d2485ff2d1b8deeaf4328c5691754c91da40)]:
  - @repo/types@0.2.1

## 0.2.0

### Minor Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Land the web application entry point and the authentication walking skeleton:
  Vite + React app shell, design tokens, TanStack Router (code-based) with an
  `_authed` guard, TanStack Query, theme (light/dark/system) with no flash of the
  wrong theme, and accessible sign-in / sign-up forms (React Hook Form + Zod) via
  the Better Auth client. A signed-in user reaches an app shell (header, current
  user, sign-out); unauthenticated visits are redirected to sign-in. Covered by a
  component test and a Playwright journey with an axe accessibility check; CI now
  builds and end-to-end tests the web app.

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add the members management UI and the invitation-accept flow. Each organisation
  gets a Members screen (`/orgs/$orgSlug/members`) with an accessible roster: inline
  role changes (optimistic-lock conflicts surfaced), remove-with-confirm, and an
  Invite dialog that emails a link and shows the copyable accept URL. A public
  `/accept-invite` route previews the invitation and lets the invited user join
  (prompting sign-in as the right account when needed). Adds a header org nav and
  Dialog/Select primitives. Covered by a component test and a two-account
  Playwright journey (invite → accept → join).

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Add organisation onboarding, an org switcher, and organisation-scoped routing.
  A user with no organisations is routed to a create-your-first-organisation
  screen; the header gains an accessible organisation switcher; and the app routes
  under `/orgs/$orgSlug` with the URL as the authoritative active organisation (a
  remembered "last active org" drives the home redirect). Covered by a component
  test and an extended Playwright journey (sign up → onboard → land in the org).

### Patch Changes

- [#2](https://github.com/HuttonHomeHub/SchedulePoint_1/pull/2) [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf) Thanks [@HuttonHomeHub](https://github.com/HuttonHomeHub)! - Harden the invitation-accept flow and fix accessibility gaps found in review.

  API: invitation acceptance now enforces a verified email when
  `AUTH_REQUIRE_EMAIL_VERIFICATION` is on — a single flag that also drives Better
  Auth's `requireEmailVerification`, so the email-match identity check becomes a
  real proof of mailbox ownership the moment the verification-email loop lands
  (default off for the alpha; ADR-0016).

  Web: split the destructive colour into a solid `destructive` (button/chip
  surface) and a readable `destructive-text` for coloured text and state borders,
  so error text, invalid-field borders, and the form error summary meet WCAG AA
  contrast in both themes. The invitation-link field now uses the shared input
  primitive (proper focus ring), and the accept-invite screen announces its
  loading→resolved transitions via a polite live region.

- Updated dependencies [[`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf), [`56a82ca`](https://github.com/HuttonHomeHub/SchedulePoint_1/commit/56a82ca5fe650a70f0792d5b31f66dd964be92bf)]:
  - @repo/types@0.2.0
