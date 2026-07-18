---
'@repo/web': minor
---

Cost & Earned Value on the web, behind `VITE_EARNED_VALUE` (default off, EV4b / ADR-0042). The plan
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
