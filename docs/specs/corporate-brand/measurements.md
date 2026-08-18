# The corporate palette — measured, not chosen

> Input for the branding epic (the third of three agreed 2026-08-18). **Every value here was
> read from the old Flask app's stylesheets or computed, never matched by eye** — the method
> ADR-0077 M7 used, which is why that milestone caught two WCAG failures a visual copy would
> have reproduced.

## Provenance

`HuttonHomeHub/SchedulePoint` (the pre-rewrite Flask app), `static/css/main.css`. It declares a
real token layer — the product owner's "more polished" impression has a system behind it, and
this application never inherited it.

| Old token               | Value                                                       | Role observed                              |
| ----------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| `--primary-color`       | `#14213D`                                                   | Deep navy. Chrome, headings, structure.    |
| `--secondary-color`     | `#FCA311`                                                   | Orange. **The action colour** — see below. |
| `--tertiary-color`      | `#1F3661`                                                   | Mid navy. Secondary surfaces.              |
| `--light-bg`            | `#F8F9FA`                                                   | Page ground.                               |
| `--border-radius`       | `8px`                                                       |                                            |
| `--box-shadow-sm/md/lg` | `0 2px 4px` / `0 4px 6px` / `0 10px 25px` rgba(0,0,0,.1–.2) | Three-step scale.                          |
| `--transition-speed`    | `0.2s`                                                      |                                            |

## What orange is actually FOR in the old app

Counted across `static/css/*.css`: 18 `color`, 16 `background-color`, 8 `border-color`,
3 `background`, 3 `accent-color`, plus border-shorthand hits in 10 of the 14 stylesheets.

It fills `.action-controls button.primary-action`, `.filter-button.active`, the checked toggle
slider, and the hover state of save/add/edit buttons. **Orange is the action and active-state
colour; navy is the chrome.** That is a measurement, and it reversed the recommendation made
before it was taken — the advice had been "accent only, orange goes brown at 4.5:1", which is
true of orange TEXT and false of an orange FILL.

## Computed contrast (WCAG 2.x relative luminance)

| Pair                         | Ratio       | Verdict               |
| ---------------------------- | ----------- | --------------------- |
| Orange fill + **black** text | **10.39:1** | Passes AA comfortably |
| Orange fill + **navy** text  | **7.90:1**  | Passes AA comfortably |
| Orange **text on navy**      | **7.90:1**  | Passes AA             |
| Navy fill + white text       | **15.97:1** | Passes AA             |
| Navy text on `--light-bg`    | **15.15:1** | Passes AA             |
| Tertiary fill + white text   | **11.94:1** | Passes AA             |
| Orange fill + **white** text | **2.02:1**  | **FAILS**             |
| Orange **text on white**     | **2.02:1**  | **FAILS**             |

**The two failures are the old app's own, and they are not new information here.** ADR-0077 M7
found this exact `2.02:1` in that app's amber focus ring and derived it to 3.01–3.36:1 at the
same hue rather than abandoning the colour. The same treatment applies: keep the hue, move the
lightness until the ratio is lawful. Some of what reads as "polished" is vividness bought with a
contrast failure, and it is fixable without losing the look.

## Decisions taken from this (product owner, 2026-08-18)

1. **Adopt the palette and fix the ratios.** Bind these values to the existing token names.
2. **Orange is the action and active-state colour, with a DARK label on it.** Never orange text
   on a light ground, and never white on orange.
3. Blue/navy remains the chrome. This deepens the current `--brand` navy, which is a visible
   change to every authenticated screen and should be expected rather than discovered.

## Two things to gate rather than hope

- **The canvas palette already assigns meaning to colour** — critical path, near-critical, float
  tails, conflicts (ADR-0026/0054/0056). Orange arriving as an action colour must be checked
  against those, or the diagram starts saying something it does not mean.
- **`styles/token-contrast.test.ts` computes ratios across themes × surface scopes** (ADR-0055).
  Every pair above belongs in it BEFORE the CSS changes, so the failing pairs fail for real
  first. ADR-0083 records the trap: making a value more readable can remove the exemption that
  made its old treatment lawful.
