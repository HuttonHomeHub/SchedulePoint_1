import type { SeedActivity, SeedDependency, SeedSpec } from '@repo/seed';

import { activity, calendar, capabilityPlan, DAY, link } from '../capabilities/builders.js';

/**
 * **The NetPoint reference programme** — a published NetPoint example, transcribed so the product can
 * be compared against the tool it is measured by.
 *
 * The source is PMA Technologies' "Superior Graphical Interface" example: a power-plant programme
 * drawn in NetPoint 4.1 on a half-month time unit, 2015-03 to 2019-02, with a critical path running
 * NTP → Mob → Fab/Del Boiler → Erect Boiler → Fit & Weld Boiler → Hydro → Chem Clean → Steam Blows →
 * Turbine Roll → Test & Start-Up → Turnover Reserve → Guaranteed Commercial Operation. The product
 * owner supplied the picture on 2026-09-23 and asked for it as a plan, "so we have an idea of if our
 * app aligns with NetPoint".
 *
 * ### What was transcribed, and how
 *
 * - **Dates are the picture's, shifted forward exactly twelve years**, so every month/day label
 *   reads as it does in the picture. Twelve rather than eleven because 2016 and 2028 are both leap
 *   years and 2015/2017/2018/2019 map onto non-leap years, so no month-end moves by a day.
 * - **Every bar is PLACED at its drawn start** (`visualStart`). NetPoint is a Graphical Path Method
 *   tool: a bar sits where the planner put it and the gap back to its predecessor is drawn as a
 *   dashed link carrying its float (the blue boxes, in half-months). Since ADR-0148 that is exactly
 *   SchedulePoint's model — the placement is the plan, and the network pass supplies float — so
 *   placing every bar is the faithful reading, not a workaround.
 * - **A seven-day calendar**, because the picture is on calendar time: "Mob 3/1–3/31" is thirty-one
 *   days of duration. A working week would move every bar for a reason the picture does not have.
 * - **Every row is the picture's row** (`laneIndex`), because comparing a layout needs the same
 *   layout. Two half-row activities (Chem Clean, Checkout) take the full row beside them that is free
 *   at their dates; the milestone triangles take the nearest free row to where they are drawn.
 * - **Links are FS with no lag** except the two pairs the picture draws with yellow dots (its key
 *   calls them Start-to-Start and Finish-to-Finish links): Erect Boiler → Fit & Weld Boiler and
 *   Fab/Del CW Pipe → Install Circ Water Pipe, each SS and FF, with the lag the drawn dates imply.
 *
 * ### What was NOT transcribed
 *
 * - **Four milestone triangles have no link in the picture** — First Conc, Intake Water Available,
 *   Energization and DEL AQCS Baghouse — so they have none here. Their dates are read off their
 *   x-position, to the nearest half-month, and are the least certain values in this file.
 * - **Colours are not data.** NetPoint colours a bar red for critical; SchedulePoint derives
 *   criticality from the network, so matching red is a result to check, not an input.
 * - Two spelling slips in the picture ("Asssemble", "Avaliable") are corrected.
 */

/** The picture's calendar time: every day works. */
const NP_CAL = calendar('NP_CAL', 'NetPoint reference seven-day week', [0, 1, 2, 3, 4, 5, 6]);

/** Twelve years, so a picture date keeps its month and day (see the file docblock). */
const YEAR_SHIFT = 12;

function shifted(pictureDate: string): string {
  const [year, month, day] = pictureDate.split('-');
  return `${Number(year) + YEAR_SHIFT}-${month}-${day}`;
}

/** Inclusive calendar days between two picture dates — the duration on a seven-day calendar. */
function spanDays(start: string, finish: string): number {
  const ms = Date.parse(`${finish}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`);
  return ms / 86_400_000 + 1;
}

/** A bar as drawn: its row, its first day and its last day, in the picture's own dates. */
function bar(key: string, name: string, lane: number, start: string, finish: string): SeedActivity {
  return activity(key, {
    name,
    durationMinutes: spanDays(start, finish) * DAY,
    visualStart: shifted(start),
    laneIndex: lane,
  });
}

/** The calendar day after a picture date. */
function nextDay(pictureDate: string): string {
  return new Date(Date.parse(`${pictureDate}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

/**
 * A milestone triangle (or hourglass), placed on the **boundary** the picture draws it on.
 *
 * NetPoint labels a finish milestone with the last day of the work before it ("First Fire 4/30") and
 * draws it on the node where that day ends. SchedulePoint reads a placement as the START of its day
 * (`compute.ts:337-338`), so placing First Fire on 30 Apr would put it a day before the instant its
 * predecessors finish — and the engine would flag it as placed earlier than logic allows. The
 * boundary is the start of the NEXT day, so a finish milestone is placed there. A start milestone
 * (NTP) already names a boundary and is placed on its own date. The consequence worth knowing when
 * comparing the two pictures: where our canvas prints a placed finish milestone's date, it may read
 * one day later than the picture's label for the same point in time.
 */
function milestone(
  key: string,
  name: string,
  lane: number,
  date: string,
  type: 'START_MILESTONE' | 'FINISH_MILESTONE' = 'FINISH_MILESTONE',
): SeedActivity {
  return activity(key, {
    name,
    type,
    durationMinutes: 0,
    visualStart: shifted(type === 'FINISH_MILESTONE' ? nextDay(date) : date),
    laneIndex: lane,
  });
}

/** A chain of FS links, which is how most of the picture reads. */
function chain(...keys: string[]): SeedDependency[] {
  return keys.slice(1).map((key, i) => link(keys[i] as string, key));
}

/**
 * Written with the capability builders, and filed under its own tier: at ~60 activities it is not a
 * capability plan (that tier is capped at fifteen so a person can check one by hand, and the cap is
 * right), and it demonstrates no single feature. It answers a different question — "does our diagram
 * read like the tool we are measured against?" — and is checked against its source picture.
 */
export function netpointReferencePlan(): SeedSpec {
  const spec = capabilityPlan({
    seedName: 'reference-netpoint-power-plant',
    name: 'NetPoint reference: power-plant programme',
    description:
      "PMA's NetPoint power-plant example, transcribed with its own rows and dates (shifted +12 " +
      'years so month/day labels match). Every bar is placed where the picture draws it. Recalculated, ' +
      'the project finishes 28 Feb 2031 and the critical path is NTP, Mob, Fab/Del Boiler, Erect ' +
      'Boiler, Fit & Weld Boiler, Hydro, Chem Clean, Steam Blows, Turbine Roll, Test & Start-Up, ' +
      'Turnover Reserve and Guaranteed Commercial Operation — the chain the picture draws red. No ' +
      'bar is placed earlier than its logic allows, so no visual conflict is flagged.',
    dataDate: shifted('2015-03-01'),
    defaultCalendarKey: NP_CAL.key,
    calendars: [NP_CAL],
    activities: [
      // Row 0 — Electrical & Instrumentation.
      bar('EI_FAB', 'Fab/Del Electrical & Instrumentation', 0, '2016-07-01', '2017-01-31'),
      bar('EI_INST', 'Electrical & Instrumentation Installations', 0, '2017-02-01', '2018-03-31'),

      // Row 1 — Pipe.
      bar('P_FAB', 'Fab/Del Pipe', 1, '2015-04-01', '2016-05-15'),
      bar('P_START', 'Start Pipe', 1, '2016-05-16', '2016-07-31'),
      bar('P_10', 'Pipe 10-30%', 1, '2016-08-01', '2017-01-31'),
      bar('P_31', 'Pipe 31-70%', 1, '2017-02-01', '2017-07-31'),
      bar('P_71', 'Pipe 71-90%', 1, '2017-08-01', '2017-10-31'),
      bar('P_COMP', 'Comp Pipe', 1, '2017-11-01', '2017-12-31'),

      // Row 2 — the boiler's weld-out, and the three triangles drawn above the boiler row.
      milestone('M_FIRST_CONC', 'First Conc', 2, '2015-09-30'),
      milestone('M_TOWER', 'Tower Crane', 2, '2016-02-29'),
      milestone('M_BPP', 'Boiler Pressure Parts', 2, '2016-10-31'),
      bar('B_FW', 'Fit & Weld Boiler', 2, '2016-12-16', '2017-12-31'),
      bar('HYDRO', 'Hydro', 2, '2018-01-01', '2018-02-28'),
      bar('LOOP', 'Loop Checks', 2, '2018-04-01', '2018-04-30'),

      // Row 3 — the boiler, the critical spine.
      bar('B_FAB', 'Fab/Del Boiler', 3, '2015-04-01', '2016-10-31'),
      bar('B_ERECT', 'Erect Boiler', 3, '2016-11-01', '2017-11-30'),
      bar('CHEM', 'Chem Clean', 3, '2018-03-01', '2018-04-30'),

      // Row 4 — steel and the turbine generator. NTP and GCO sit here too: free at their dates.
      milestone('NTP', 'NTP', 4, '2015-03-01', 'START_MILESTONE'),
      bar('S_FAB', 'Shops/Fab/Del First Steel', 4, '2015-04-01', '2016-02-29'),
      bar('S_BOIL', 'Erect Boiler Steel', 4, '2016-03-01', '2016-08-31'),
      bar('S_TURB', 'Erect Turbine Steel', 4, '2016-11-01', '2017-02-28'),
      bar('STG', 'Erect Steam Turbine Generator', 4, '2017-03-01', '2017-10-31'),
      bar('CHECKOUT', 'Checkout', 4, '2017-11-01', '2017-11-30'),
      milestone('M_GCO', 'Guaranteed Commercial Operation', 4, '2019-02-28'),

      // Row 5 — mobilisation and foundations, then the steam blows.
      bar('MOB', 'Mob', 5, '2015-03-01', '2015-03-31'),
      bar('EARTH', 'Mass Earthwork', 5, '2015-04-01', '2015-08-15'),
      bar('B_FDN', 'Boiler Fdns', 5, '2015-08-16', '2016-01-31'),
      bar('T_FDN', 'Turbine Fdns', 5, '2016-04-01', '2016-09-30'),
      milestone('M_DEL_STG', 'DEL STG', 5, '2017-02-28'),
      bar('STEAM', 'Steam Blows', 5, '2018-05-01', '2018-06-30'),

      // Row 6 — the condenser, then the triangles drawn across the middle of the picture.
      bar('C_FAB', 'Fab/Del Condenser', 6, '2015-12-01', '2016-09-30'),
      bar('C_ASM', 'Assemble Condenser', 6, '2016-10-01', '2016-10-31'),
      milestone('M_INTAKE', 'Intake Water Available', 6, '2017-06-30'),
      milestone('M_ENERG', 'Energization', 6, '2017-11-30'),
      milestone('M_FIRST_FIRE', 'First Fire', 6, '2018-04-30'),
      milestone('M_TURB_ROLL', 'Turbine Roll', 6, '2018-06-30'),

      // Row 7 — setting the condenser, then commissioning.
      bar('C_SET', 'Set Condenser', 7, '2016-11-01', '2016-12-31'),
      milestone('M_GAS_PATH', 'Gas Path Comp', 7, '2018-02-28'),
      bar('TEST', 'Test & Start-Up', 7, '2018-07-01', '2018-11-30'),
      bar('TURNOVER', 'Turnover Reserve', 7, '2018-12-01', '2019-02-28'),

      // Rows 8–9 — circulating water.
      bar('CW_FAB', 'Fab/Del CW Pipe', 8, '2015-05-16', '2015-10-15'),
      bar('CW_INST', 'Install Circ Water Pipe', 9, '2015-06-16', '2015-11-15'),
      milestone('M_DEL_AQCS', 'DEL AQCS Baghouse', 9, '2017-02-28'),

      // Row 10 — chimney.
      bar('CH_FDN', 'Chimney Foundation', 10, '2015-11-01', '2016-02-29'),
      bar('CH_ERECT', 'Erect Chimney', 10, '2016-03-01', '2016-12-31'),
      bar('CH_FLUE', 'Flue/Breeching/Duct', 10, '2017-01-01', '2017-10-31'),
      bar('CH_CEMS', 'Install CEMS', 10, '2017-11-01', '2018-01-31'),

      // Row 11 — AQCS.
      bar('AQ_FAB', 'Fab/Del AQCS Equipment', 11, '2015-09-01', '2016-06-30'),
      bar('AQ_STRUCT', 'Erect Structure', 11, '2016-07-01', '2017-01-31'),
      bar('AQ_INST', 'Install Equipment (AQCS)', 11, '2017-02-01', '2018-02-28'),

      // Row 12 — 345 kV switchyard.
      bar('SW_CIVIL', 'Civil', 12, '2016-08-01', '2016-10-31'),
      bar('SW_STEEL', 'Erect Steel (Switchyard)', 12, '2016-11-01', '2017-02-28'),
      bar('SW_EQUIP', 'Set/Connect Equipment', 12, '2017-03-01', '2017-08-31'),
      bar('SW_TEST', 'S/U and Test (Switchyard)', 12, '2017-09-01', '2017-11-30'),

      // Row 13 — coal handling.
      bar('CO_FDN', 'Foundations', 13, '2015-12-01', '2016-07-15'),
      bar('CO_STEEL', 'Erect Steel (Coal Handling)', 13, '2016-07-16', '2017-03-31'),
      bar('CO_EQUIP', 'Install Equipment (Coal Handling)', 13, '2017-04-01', '2017-11-30'),
      bar('CO_TEST', 'S/U and Test (Coal Handling)', 13, '2017-12-01', '2018-02-28'),
    ],
    dependencies: [
      link('NTP', 'MOB'),
      // The vertical spine at 1 Apr 2015: Mob's finish feeds every discipline. The blue float boxes
      // on these links are the gap to a bar placed later, not a lag.
      ...[
        'EI_FAB',
        'P_FAB',
        'B_FAB',
        'S_FAB',
        'EARTH',
        'C_FAB',
        'CW_FAB',
        'CH_FDN',
        'AQ_FAB',
        'SW_CIVIL',
        'CO_FDN',
      ].map((key) => link('MOB', key)),

      ...chain('EI_FAB', 'EI_INST', 'LOOP'),
      ...chain('P_FAB', 'P_START', 'P_10', 'P_31', 'P_71', 'P_COMP', 'CHEM'),

      ...chain('B_FAB', 'B_ERECT'),
      link('M_BPP', 'B_ERECT'),
      link('S_BOIL', 'B_ERECT'),
      // The picture's two yellow dots: Fit & Weld starts 45 days after Erect Boiler starts and
      // finishes 31 days after it finishes.
      link('B_ERECT', 'B_FW', { type: 'SS', lagMinutes: 45 * DAY }),
      link('B_ERECT', 'B_FW', { type: 'FF', lagMinutes: 31 * DAY }),
      ...chain('B_FW', 'HYDRO', 'CHEM', 'STEAM'),
      link('HYDRO', 'LOOP'),
      link('LOOP', 'STEAM'),

      ...chain('S_FAB', 'S_BOIL', 'S_TURB', 'STG', 'CHECKOUT', 'STEAM'),
      link('M_TOWER', 'S_BOIL'),
      link('B_FDN', 'S_BOIL'),
      link('T_FDN', 'S_TURB'),
      link('M_DEL_STG', 'STG'),

      ...chain('EARTH', 'B_FDN', 'T_FDN', 'C_SET'),
      ...chain('C_FAB', 'C_ASM', 'C_SET', 'HYDRO'),

      link('CW_FAB', 'CW_INST', { type: 'SS', lagMinutes: 31 * DAY }),
      link('CW_FAB', 'CW_INST', { type: 'FF', lagMinutes: 31 * DAY }),
      link('CW_INST', 'C_SET'),

      ...chain('CH_FDN', 'CH_ERECT', 'CH_FLUE', 'CH_CEMS', 'M_GAS_PATH'),
      ...chain('AQ_FAB', 'AQ_STRUCT', 'AQ_INST', 'M_FIRST_FIRE'),
      ...chain('SW_CIVIL', 'SW_STEEL', 'SW_EQUIP', 'SW_TEST', 'M_FIRST_FIRE'),
      ...chain('CO_FDN', 'CO_STEEL', 'CO_EQUIP', 'CO_TEST', 'M_FIRST_FIRE'),

      ...chain('M_FIRST_FIRE', 'STEAM', 'M_TURB_ROLL', 'TEST', 'TURNOVER', 'M_GCO'),
    ],
  });
  return { ...spec, tier: 'reference' };
}
