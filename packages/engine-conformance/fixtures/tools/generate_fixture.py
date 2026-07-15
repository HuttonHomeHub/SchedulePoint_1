#!/usr/bin/env python3
"""
generate_fixture.py
===================
Builds a deliberately pathological but realistic construction schedule designed to
exercise every feature of a P6-class CPM/PDM scheduling engine.

Project: TT-300 "Unit 300 Amine Regeneration Package - Construction & Commissioning"
Data date: 2026-03-02 08:00   Project start: 2026-01-05   Must Finish By: 2026-12-18

Durations are stored in HOURS (as P6 does). Calendar hours/day differ per calendar,
so hour-storage is the only unambiguous unit.

Outputs:
  p6_torture_test_v1.json   - the fixture
  negative_cases.json       - invalid/hostile data (loops, bad actuals, zero-hour calendar...)
  *.csv                     - flat tables for quick import
"""

import json, os, csv, sys
from collections import defaultdict

OUT = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs"
os.makedirs(OUT, exist_ok=True)

# --------------------------------------------------------------------------
# CALENDARS
# --------------------------------------------------------------------------
UK_HOLIDAYS_2026 = [
    ("2026-01-01", "New Year's Day"),
    ("2026-04-03", "Good Friday"),
    ("2026-04-06", "Easter Monday"),
    ("2026-05-04", "Early May Bank Holiday"),   # NOTE: A5200 has a SNET constraint on this date - deliberate
    ("2026-05-25", "Spring Bank Holiday"),
    ("2026-08-31", "Summer Bank Holiday"),
    ("2026-12-25", "Christmas Day"),
    ("2026-12-28", "Boxing Day (substitute)"),
]
XMAS_SHUTDOWN = {"date_range": ["2026-12-21", "2027-01-01"], "work": [], "note": "Site Christmas shutdown"}

def holiday_exceptions():
    return [{"date": d, "work": [], "note": n} for d, n in UK_HOLIDAYS_2026] + [XMAS_SHUTDOWN]

DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"]

CALENDARS = [
    {
        "id": "CAL-01", "name": "5-Day Day Shift (8h)", "type": "GLOBAL", "is_default": True,
        "hours_per_day": 8, "hours_per_week": 40, "hours_per_month": 172, "hours_per_year": 2000,
        "workweek": {
            "MON": [["08:00", "12:00"], ["13:00", "17:00"]],
            "TUE": [["08:00", "12:00"], ["13:00", "17:00"]],
            "WED": [["08:00", "12:00"], ["13:00", "17:00"]],
            "THU": [["08:00", "12:00"], ["13:00", "17:00"]],
            "FRI": [["08:00", "12:00"], ["13:00", "17:00"]],
            "SAT": [], "SUN": [],
        },
        "exceptions": holiday_exceptions(),
        "test_tags": ["cal_5day", "cal_holidays", "cal_shutdown", "cal_split_shift"],
    },
    {
        "id": "CAL-02", "name": "6-Day Construction (10h, Mon-Sat)", "type": "GLOBAL",
        "hours_per_day": 10, "hours_per_week": 60, "hours_per_month": 258, "hours_per_year": 3000,
        "workweek": {
            "MON": [["07:00", "12:00"], ["12:30", "17:30"]],
            "TUE": [["07:00", "12:00"], ["12:30", "17:30"]],
            "WED": [["07:00", "12:00"], ["12:30", "17:30"]],
            "THU": [["07:00", "12:00"], ["12:30", "17:30"]],
            "FRI": [["07:00", "12:00"], ["12:30", "17:30"]],
            "SAT": [["07:00", "12:00"], ["12:30", "17:30"]],
            "SUN": [],
        },
        "exceptions": holiday_exceptions(),
        "test_tags": ["cal_6day", "cal_holidays", "cal_shutdown"],
    },
    {
        "id": "CAL-03", "name": "7-Day 24-Hour Continuous", "type": "GLOBAL",
        "hours_per_day": 24, "hours_per_week": 168, "hours_per_month": 720, "hours_per_year": 8760,
        "workweek": {d: [["00:00", "24:00"]] for d in DAYS},
        "exceptions": [],
        "test_tags": ["cal_24h", "cal_no_holidays", "elapsed_duration"],
    },
    {
        "id": "CAL-04", "name": "Night Shift (Mon-Fri 20:00-06:00)", "type": "GLOBAL",
        "hours_per_day": 10, "hours_per_week": 50, "hours_per_month": 215, "hours_per_year": 2500,
        # A shift that crosses midnight must be expressed as two work periods on adjacent days.
        "workweek": {
            "MON": [["20:00", "24:00"]],
            "TUE": [["00:00", "06:00"], ["20:00", "24:00"]],
            "WED": [["00:00", "06:00"], ["20:00", "24:00"]],
            "THU": [["00:00", "06:00"], ["20:00", "24:00"]],
            "FRI": [["00:00", "06:00"], ["20:00", "24:00"]],
            "SAT": [["00:00", "06:00"]],
            "SUN": [],
        },
        "exceptions": holiday_exceptions(),
        "test_tags": ["cal_night_crosses_midnight", "cal_asymmetric_week"],
    },
    {
        "id": "CAL-05", "name": "Turnaround Window (12h, 05-Oct to 16-Oct-2026 only)", "type": "GLOBAL",
        "hours_per_day": 12, "hours_per_week": 84, "hours_per_month": 360, "hours_per_year": 0,
        # BASE WEEK IS ENTIRELY NON-WORK. Work exists ONLY via a positive exception.
        # Engines that can only *subtract* exceptions from a base week will fail here.
        "workweek": {d: [] for d in DAYS},
        "exceptions": [
            {"date_range": ["2026-10-05", "2026-10-16"],
             "work": [["06:00", "12:00"], ["12:30", "18:30"]],
             "note": "Turnaround execution window - the ONLY working time on this calendar"}
        ],
        "test_tags": ["cal_window_only", "cal_positive_exception", "cal_empty_base_week"],
    },
    {
        "id": "CAL-06", "name": "Heavy Lift / Weather Window (8h, non-work 01-Nov to 28-Feb)", "type": "GLOBAL",
        "hours_per_day": 8, "hours_per_week": 40, "hours_per_month": 172, "hours_per_year": 1340,
        "workweek": {
            "MON": [["08:00", "16:00"]], "TUE": [["08:00", "16:00"]], "WED": [["08:00", "16:00"]],
            "THU": [["08:00", "16:00"]], "FRI": [["08:00", "16:00"]], "SAT": [], "SUN": [],
        },
        "exceptions": holiday_exceptions() + [
            {"date_range": ["2026-11-01", "2027-02-28"], "work": [],
             "note": "Winter weather embargo - no heavy lift / marine ops"}
        ],
        "test_tags": ["cal_long_nonwork_block", "cal_forces_split"],
    },
    # ---- Resource calendars ----
    {
        "id": "RCAL-CRANE600", "name": "600t Crawler Crane Availability (27-Jul to 21-Aug-2026)",
        "type": "RESOURCE",
        "hours_per_day": 10, "hours_per_week": 60, "hours_per_month": 258, "hours_per_year": 0,
        "workweek": {d: [] for d in DAYS},
        "exceptions": [
            {"date_range": ["2026-07-27", "2026-08-21"],
             "work": [["07:00", "12:00"], ["12:30", "17:30"]],
             "note": "Crane on hire window only"}
        ],
        "test_tags": ["cal_resource", "cal_window_only", "res_calendar_drives"],
    },
    {
        "id": "RCAL-SPECIALIST", "name": "HV Specialist (Mon-Thu, 4-day week, 10h)", "type": "RESOURCE",
        "hours_per_day": 10, "hours_per_week": 40, "hours_per_month": 172, "hours_per_year": 2000,
        "workweek": {
            "MON": [["07:00", "12:00"], ["12:30", "17:30"]],
            "TUE": [["07:00", "12:00"], ["12:30", "17:30"]],
            "WED": [["07:00", "12:00"], ["12:30", "17:30"]],
            "THU": [["07:00", "12:00"], ["12:30", "17:30"]],
            "FRI": [], "SAT": [], "SUN": [],
        },
        "exceptions": holiday_exceptions(),
        "test_tags": ["cal_resource", "cal_4day_week"],
    },
]
CAL_HPD = {c["id"]: c["hours_per_day"] for c in CALENDARS}

# --------------------------------------------------------------------------
# WBS
# --------------------------------------------------------------------------
WBS = [
    ("TT",       None,   "Unit 300 Amine Regeneration Package"),
    ("TT.1",     "TT",   "Project Management & Controls"),
    ("TT.2",     "TT",   "Engineering & Procurement"),
    ("TT.3",     "TT",   "Site Establishment & Enabling"),
    ("TT.4",     "TT",   "CWA-100 Civils & Underground"),
    ("TT.4.1",   "TT.4", "Piling"),
    ("TT.4.2",   "TT.4", "Foundations"),
    ("TT.4.3",   "TT.4", "Underground Services"),
    ("TT.5",     "TT",   "CWA-200 Structural Steel & Pipe Rack"),
    ("TT.6",     "TT",   "CWA-300 Mechanical & Equipment"),
    ("TT.7",     "TT",   "CWA-400 Piping"),
    ("TT.7.1",   "TT.7", "Above-Ground Piping"),
    ("TT.7.2",   "TT.7", "Hydrotest"),
    ("TT.8",     "TT",   "CWA-500 Electrical & Instrumentation"),
    ("TT.9",     "TT",   "CWA-600 Insulation, Fireproofing & Painting"),
    ("TT.10",    "TT",   "Turnaround Tie-ins"),
    ("TT.11",    "TT",   "Pre-Commissioning & Commissioning"),
    ("TT.12",    "TT",   "Handover & Demobilisation"),
]

# --------------------------------------------------------------------------
# ACTIVITY CODES / UDFs
# --------------------------------------------------------------------------
ACTIVITY_CODE_TYPES = [
    {"id": "DISC", "name": "Discipline", "scope": "PROJECT",
     "values": ["PM", "HSE", "CIV", "STL", "MEC", "PIP", "ELE", "INS", "COM"]},
    {"id": "CWA", "name": "Construction Work Area", "scope": "PROJECT",
     "values": ["CWA-100", "CWA-200", "CWA-300", "CWA-400", "CWA-500", "CWA-600", "CWA-TA", "SITE"]},
    {"id": "CWP", "name": "Construction Work Package (AWP)", "scope": "PROJECT",
     "values": ["CWP-1001", "CWP-1002", "CWP-1003", "CWP-1004", "CWP-1005",
                "CWP-1006", "CWP-1007", "CWP-1008", "CWP-1009", "CWP-1010", "N/A"]},
    {"id": "PHASE", "name": "Phase", "scope": "GLOBAL",
     "values": ["ENG", "PROC", "CONST", "PRECOM", "COMM", "HANDOVER"]},
    {"id": "SHIFT", "name": "Shift Pattern", "scope": "PROJECT",
     "values": ["DAY", "NIGHT", "CONTINUOUS", "TA"]},
    {"id": "CONTR", "name": "Contractor", "scope": "PROJECT",
     "values": ["WOOD", "SUB-CIV", "SUB-STL", "SUB-MECH", "SUB-EI", "SUB-INS", "VENDOR"]},
    {"id": "SYS", "name": "Commissioning System", "scope": "PROJECT",
     "values": ["300-01", "300-02", "300-03", "N/A"]},
]

UDF_DEFINITIONS = [
    {"id": "TAG_NO",          "name": "Equipment Tag Number",  "subject": "ACTIVITY", "type": "TEXT"},
    {"id": "WEATHER_SENS",    "name": "Weather Sensitive",     "subject": "ACTIVITY", "type": "BOOLEAN"},
    {"id": "PERMIT_TYPE",     "name": "Permit Type",           "subject": "ACTIVITY", "type": "TEXT"},
    {"id": "SIMOPS_RISK",     "name": "SIMOPS Risk (1-5)",     "subject": "ACTIVITY", "type": "INTEGER"},
    {"id": "EV_METHOD",       "name": "Earned Value Method",   "subject": "ACTIVITY", "type": "TEXT"},
    {"id": "COST_CODE",       "name": "Cost Code",             "subject": "ACTIVITY", "type": "TEXT"},
    {"id": "RFSU_TARGET",     "name": "RFSU Target Date",      "subject": "ACTIVITY", "type": "DATE"},
]

# --------------------------------------------------------------------------
# RESOURCES / ROLES / CURVES
# --------------------------------------------------------------------------
def curve(name, pts, tags=None):
    assert len(pts) == 21, name
    assert abs(sum(pts) - 100.0) < 0.01, (name, sum(pts))
    return {"id": name, "name": name.replace("_", " ").title(), "points": pts, "test_tags": tags or []}

CURVES = [
    curve("LINEAR",        [5.0] + [5.0] * 19 + [0.0]),
    curve("FRONT_LOADED",  [9, 9, 8, 8, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 3, 3, 2, 2, 2, 1, 0]),
    curve("BACK_LOADED",   [0, 1, 2, 2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9]),
    curve("BELL",          [1, 2, 3, 4, 5, 6, 7, 8, 8, 9, 9, 8, 8, 7, 6, 4, 2, 1, 1, 0.5, 0.5]),
    curve("DOUBLE_PEAK",   [2, 5, 8, 9, 7, 4, 2, 1, 1, 2, 3, 2, 1, 2, 4, 7, 9, 10, 8, 5, 8]),
]

RESOURCES = [
    # id, name, type, max_units, price_per_unit, uom, calendar
    ("LAB-SUP",     "Supervisor",              "LABOUR",     6,   62.0, "h",   "CAL-01"),
    ("LAB-QA",      "QA/QC Inspector",         "LABOUR",     4,   55.0, "h",   "CAL-01"),
    ("LAB-CIVIL",   "Civil Operative",         "LABOUR",    30,   38.0, "h",   "CAL-02"),
    ("LAB-STEEL",   "Steel Erector",           "LABOUR",    18,   46.0, "h",   "CAL-02"),
    ("LAB-PIPE",    "Pipefitter",              "LABOUR",    24,   48.0, "h",   "CAL-02"),
    ("LAB-WELD",    "Coded Welder",            "LABOUR",    12,   58.0, "h",   "CAL-02"),
    ("LAB-EI",      "E&I Technician",          "LABOUR",    16,   52.0, "h",   "CAL-02"),
    ("LAB-EI-SPEC", "HV Specialist",           "LABOUR",     3,   95.0, "h",   "RCAL-SPECIALIST"),
    ("LAB-INS",     "Insulator",               "LABOUR",    10,   41.0, "h",   "CAL-02"),
    ("LAB-PAINT",   "Painter / Blaster",       "LABOUR",     8,   39.0, "h",   "CAL-02"),
    ("LAB-SCAF",    "Scaffolder",              "LABOUR",    12,   44.0, "h",   "CAL-02"),
    ("LAB-COMM",    "Commissioning Technician","LABOUR",     8,   68.0, "h",   "CAL-03"),
    ("NL-CRANE600", "600t Crawler Crane",      "NONLABOUR",  1,  340.0, "h",   "RCAL-CRANE600"),
    ("NL-CRANE200", "200t Crawler Crane",      "NONLABOUR",  2,  180.0, "h",   "CAL-02"),
    ("NL-MEWP",     "MEWP / Cherry Picker",    "NONLABOUR",  6,   22.0, "h",   "CAL-02"),
    ("NL-WELDSET",  "Welding Set",             "NONLABOUR", 12,    9.0, "h",   "CAL-02"),
    ("NL-HYDROPUMP","Hydrotest Pump Unit",     "NONLABOUR",  1,   75.0, "h",   "CAL-02"),
    ("NL-EXCAV",    "30t Excavator",           "NONLABOUR",  4,   65.0, "h",   "CAL-02"),
    ("MAT-CONC",    "Ready-mix Concrete",      "MATERIAL",  None,145.0, "m3",  "CAL-03"),
    ("MAT-STEEL",   "Structural Steel",        "MATERIAL",  None,2150.0,"te",  "CAL-03"),
    ("MAT-SPOOL",   "Pipe Spools",             "MATERIAL",  None, 780.0,"ea",  "CAL-03"),
    ("MAT-CABLE",   "Cable",                   "MATERIAL",  None,  14.0,"m",   "CAL-03"),
]

ROLES = [
    ("ROLE-SE",  "Steel Erector", ["LAB-STEEL"]),
    ("ROLE-PF",  "Pipefitter",    ["LAB-PIPE"]),
    ("ROLE-WD",  "Welder",        ["LAB-WELD"]),
    ("ROLE-EIT", "E&I Technician",["LAB-EI", "LAB-EI-SPEC"]),
]

# --------------------------------------------------------------------------
# ACTIVITIES
# --------------------------------------------------------------------------
ACTS = []

def A(id, name, wbs, atype, cal, dur_h,
      dtype="FIXED_DURATION_AND_UNITS_TIME", pct="DURATION",
      status="NOT_STARTED", asd=None, afd=None, rd=None,
      dpct=0.0, ppct=0.0, upct=0.0,
      con=None, con2=None, expfin=None,
      susp=None, resume=None,
      ext_es=None, ext_lf=None,
      codes=None, udfs=None, tags=None, note=None):
    if rd is None:
        rd = 0.0 if status == "COMPLETED" else float(dur_h)
    ACTS.append({
        "id": id, "name": name, "wbs": wbs,
        "activity_type": atype,
        "calendar": cal,
        "original_duration_h": float(dur_h),
        "original_duration_days_display": round(float(dur_h) / CAL_HPD[cal], 2) if CAL_HPD[cal] else None,
        "remaining_duration_h": float(rd),
        "duration_type": dtype,
        "percent_complete_type": pct,
        "status": status,
        "actual_start": asd, "actual_finish": afd,
        "suspend_date": susp, "resume_date": resume,
        "duration_percent_complete": dpct,
        "physical_percent_complete": ppct,
        "units_percent_complete": upct,
        "primary_constraint": con,          # {"type":..., "date":...}
        "secondary_constraint": con2,
        "expected_finish": expfin,
        "external_early_start": ext_es,
        "external_late_finish": ext_lf,
        "activity_codes": codes or {},
        "udfs": udfs or {},
        "test_tags": tags or [],
        "note": note,
    })

def C(t, d):  # constraint helper
    return {"type": t, "date": d}

# ---- TT.1 Project Management & Controls -------------------------------------
A("A1000", "Notice to Proceed", "TT.1", "START_MILESTONE", "CAL-01", 0,
  status="COMPLETED", asd="2026-01-05T08:00:00", afd="2026-01-05T08:00:00", dpct=100,
  con=C("START_ON_OR_AFTER", "2026-01-05T08:00:00"),
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD", "SYS": "N/A"},
  tags=["type_start_ms", "con_snet", "prog_complete"])

A("A1010", "Construction Management & Supervision", "TT.1", "LEVEL_OF_EFFORT", "CAL-01", 0,
  status="IN_PROGRESS", asd="2026-01-05T08:00:00", dpct=18,
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD"},
  tags=["type_loe", "loe_spans_project"],
  note="LOE: duration is DERIVED from its SS predecessor and FF successor. Must never drive logic and must never be critical.")

A("A1020", "QA/QC Surveillance", "TT.1", "LEVEL_OF_EFFORT", "CAL-01", 0,
  status="IN_PROGRESS", asd="2026-01-26T08:00:00", dpct=15,
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD"},
  tags=["type_loe"])

A("A1030", "HSE Management & Permit Control", "TT.1", "LEVEL_OF_EFFORT", "CAL-02", 0,
  status="IN_PROGRESS", asd="2026-01-05T07:00:00", dpct=16,
  codes={"DISC": "HSE", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD"},
  tags=["type_loe", "loe_different_calendar_to_span_ends"],
  note="LOE on CAL-02 spanning activities on CAL-01/CAL-03 - tests LOE duration derivation across calendars.")

A("A1040", "Project Controls & Reporting", "TT.1", "LEVEL_OF_EFFORT", "CAL-01", 0,
  status="IN_PROGRESS", asd="2026-01-05T08:00:00", dpct=18,
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD"},
  tags=["type_loe"])

A("W4000", "CWA-100 Civils (WBS Summary)", "TT.4", "WBS_SUMMARY", "CAL-02", 0,
  codes={"DISC": "CIV", "CWA": "CWA-100"},
  tags=["type_wbs_summary"],
  note="Dates derived from earliest start / latest finish of all activities in WBS TT.4 and below. No relationships.")
A("W5000", "CWA-200 Steelwork (WBS Summary)", "TT.5", "WBS_SUMMARY", "CAL-02", 0,
  codes={"DISC": "STL", "CWA": "CWA-200"}, tags=["type_wbs_summary"])
A("W7000", "CWA-400 Piping (WBS Summary)", "TT.7", "WBS_SUMMARY", "CAL-02", 0,
  codes={"DISC": "PIP", "CWA": "CWA-400"}, tags=["type_wbs_summary"])

# ---- TT.2 Engineering & Procurement ----------------------------------------
A("A2000", "Site Access Granted (Contract Milestone)", "TT.2", "START_MILESTONE", "CAL-01", 0,
  status="COMPLETED", asd="2026-01-19T08:00:00", afd="2026-01-19T08:00:00", dpct=100,
  con=C("START_ON", "2026-01-19T08:00:00"),
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD"},
  tags=["con_start_on", "type_start_ms"],
  note="START_ON pins BOTH early and late start. Engine must not allow the forward pass to move it later, nor the backward pass earlier.")

A("A2100", "IFC Civil Drawings Received", "TT.2", "FINISH_MILESTONE", "CAL-01", 0,
  status="COMPLETED", asd="2026-01-16T17:00:00", afd="2026-01-16T17:00:00", dpct=100,
  codes={"DISC": "CIV", "PHASE": "ENG", "CONTR": "WOOD"},
  tags=["net_open_start", "type_finish_ms"],
  note="OPEN START: no predecessor. DCMA 14-point check should flag this.")

A("A2110", "IFC Structural Drawings Received", "TT.2", "FINISH_MILESTONE", "CAL-01", 0,
  status="COMPLETED", asd="2026-01-30T17:00:00", afd="2026-01-30T17:00:00", dpct=100,
  codes={"DISC": "STL", "PHASE": "ENG"}, tags=["type_finish_ms"])

A("A2120", "IFC Piping Isometrics Rev 0", "TT.2", "FINISH_MILESTONE", "CAL-01", 0,
  ext_es="2026-04-13T08:00:00",
  codes={"DISC": "PIP", "PHASE": "ENG"},
  tags=["net_external_early_start", "interproject"],
  note="External early start from the Engineering project. With 'Ignore relationships to/from other projects' = TRUE this must be dropped.")

A("A2200", "Absorber Column T-301 Delivered to Site", "TT.2", "FINISH_MILESTONE", "CAL-03", 0,
  ext_es="2026-07-27T06:00:00",
  codes={"DISC": "MEC", "PHASE": "PROC", "CONTR": "VENDOR"},
  udfs={"TAG_NO": "T-301"}, tags=["net_external_early_start", "net_external_open_start"])

A("A2210", "Module PAU-301 Delivered to Site", "TT.2", "FINISH_MILESTONE", "CAL-03", 0,
  ext_es="2026-07-20T06:00:00",
  codes={"DISC": "MEC", "PHASE": "PROC", "CONTR": "VENDOR"},
  udfs={"TAG_NO": "PAU-301"}, tags=["net_external_early_start", "net_external_open_start"])

A("A2220", "Amine Pumps P-301A/B Delivered", "TT.2", "FINISH_MILESTONE", "CAL-01", 0,
  ext_es="2026-06-15T08:00:00",
  codes={"DISC": "MEC", "PHASE": "PROC", "CONTR": "VENDOR"},
  udfs={"TAG_NO": "P-301A/B"}, tags=["net_external_early_start", "net_external_open_start"])

A("A2230", "HV Switchgear Delivered", "TT.2", "FINISH_MILESTONE", "CAL-03", 0,
  ext_es="2026-08-10T06:00:00",
  codes={"DISC": "ELE", "PHASE": "PROC", "CONTR": "VENDOR"},
  tags=["net_external_early_start", "net_external_open_start"])

A("A2300", "Structural Steel Batch 1 Delivered", "TT.2", "TASK_DEPENDENT", "CAL-01", 40,
  status="COMPLETED", asd="2026-02-09T08:00:00", afd="2026-02-13T17:00:00", dpct=100,
  codes={"DISC": "STL", "PHASE": "PROC", "CONTR": "VENDOR"}, tags=["prog_complete"])

A("A2310", "Structural Steel Batch 2 Delivered", "TT.2", "TASK_DEPENDENT", "CAL-01", 40,
  codes={"DISC": "STL", "PHASE": "PROC", "CONTR": "VENDOR"})

A("A2320", "Pipe Spools Batch 1 Delivered", "TT.2", "TASK_DEPENDENT", "CAL-01", 80,
  codes={"DISC": "PIP", "PHASE": "PROC", "CONTR": "VENDOR"})

A("A2330", "Pipe Spools Batch 2 Delivered", "TT.2", "TASK_DEPENDENT", "CAL-01", 80,
  codes={"DISC": "PIP", "PHASE": "PROC", "CONTR": "VENDOR"})

# ---- TT.3 Site Establishment ------------------------------------------------
A("A3000", "Mobilise to Site", "TT.3", "TASK_DEPENDENT", "CAL-01", 40,
  status="COMPLETED", asd="2026-01-05T08:00:00", afd="2026-01-09T17:00:00", dpct=100,
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD"}, tags=["prog_complete"])

A("A3010", "Site Establishment & Welfare", "TT.3", "TASK_DEPENDENT", "CAL-02", 100,
  dtype="FIXED_DURATION_AND_UNITS",
  status="COMPLETED", asd="2026-01-19T07:00:00", afd="2026-01-31T17:30:00", dpct=100,
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "CONST", "CONTR": "WOOD"},
  tags=["prog_complete", "dt_fixed_dur_units", "cost_expense"])

A("A3020", "Site Hoarding & Security", "TT.3", "TASK_DEPENDENT", "CAL-02", 60,
  status="COMPLETED", asd="2026-01-12T07:00:00", afd="2026-01-19T17:30:00", dpct=100,
  codes={"DISC": "CIV", "CWA": "SITE", "PHASE": "CONST", "CONTR": "SUB-CIV"}, tags=["prog_complete"])

A("A3030", "Temporary Power Installation", "TT.3", "TASK_DEPENDENT", "CAL-02", 80,
  status="COMPLETED", asd="2026-02-02T07:00:00", afd="2026-02-11T17:30:00", dpct=100,
  codes={"DISC": "ELE", "CWA": "SITE", "PHASE": "CONST", "CONTR": "SUB-EI"}, tags=["prog_complete"])

A("A3040", "Access Roads & Laydown (Temporary)", "TT.3", "TASK_DEPENDENT", "CAL-02", 120,
  status="IN_PROGRESS", asd="2026-01-26T07:00:00", afd=None, rd=0.0, dpct=100,
  codes={"DISC": "CIV", "CWA": "SITE", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  tags=["prog_stopped_zero_remaining"],
  note="STOPPED ACTIVITY: Remaining Duration = 0, Duration % = 100, but NO Actual Finish. "
       "P6 sets the Remaining Early Finish to the Data Date. Naive engines produce a null/instant finish or crash.")

A("A3100", "Scaffolding - Erect / Maintain / Dismantle", "TT.3", "LEVEL_OF_EFFORT", "CAL-02", 0,
  codes={"DISC": "CIV", "CWA": "SITE", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  tags=["type_loe"])

A("A3800", "Temporary Power Supply - Final Period of Operation", "TT.3", "TASK_DEPENDENT", "CAL-03", 240,
  codes={"DISC": "ELE", "CWA": "SITE", "PHASE": "CONST", "CONTR": "SUB-EI"},
  tags=["rel_sf", "lag_zero", "sf_only_predecessor"],
  note="Its ONLY predecessor is an SF (A8700 Energise Permanent Power). Temp power cannot FINISH until "
       "permanent power STARTS. Forward pass must set EF from the predecessor's ES, then back-calculate ES = EF - RD.")

A("A3900", "Temporary Facilities Removal & Site Clean", "TT.3", "TASK_DEPENDENT", "CAL-02", 100,
  con=C("FINISH_ON_OR_AFTER", "2026-11-30T17:30:00"),
  codes={"DISC": "PM", "CWA": "SITE", "PHASE": "HANDOVER", "CONTR": "WOOD"},
  tags=["con_fnet", "net_open_finish"],
  note="FNET pushes the activity LATER (a rare forward-pass-delaying constraint). Also has NO SUCCESSOR (open end).")

# ---- TT.4 Civils ------------------------------------------------------------
A("A4100", "Site Clearance & Earthworks", "TT.4", "TASK_DEPENDENT", "CAL-02", 150,
  status="COMPLETED", asd="2026-01-26T07:00:00", afd="2026-02-13T17:30:00", dpct=100,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1001", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  udfs={"WEATHER_SENS": True, "PERMIT_TYPE": "EXCAVATION", "COST_CODE": "C-1100"},
  tags=["prog_complete"])

A("A4110", "Ground Improvement / Piling Mat", "TT.4", "TASK_DEPENDENT", "CAL-02", 80,
  status="COMPLETED", asd="2026-02-02T07:00:00", afd="2026-02-13T17:30:00", dpct=100,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1001", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  tags=["prog_complete"])

A("A4200", "Piling - Zone A", "TT.4.1", "TASK_DEPENDENT", "CAL-02", 200,
  pct="PHYSICAL", status="IN_PROGRESS", asd="2026-02-16T07:00:00", rd=120.0,
  dpct=40.0, ppct=35.0,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1001", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  udfs={"WEATHER_SENS": True, "EV_METHOD": "PHYSICAL_STEPS", "COST_CODE": "C-1110"},
  tags=["prog_in_progress", "pct_physical", "code_steps", "prog_rd_vs_pct_divergence"],
  note="OD 200h, RD 120h -> Duration%% = (200-120)/200 = 40%%. Actual Duration (elapsed to DD on CAL-02) = 120h, "
       "so At-Completion Duration = 240h (40h over). Physical %% (35, from weighted STEPS) deliberately != Duration %% (40). "
       "Tests that EV uses the nominated %% type, not whichever is convenient.")

A("A4210", "Piling - Zone B", "TT.4.1", "TASK_DEPENDENT", "CAL-02", 180,
  status="IN_PROGRESS", asd="2026-02-23T07:00:00", rd=150.0, dpct=17.0,
  susp="2026-02-27T17:30:00", resume=None,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1002", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  tags=["prog_suspended_no_resume"],
  note="SUSPENDED and NOT resumed at the data date. Remaining work must be scheduled from the Data Date (or later), "
       "and the suspended window must be excluded from Actual Duration.")

A("A4220", "Pile Integrity Testing", "TT.4.1", "TASK_DEPENDENT", "CAL-01", 40,
  status="IN_PROGRESS", asd="2026-02-25T08:00:00", rd=24.0, dpct=40.0,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1001", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  tags=["prog_out_of_sequence", "retained_logic_vs_progress_override"],
  note="OUT OF SEQUENCE: has an FS predecessor (A4200) that is only 40%% complete, yet this activity has already started. "
       "RETAINED LOGIC: remaining work waits for A4200's remaining finish. "
       "PROGRESS OVERRIDE: remaining work starts at the Data Date, ignoring the incomplete predecessor. "
       "ACTUAL DATES: as Retained Logic but actuals are never moved. THREE DIFFERENT ANSWERS - this is the single "
       "highest-value activity in the fixture.")

A("A4230", "Pile Cropping", "TT.4.1", "TASK_DEPENDENT", "CAL-02", 120,
  status="IN_PROGRESS", asd="2026-02-17T07:00:00", rd=60.0, dpct=50.0,
  susp="2026-02-19T17:30:00", resume="2026-03-09T07:00:00",
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1001", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  tags=["prog_suspend_resume", "prog_resume_after_data_date"],
  note="Suspend BEFORE the data date, Resume AFTER it. Remaining work must not be scheduled before 2026-03-09 even "
       "though the Data Date is 2026-03-02. Confirm your engine's rule (and P6's) - behaviour here is a common divergence point.")

A("A4300", "Excavate Foundations - Zone A", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 100,
  con=C("START_ON_OR_AFTER", "2026-03-16T07:00:00"),
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1003", "PHASE": "CONST", "CONTR": "SUB-CIV"},
  udfs={"PERMIT_TYPE": "EXCAVATION", "SIMOPS_RISK": 3},
  tags=["con_snet"])

A("A4310", "Blinding Concrete - Zone A", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 30,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1003", "CONTR": "SUB-CIV"})

A("A4320", "Rebar & Formwork - Zone A", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 120,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1003", "CONTR": "SUB-CIV"})

A("A4330", "Pour Foundations - Zone A", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 40,
  dtype="FIXED_UNITS",
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1003", "CONTR": "SUB-CIV"},
  tags=["dt_fixed_units", "res_material"],
  note="FIXED UNITS: 850 m3 of concrete is invariant. If duration changes, units/time must flex - units must not.")

A("A4340", "Concrete Cure - Zone A", "TT.4.2", "TASK_DEPENDENT", "CAL-03", 168,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1003", "SHIFT": "CONTINUOUS"},
  tags=["cal_24h", "elapsed_duration"],
  note="Cure modelled as an ACTIVITY on the 24-hour calendar: 168h = 7 elapsed days. "
       "Compare with A4440, where the same cure is modelled as a LAG instead.")

A("A4350", "Strip Formwork - Zone A", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 40,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1003", "CONTR": "SUB-CIV"})

A("A4360", "Backfill - Zone A", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1003", "CONTR": "SUB-CIV"},
  tags=["lag_fs_negative"])

A("A4400", "Excavate Foundations - Zone B", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 100,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1004", "CONTR": "SUB-CIV"},
  tags=["lag_ff_positive"])

A("A4410", "Blinding Concrete - Zone B", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 30,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1004", "CONTR": "SUB-CIV"})

A("A4420", "Rebar & Formwork - Zone B", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 120,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1004", "CONTR": "SUB-CIV"})

A("A4430", "Pour Foundations - Zone B", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 40,
  dtype="FIXED_UNITS",
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1004", "CONTR": "SUB-CIV"},
  tags=["dt_fixed_units", "res_material"])

A("A4440", "Strip Formwork - Zone B", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 40,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1004", "CONTR": "SUB-CIV"},
  tags=["lag_calendar_24h", "lag_calendar_setting_sensitive"],
  note="Cure modelled as an FS + 168h LAG on the 24-HOUR calendar (not the predecessor's CAL-02). "
       "If your engine resolves the lag on CAL-02 (10h/day, no Sundays) it will produce a date roughly two weeks "
       "later than the correct 7 elapsed days. This is THE classic P6 lag-calendar bug.")

A("A4450", "Backfill - Zone B", "TT.4.2", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1004", "CONTR": "SUB-CIV"})

A("A4500", "Underground Piping & Drainage", "TT.4.3", "TASK_DEPENDENT", "CAL-02", 160,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1005", "CONTR": "SUB-CIV"},
  tags=["net_multiple_predecessors"])

A("A4510", "Underground Electrical Ducts", "TT.4.3", "TASK_DEPENDENT", "CAL-02", 120,
  codes={"DISC": "ELE", "CWA": "CWA-100", "CWP": "CWP-1005", "CONTR": "SUB-EI"},
  tags=["lag_ss_zero"])

A("A4520", "Cathodic Protection Installation", "TT.4.3", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "ELE", "CWA": "CWA-100", "CWP": "CWP-1005", "CONTR": "SUB-EI"},
  tags=["lag_ff_zero", "net_dangling_start"],
  note="DANGLING START: its only predecessor link is an FF, so nothing controls when it STARTS. "
       "Its early start collapses to (early finish - duration). DCMA check 2 (leads/lags) and dangle checks should flag it.")

A("A4600", "Permanent Hardstanding & Roads", "TT.4.3", "TASK_DEPENDENT", "CAL-02", 140,
  codes={"DISC": "CIV", "CWA": "CWA-100", "CWP": "CWP-1006", "CONTR": "SUB-CIV"},
  tags=["net_redundant_logic"],
  note="Has a REDUNDANT predecessor (A4110) already implied transitively via A4200->...->A4450. "
       "Free-float and driving-relationship logic must handle it; a redundancy report should flag it.")

A("A4999", "Civils Complete", "TT.4", "FINISH_MILESTONE", "CAL-01", 0,
  codes={"DISC": "CIV", "CWA": "CWA-100", "PHASE": "CONST"},
  tags=["type_finish_ms", "net_merge_point"])

# ---- TT.5 Structural Steel ---------------------------------------------------
A("A5100", "Erect Pipe Rack Steel - Zone A", "TT.5", "TASK_DEPENDENT", "CAL-02", 200,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1007", "CONTR": "SUB-STL", "SHIFT": "DAY"},
  udfs={"WEATHER_SENS": True, "PERMIT_TYPE": "LIFTING", "SIMOPS_RISK": 4},
  tags=["lag_exceeds_pred_duration", "res_curve_bell"],
  note="Predecessor A2300 has an OD of 40h but the FS lag is 80h - a lag longer than the predecessor's duration.")

A("A5110", "Grout Baseplates - Zone A", "TT.5", "TASK_DEPENDENT", "CAL-02", 40,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1007", "CONTR": "SUB-STL"},
  tags=["lag_ss_positive"])

A("A5120", "Torque & Plumb Steel - Zone A", "TT.5", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1007", "CONTR": "SUB-STL"},
  tags=["lag_ff_zero"])

A("A5130", "Handrails & Grating - Zone A", "TT.5", "TASK_DEPENDENT", "CAL-02", 100,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1007", "CONTR": "SUB-STL"})

A("A5200", "Erect Pipe Rack Steel - Zone B", "TT.5", "TASK_DEPENDENT", "CAL-02", 220,
  con=C("START_ON_OR_AFTER", "2026-05-04T07:00:00"),
  con2=C("FINISH_ON_OR_BEFORE", "2026-06-26T17:30:00"),
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1008", "CONTR": "SUB-STL"},
  udfs={"WEATHER_SENS": True, "PERMIT_TYPE": "LIFTING"},
  tags=["con_snet", "con_secondary_fnlt", "con_on_nonworkday"],
  note="TWO tests in one. (1) SECONDARY CONSTRAINT: primary SNET on the forward pass + secondary FNLT on the backward pass. "
       "(2) The SNET date 2026-05-04 is the Early May BANK HOLIDAY - a NON-WORK day on CAL-02. The engine must roll the "
       "constrained start forward to the next working period (Tue 05-May 07:00), not sit it on a non-work instant.")

A("A5210", "Grout Baseplates - Zone B", "TT.5", "TASK_DEPENDENT", "CAL-02", 40,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1008", "CONTR": "SUB-STL"},
  tags=["lag_ss_positive"])

A("A5220", "Torque & Plumb Steel - Zone B", "TT.5", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1008", "CONTR": "SUB-STL"},
  tags=["lag_ff_zero"])

A("A5230", "Handrails & Grating - Zone B", "TT.5", "TASK_DEPENDENT", "CAL-02", 100,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1008", "CONTR": "SUB-STL"})

A("A5300", "Erect Equipment Support Steel", "TT.5", "TASK_DEPENDENT", "CAL-02", 120,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1007", "CONTR": "SUB-STL"})

A("A5400", "Steel Inspection & Punchlist", "TT.5", "TASK_DEPENDENT", "CAL-01", 40,
  codes={"DISC": "STL", "CWA": "CWA-200", "CONTR": "WOOD"},
  tags=["net_merge_point"])

A("A5500", "Night Shift Steel Bolt-Up (SIMOPS)", "TT.5", "TASK_DEPENDENT", "CAL-04", 60,
  codes={"DISC": "STL", "CWA": "CWA-200", "CWP": "CWP-1007", "CONTR": "SUB-STL", "SHIFT": "NIGHT"},
  udfs={"SIMOPS_RISK": 5, "PERMIT_TYPE": "HOT WORK"},
  tags=["cal_night_crosses_midnight"],
  note="Runs on CAL-04, a 20:00-06:00 shift that CROSSES MIDNIGHT. An activity starting Mon 20:00 with a 60h duration "
       "must be scheduled across the Mon 20:00-24:00 / Tue 00:00-06:00 boundary as one continuous shift, and its "
       "'days' display (6d at 10h/day) must not be derived from the calendar day count.")

# ---- TT.6 Mechanical ---------------------------------------------------------
A("A6000", "Heavy Lift Study & Ground Bearing Check", "TT.6", "TASK_DEPENDENT", "CAL-01", 40,
  codes={"DISC": "MEC", "CWA": "CWA-300", "CONTR": "WOOD"},
  tags=["lag_long"])

A("A6100", "Set Module PAU-301 (Heavy Lift)", "TT.6", "RESOURCE_DEPENDENT", "CAL-06", 60,
  codes={"DISC": "MEC", "CWA": "CWA-300", "CWP": "CWP-1009", "CONTR": "SUB-MECH", "SYS": "300-01"},
  udfs={"TAG_NO": "PAU-301", "PERMIT_TYPE": "LIFTING", "SIMOPS_RISK": 5, "WEATHER_SENS": True},
  tags=["type_resource_dependent", "res_calendar_drives", "cost_expense", "lag_long"],
  note="RESOURCE DEPENDENT: it must be scheduled on the RESOURCE's calendar (RCAL-CRANE600: on hire 27-Jul to 21-Aug ONLY), "
       "NOT on its own activity calendar (CAL-06). If your engine schedules it on CAL-06 you'll get a start in May. "
       "Also has an FS + 400h lag from A6000 (a very long lag) and a lump-sum expense.")

A("A6200", "Set Absorber Column T-301", "TT.6", "TASK_DEPENDENT", "CAL-06", 80,
  expfin="2026-08-14T16:00:00",
  codes={"DISC": "MEC", "CWA": "CWA-300", "CWP": "CWP-1009", "CONTR": "SUB-MECH", "SYS": "300-01"},
  udfs={"TAG_NO": "T-301", "PERMIT_TYPE": "LIFTING", "SIMOPS_RISK": 5, "WEATHER_SENS": True},
  tags=["con_expected_finish", "res_overallocation", "type_task_vs_resource_contrast"],
  note="Deliberate CONTRAST with A6100: same crane resource (NL-CRANE600, max 1 unit), SS+0 to A6100 so they overlap, "
       "but this one is TASK DEPENDENT. Two tests: (1) EXPECTED FINISH - with 'Use Expected Finish Dates' ON, the engine "
       "recalculates Remaining Duration so the activity finishes on 2026-08-14. (2) RESOURCE OVER-ALLOCATION - one crane, "
       "two concurrent activities. Levelling must serialise them.")

A("A6300", "Set Amine Pumps P-301A/B", "TT.6", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "MEC", "CWA": "CWA-300", "CWP": "CWP-1009", "CONTR": "SUB-MECH", "SYS": "300-02"},
  udfs={"TAG_NO": "P-301A/B"},
  tags=["net_dangling_activity", "lag_ss_positive"],
  note="FULLY DANGLING: SS predecessor only (A6100), SS successor only (A7300). Nothing controls its finish, and it "
       "cannot transmit finish-driven delay downstream. A classic schedule-quality defect - your engine should still "
       "schedule it correctly AND flag it.")

A("A6400", "Set Heat Exchangers E-301/302", "TT.6", "TASK_DEPENDENT", "CAL-02", 80,
  codes={"DISC": "MEC", "CWA": "CWA-300", "CWP": "CWP-1009", "CONTR": "SUB-MECH", "SYS": "300-02"},
  udfs={"TAG_NO": "E-301/E-302"})

A("A6500", "Mechanical Alignment & Grouting", "TT.6", "TASK_DEPENDENT", "CAL-02", 100,
  codes={"DISC": "MEC", "CWA": "CWA-300", "CWP": "CWP-1009", "CONTR": "SUB-MECH"})

A("A6600", "Equipment Punchlist", "TT.6", "TASK_DEPENDENT", "CAL-01", 40,
  codes={"DISC": "MEC", "CWA": "CWA-300", "CONTR": "WOOD"})

# ---- TT.7 Piping -------------------------------------------------------------
A("A7100", "Pipe Erection - Rack Zone A", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 300,
  dtype="FIXED_UNITS", pct="PHYSICAL",
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH", "SYS": "300-01"},
  udfs={"EV_METHOD": "PHYSICAL_STEPS", "COST_CODE": "C-4100"},
  tags=["pct_physical", "code_steps", "dt_fixed_units", "lag_ss_positive",
        "res_assignment_lag", "res_curve_front_loaded"],
  note="Kitchen-sink activity: Physical %% via weighted STEPS, FIXED UNITS duration type, an SS+50h predecessor, "
       "a resource assignment with a 24h LAG (welders join 3 days in), and a FRONT_LOADED resource curve.")

A("A7110", "Pipe Supports - Zone A", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 120,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH"},
  tags=["lag_ss_zero"])

A("A7120", "Small Bore & Tubing - Zone A", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 140,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH"},
  tags=["lag_ff_positive"])

A("A7130", "Valve Installation - Zone A", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 80,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH"})

A("A7200", "Pipe Erection - Rack Zone B", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 320,
  dtype="FIXED_UNITS_TIME",
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH", "SYS": "300-02"},
  tags=["dt_fixed_units_time", "lag_ss_positive"])

A("A7210", "Pipe Supports - Zone B", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 120,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH"})

A("A7220", "Small Bore & Tubing - Zone B", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 140,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH"})

A("A7230", "Valve Installation - Zone B", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 80,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH"})

A("A7300", "Equipment Piping & In-Battery Tie-ins", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 200,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CWP": "CWP-1010", "CONTR": "SUB-MECH"},
  tags=["net_dangling_partner"])

A("A7400", "NDT & Weld Inspection", "TT.7.1", "TASK_DEPENDENT", "CAL-01", 80,
  dtype="FIXED_DURATION_AND_UNITS",
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "WOOD"},
  tags=["dt_fixed_dur_units", "lag_ff_zero", "net_merge_point"])

A("A7500", "Punchlist & Reinstatement (Piping)", "TT.7.1", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "SUB-MECH"})

A("A7550", "Piping Turnover Package Sign-off", "TT.7.1", "TASK_DEPENDENT", "CAL-01", 0,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "WOOD"},
  tags=["net_zero_duration_task"],
  note="ZERO-DURATION TASK_DEPENDENT activity (NOT a milestone). P6 permits this and it behaves subtly differently "
       "from a milestone: it has both a start and a finish, it can carry resources, and it obeys duration-type rules. "
       "Many home-grown engines divide by zero or collapse it into a milestone.")

A("A7600", "Hydrotest Preparation", "TT.7.2", "TASK_DEPENDENT", "CAL-02", 80,
  con=C("START_ON_OR_BEFORE", "2026-09-30T07:00:00"),
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "SUB-MECH"},
  tags=["con_snlt", "float_negative_driver"],
  note="SNLT is a BACKWARD-PASS (late) constraint. It caps the Late Start. If the forward pass pushes the Early Start "
       "beyond 2026-09-30, this activity goes NEGATIVE FLOAT. It must never move the Early Start.")

A("A7700", "Hydrotest - System 300-01", "TT.7.2", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "SUB-MECH", "SYS": "300-01"},
  tags=["res_overallocation"])

A("A7710", "Hydrotest Hold / Stabilisation", "TT.7.2", "TASK_DEPENDENT", "CAL-03", 24,
  codes={"DISC": "PIP", "CWA": "CWA-400", "SHIFT": "CONTINUOUS", "SYS": "300-01"},
  tags=["cal_24h", "elapsed_duration"])

A("A7720", "Depressurise, Drain & Dry", "TT.7.2", "TASK_DEPENDENT", "CAL-02", 40,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "SUB-MECH", "SYS": "300-01"})

A("A7730", "Hydrotest - System 300-02", "TT.7.2", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "SUB-MECH", "SYS": "300-02"},
  tags=["res_overallocation", "levelling_test"],
  note="Shares the single NL-HYDROPUMP (max 1) with A7700 and starts at the same time (both FS+0 from A7600). "
       "Unlevelled: 200%% allocation. Levelled: must serialise.")

A("A7740", "Reinstatement Post-Hydrotest", "TT.7.2", "TASK_DEPENDENT", "CAL-02", 80,
  codes={"DISC": "PIP", "CWA": "CWA-400", "CONTR": "SUB-MECH"})

# ---- TT.8 E&I ----------------------------------------------------------------
A("A8000", "Cable Tray & Containment", "TT.8", "TASK_DEPENDENT", "CAL-02", 160,
  codes={"DISC": "ELE", "CWA": "CWA-500", "CONTR": "SUB-EI"})

A("A8010", "Cable Pulling - Power", "TT.8", "TASK_DEPENDENT", "CAL-02", 200,
  pct="UNITS",
  codes={"DISC": "ELE", "CWA": "CWA-500", "CONTR": "SUB-EI"},
  udfs={"EV_METHOD": "UNITS"},
  tags=["lag_ss_negative", "pct_units", "pathological"],
  note="SS -40h: the successor may START FOUR DAYS BEFORE its predecessor starts. Logically indefensible and a DCMA "
       "check-2 violation - which is exactly why it is here. Also uses UNITS %% complete (12,000 m of cable).")

A("A8020", "Cable Pulling - Control & Instrument", "TT.8", "TASK_DEPENDENT", "CAL-02", 180,
  codes={"DISC": "ELE", "CWA": "CWA-500", "CONTR": "SUB-EI"},
  tags=["lag_ss_positive"])

A("A8100", "Local Panels & Junction Boxes", "TT.8", "TASK_DEPENDENT", "CAL-02", 100,
  codes={"DISC": "ELE", "CWA": "CWA-500", "CONTR": "SUB-EI"})

A("A8200", "Instrument Installation", "TT.8", "TASK_DEPENDENT", "CAL-02", 160,
  codes={"DISC": "ELE", "CWA": "CWA-500", "CONTR": "SUB-EI"},
  tags=["lag_ff_positive"])

A("A8300", "HV Switchgear Installation & Termination", "TT.8", "RESOURCE_DEPENDENT", "CAL-01", 120,
  codes={"DISC": "ELE", "CWA": "CWA-500", "CONTR": "SUB-EI"},
  udfs={"PERMIT_TYPE": "HV ISOLATION", "SIMOPS_RISK": 4},
  tags=["type_resource_dependent", "cal_4day_week", "lag_calendar_setting_sensitive"],
  note="TWO tests. (1) RESOURCE DEPENDENT on LAB-EI-SPEC, whose calendar (RCAL-SPECIALIST) is a MON-THU 4-day week - "
       "so no work ever lands on a Friday, even though the activity's own calendar (CAL-01) is Mon-Fri. "
       "(2) Its predecessor A2230 is on CAL-03 (24h) and the FS lag is 40h. Change 'Calendar for scheduling relationship "
       "lag' between Predecessor / Successor / 24-Hour and this date MUST move. If it doesn't, your lag resolution is "
       "hard-coded.")

A("A8400", "Cable Termination & Glanding", "TT.8", "TASK_DEPENDENT", "CAL-02", 200,
  codes={"DISC": "ELE", "CWA": "CWA-500", "CONTR": "SUB-EI"},
  tags=["net_merge_point"])

A("A8500", "Loop Checks & Continuity Testing", "TT.8", "TASK_DEPENDENT", "CAL-01", 120,
  codes={"DISC": "ELE", "CWA": "CWA-500", "PHASE": "PRECOM", "CONTR": "SUB-EI"})

A("A8600", "Fibre & Network Commissioning", "TT.8", "TASK_DEPENDENT", "CAL-01", 60,
  codes={"DISC": "ELE", "CWA": "CWA-500", "PHASE": "PRECOM", "CONTR": "SUB-EI"})

A("A8700", "Energise Permanent Power (HV)", "TT.8", "TASK_DEPENDENT", "CAL-01", 40,
  codes={"DISC": "ELE", "CWA": "CWA-500", "PHASE": "PRECOM", "CONTR": "SUB-EI"},
  udfs={"PERMIT_TYPE": "HV ISOLATION", "SIMOPS_RISK": 5},
  tags=["sf_predecessor"])

# ---- TT.9 Insulation / Fireproofing / Painting --------------------------------
A("A9000", "Fireproofing - Structural Steel", "TT.9", "TASK_DEPENDENT", "CAL-02", 140,
  codes={"DISC": "INS", "CWA": "CWA-600", "CONTR": "SUB-INS"},
  tags=["lag_ff_negative", "pathological"],
  note="FF -30h: this activity is allowed to FINISH 3 days BEFORE its predecessor finishes. Negative FF is the least "
       "well-tested relationship in most engines.")

A("A9100", "Insulation - Piping & Equipment", "TT.9", "TASK_DEPENDENT", "CAL-02", 240,
  codes={"DISC": "INS", "CWA": "CWA-600", "CONTR": "SUB-INS"})

A("A9200", "Painting - Touch-up & Final Coat", "TT.9", "TASK_DEPENDENT", "CAL-02", 160,
  codes={"DISC": "INS", "CWA": "CWA-600", "CONTR": "SUB-INS"},
  udfs={"WEATHER_SENS": True})

A("A9300", "Labelling, Tagging & Line Marking", "TT.9", "TASK_DEPENDENT", "CAL-01", 60,
  codes={"DISC": "INS", "CWA": "CWA-600", "CONTR": "SUB-INS"})

A("A9400", "Final Site Clean & Snagging Prep", "TT.9", "TASK_DEPENDENT", "CAL-02", 80,
  con=C("AS_LATE_AS_POSSIBLE", None),
  codes={"DISC": "PM", "CWA": "CWA-600", "CONTR": "WOOD"},
  tags=["con_alap", "float_zero_free"],
  note="ALAP: the activity is pushed as late as its successors allow. After scheduling it must have FREE FLOAT = 0 "
       "while its TOTAL FLOAT is unchanged. Implemented as a zero-free-float pass, not as a date constraint.")

# ---- TT.10 Turnaround Tie-ins -------------------------------------------------
A("A10000", "Tie-in Preparation & Isolation Planning", "TT.10", "TASK_DEPENDENT", "CAL-01", 80,
  codes={"DISC": "PIP", "CWA": "CWA-TA", "PHASE": "CONST", "CONTR": "WOOD"})

A("A10100", "TA Window Opens", "TT.10", "START_MILESTONE", "CAL-03", 0,
  con=C("MANDATORY_START", "2026-10-05T06:00:00"),
  codes={"DISC": "PM", "CWA": "CWA-TA", "SHIFT": "TA"},
  tags=["con_mandatory_start", "breaks_logic"],
  note="MANDATORY START overrides the network in BOTH passes. Even if predecessors slip past 05-Oct, this milestone "
       "STAYS on 05-Oct - which means its predecessor logic can be violated and negative float propagates BACKWARDS "
       "through A10000. Most home-grown engines quietly treat this as an SNET and get it wrong.")

A("A10200", "Break Containment & Isolate Existing Lines", "TT.10", "TASK_DEPENDENT", "CAL-05", 24,
  codes={"DISC": "PIP", "CWA": "CWA-TA", "SHIFT": "TA", "CONTR": "WOOD"},
  udfs={"PERMIT_TYPE": "CONFINED SPACE", "SIMOPS_RISK": 5},
  tags=["cal_window_only"])

A("A10300", "Hot Tap / Tie-in Welds (12 no.)", "TT.10", "TASK_DEPENDENT", "CAL-05", 96,
  codes={"DISC": "PIP", "CWA": "CWA-TA", "SHIFT": "TA", "CONTR": "SUB-MECH"},
  udfs={"PERMIT_TYPE": "HOT WORK", "SIMOPS_RISK": 5},
  tags=["cal_window_only", "cost_expense"])

A("A10400", "Tie-in NDT & PWHT", "TT.10", "TASK_DEPENDENT", "CAL-05", 36,
  codes={"DISC": "PIP", "CWA": "CWA-TA", "SHIFT": "TA", "CONTR": "WOOD"},
  tags=["cal_window_only"])

A("A10450", "Legacy Control System - Parallel Run", "TT.10", "TASK_DEPENDENT", "CAL-03", 120,
  codes={"DISC": "ELE", "CWA": "CWA-TA", "PHASE": "COMM", "SHIFT": "CONTINUOUS"},
  tags=["rel_sf", "lag_sf_positive"],
  note="SF +16h: the legacy system must keep running until 16h AFTER the new system's commissioning STARTS. "
       "This is the textbook legitimate use of Start-to-Finish.")

A("A10460", "Legacy Instrument Air - Maintain Supply", "TT.10", "TASK_DEPENDENT", "CAL-03", 200,
  codes={"DISC": "ELE", "CWA": "CWA-TA", "PHASE": "COMM", "SHIFT": "CONTINUOUS"},
  tags=["rel_sf", "lag_sf_negative", "pathological"],
  note="SF -8h: pure torture. The successor's finish may precede the predecessor's start by 8h. There is no defensible "
       "planning reason for this - it is here purely to prove your SF arithmetic handles a negative lag without "
       "sign errors.")

A("A10500", "TA Window Closes", "TT.10", "FINISH_MILESTONE", "CAL-03", 0,
  con=C("MANDATORY_FINISH", "2026-10-16T18:00:00"),
  codes={"DISC": "PM", "CWA": "CWA-TA", "SHIFT": "TA"},
  tags=["con_mandatory_finish", "breaks_logic"],
  note="MANDATORY FINISH: pinned in both passes. If A10400 runs long, the mandatory finish will sit BEFORE its "
       "predecessor's early finish - a genuinely impossible schedule that P6 will still produce. Your engine must "
       "produce it too (and flag it), not silently 'fix' it.")

A("A10600", "Reinstate Insulation & Painting (Tie-ins)", "TT.10", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "INS", "CWA": "CWA-TA", "CONTR": "SUB-INS"})

# ---- TT.11 Commissioning ------------------------------------------------------
A("A11000", "Commissioning Start", "TT.11", "START_MILESTONE", "CAL-01", 0,
  codes={"DISC": "COM", "PHASE": "COMM", "CONTR": "WOOD"},
  tags=["type_start_ms", "net_merge_point"])

A("A11050", "System Walkdowns & Punch Clear (300-01)", "TT.11", "TASK_DEPENDENT", "CAL-02", 80,
  codes={"DISC": "COM", "PHASE": "PRECOM", "SYS": "300-01", "CONTR": "WOOD"})

A("A11100", "Commissioning - System 300-01", "TT.11", "TASK_DEPENDENT", "CAL-03", 160,
  codes={"DISC": "COM", "PHASE": "COMM", "SYS": "300-01", "SHIFT": "CONTINUOUS", "CONTR": "WOOD"},
  tags=["cal_24h", "sf_predecessor"])

A("A11200", "Commissioning - System 300-02", "TT.11", "TASK_DEPENDENT", "CAL-03", 140,
  codes={"DISC": "COM", "PHASE": "COMM", "SYS": "300-02", "SHIFT": "CONTINUOUS", "CONTR": "WOOD"},
  tags=["cal_24h", "sf_predecessor"])

A("A11300", "Commissioning - System 300-03 (Utilities)", "TT.11", "TASK_DEPENDENT", "CAL-03", 120,
  codes={"DISC": "COM", "PHASE": "COMM", "SYS": "300-03", "SHIFT": "CONTINUOUS", "CONTR": "WOOD"},
  tags=["cal_24h"])

A("A11400", "Nitrogen Purge & Leak Test", "TT.11", "TASK_DEPENDENT", "CAL-03", 72,
  codes={"DISC": "COM", "PHASE": "COMM", "SHIFT": "CONTINUOUS", "CONTR": "WOOD"},
  udfs={"PERMIT_TYPE": "CONFINED SPACE"})

A("A11500", "Performance / Functional Testing", "TT.11", "TASK_DEPENDENT", "CAL-03", 96,
  codes={"DISC": "COM", "PHASE": "COMM", "SHIFT": "CONTINUOUS", "CONTR": "WOOD"})

A("A11600", "Operator Training", "TT.11", "TASK_DEPENDENT", "CAL-01", 80,
  codes={"DISC": "COM", "PHASE": "COMM", "CONTR": "WOOD"})

A("A12000", "Mechanical Completion (MC)", "TT.11", "FINISH_MILESTONE", "CAL-01", 0,
  con=C("FINISH_ON_OR_BEFORE", "2026-11-06T17:00:00"),
  codes={"DISC": "PM", "PHASE": "COMM", "CONTR": "WOOD"},
  tags=["con_fnlt", "float_negative", "type_finish_ms", "net_merge_point"],
  note="THE NEGATIVE FLOAT DRIVER. Contractual FNLT of 06-Nov-2026 that the CPM forward pass cannot meet. "
       "Expect TF < 0 here and back through the driving path. Verify: (a) the magnitude of the negative float, "
       "(b) that it propagates ONLY along the driving chain, (c) that LOEs do NOT inherit it.")

# ---- TT.12 Handover -----------------------------------------------------------
A("A9500", "Client-Supplied Spares - Receipt & Storage", "TT.12", "TASK_DEPENDENT", "CAL-01", 40,
  codes={"DISC": "PM", "PHASE": "HANDOVER", "CONTR": "WOOD"},
  tags=["net_open_start"],
  note="OPEN START, NOT STARTED. With no predecessor its early start must collapse to the DATA DATE (not the project "
       "start). With 'Make open-ended activities critical' = TRUE it must become critical.")

A("A12100", "Punchlist Category A Clearance", "TT.12", "TASK_DEPENDENT", "CAL-02", 80,
  codes={"DISC": "PM", "PHASE": "HANDOVER", "CONTR": "WOOD"})

A("A12200", "Handover Dossiers & As-Builts", "TT.12", "TASK_DEPENDENT", "CAL-01", 120,
  codes={"DISC": "PM", "PHASE": "HANDOVER", "CONTR": "WOOD"})

A("A12300", "Care, Custody & Control Transfer", "TT.12", "TASK_DEPENDENT", "CAL-01", 40,
  codes={"DISC": "PM", "PHASE": "HANDOVER", "CONTR": "WOOD"})

A("A12500", "Ready For Start-Up (RFSU)", "TT.12", "FINISH_MILESTONE", "CAL-01", 0,
  con=C("FINISH_ON", "2026-12-04T17:00:00"),
  ext_lf="2026-12-11T17:00:00",
  codes={"DISC": "PM", "PHASE": "HANDOVER", "CONTR": "WOOD"},
  tags=["con_finish_on", "net_external_late_finish", "float_multiple_paths_target"],
  note="FINISH ON pins the milestone in BOTH passes (unlike FNLT/FNET which pin only one). Also carries an EXTERNAL "
       "LATE FINISH from the downstream Start-Up project. This is the target activity for the Multiple Float Paths test.")

A("A12600", "Demobilise Plant & Equipment", "TT.12", "TASK_DEPENDENT", "CAL-02", 60,
  codes={"DISC": "PM", "PHASE": "HANDOVER", "CONTR": "WOOD"})

A("A12700", "Marine Demob - Barge & Heavy Lift Removal", "TT.12", "TASK_DEPENDENT", "CAL-06", 80,
  codes={"DISC": "MEC", "PHASE": "HANDOVER", "CONTR": "SUB-MECH"},
  udfs={"WEATHER_SENS": True},
  tags=["cal_long_nonwork_block", "net_open_finish", "float_negative"],
  note="On CAL-06, which has a 4-MONTH non-work block (01-Nov to 28-Feb). Its early start lands INSIDE that block, so "
       "the engine must push the whole activity to 01-Mar-2027 - after the project's Must Finish By. Expect large "
       "negative float. It has no successor, so the damage must NOT cascade. Guard your calendar walker with an "
       "iteration cap: a naive 'next working hour' loop will crawl through ~2,900 non-work hours here.")

A("A13000", "Project Complete", "TT.12", "FINISH_MILESTONE", "CAL-01", 0,
  codes={"DISC": "PM", "PHASE": "HANDOVER", "CONTR": "WOOD"},
  tags=["type_finish_ms", "project_finish"])

# --------------------------------------------------------------------------
# RELATIONSHIPS
# --------------------------------------------------------------------------
RELS = []
def R(pred, succ, rtype="FS", lag=0.0, lagcal=None, tags=None, note=None):
    RELS.append({
        "id": f"R{len(RELS)+1:04d}",
        "predecessor": pred, "successor": succ,
        "type": rtype, "lag_h": float(lag),
        "lag_calendar": lagcal,   # null => use the project 'calendar_for_scheduling_relationship_lag' setting
        "test_tags": tags or [], "note": note,
    })

# LOE spans (SS from the span start, FF to the span end)
R("A1000", "A1010", "SS", 0, tags=["loe_span_start"])
R("A1010", "A13000", "FF", 0, tags=["loe_span_end"])
R("A4100", "A1020", "SS", 0, tags=["loe_span_start"])
R("A1020", "A12000", "FF", 0, tags=["loe_span_end"])
R("A3000", "A1030", "SS", 0, tags=["loe_span_start"])
R("A1030", "A12500", "FF", 0, tags=["loe_span_end"])
R("A1000", "A1040", "SS", 0, tags=["loe_span_start"])
R("A1040", "A13000", "FF", 0, tags=["loe_span_end"])
R("A7100", "A3100", "SS", 0, tags=["loe_span_start"])
R("A3100", "A9200", "FF", 0, tags=["loe_span_end"])

# Engineering & Procurement
R("A1000", "A2000", "FS", 0, tags=["con_start_on"],
  note="Logic says A2000 could start on 05-Jan; the START_ON constraint pins it to 19-Jan. Tests that START_ON "
       "overrides a permissive predecessor in the forward pass AND is not pulled earlier by the backward pass.")
R("A2100", "A2110", "FS", 80, tags=["rel_fs", "lag_positive"])
R("A2110", "A2120", "FS", 160, tags=["rel_fs", "lag_positive", "net_external_vs_internal"],
  note="A2120 has BOTH internal logic (this edge) and an external_early_start of 2026-04-13. The later of the two "
       "must drive. Toggle 'ignore relationships to/from other projects' and confirm which one wins.")
R("A2110", "A2300", "FS", 40, tags=["rel_fs", "lag_positive"])
R("A2110", "A2310", "FS", 320, tags=["rel_fs", "lag_positive"])
R("A2120", "A2320", "FS", 240, tags=["rel_fs", "lag_positive"])
R("A2320", "A2330", "FS", 160, tags=["rel_fs", "lag_positive"])

# Site establishment
R("A1000", "A3000", "FS", 0, tags=["rel_fs", "lag_zero"])
R("A3000", "A3010", "FS", 0)
R("A2000", "A3010", "FS", 0, tags=["net_multiple_predecessors"])
R("A3000", "A3020", "FS", 0)
R("A3010", "A3030", "FS", 0)
R("A3020", "A3040", "FS", 0)
R("A3030", "A5500", "FS", 0, tags=["cal_night_crosses_midnight"],
  note="Night shift bolt-up needs temporary lighting. Gives the completed A3030 a successor.")
R("A3040", "A6100", "FS", 0, tags=["prog_stopped_zero_remaining"],
  note="A3040 is STOPPED (RD=0, no actual finish). Its remaining early finish = the DATA DATE, and that must "
       "propagate into A6100. If your engine leaves A3040's finish null, this successor breaks.")
R("A8700", "A3800", "SF", 0, tags=["rel_sf", "lag_sf_zero"],
  note="START-TO-FINISH, zero lag. Temp power must not FINISH until permanent power STARTS. "
       "Forward pass: EF(succ) >= ES(pred) + 0. Then ES(succ) = EF(succ) - RD(succ).")
R("A3800", "A3900", "FS", 0)

# Civils
R("A3010", "A4100", "FS", 0)
R("A2100", "A4100", "FS", 0, tags=["net_multiple_predecessors"])
R("A4100", "A4110", "SS", 60, tags=["rel_ss", "lag_positive"])
R("A4110", "A4200", "FS", 0)
R("A4200", "A4210", "SS", 40, tags=["rel_ss", "lag_positive"])
R("A4200", "A4220", "FS", 0, tags=["rel_fs", "prog_out_of_sequence"],
  note="The out-of-sequence edge. A4220 has an actual start while A4200 is only 40%% complete.")
R("A4200", "A4230", "SS", 48, tags=["rel_ss", "lag_positive"])
R("A4230", "A4300", "FS", 0)
R("A4220", "A4300", "FS", 0, tags=["retained_logic_vs_progress_override"],
  note="THE DISCRIMINATOR EDGE. A4220 is out of sequence. Under RETAINED LOGIC its remaining work waits for A4200 "
       "(remaining finish ~16-Mar), so A4300 starts ~19-Mar. Under PROGRESS OVERRIDE A4220's remaining work runs "
       "from the data date, so A4300 falls back to its SNET of 16-Mar. If A4300 lands on the same date in both "
       "scenarios, the option is not implemented.")
R("A4300", "A4310", "FS", 0)
R("A4310", "A4320", "FS", 0)
R("A4320", "A4330", "FS", 0)
R("A4330", "A4340", "FS", 0)
R("A4340", "A4350", "FS", 0)
R("A4350", "A4360", "FS", -20, tags=["rel_fs", "lag_negative", "lag_fs_negative", "pathological"],
  note="NEGATIVE FS LAG (a 'lead'). Backfill may start 20h (2 days on CAL-02) before formwork stripping finishes. "
       "Sign convention: ES(succ) >= EF(pred) + lag, with lag = -20h.")
R("A4210", "A4400", "FS", 0)
R("A4300", "A4400", "FF", 20, tags=["rel_ff", "lag_positive", "lag_ff_positive"])
R("A4400", "A4410", "FS", 0)
R("A4410", "A4420", "FS", 0)
R("A4420", "A4430", "FS", 0)
R("A4430", "A4440", "FS", 168, lagcal="24H",
  tags=["rel_fs", "lag_positive", "lag_calendar_24h", "lag_calendar_setting_sensitive"],
  note="EXPLICIT 24-HOUR LAG CALENDAR. 168h = exactly 7 elapsed days regardless of the CAL-02 working pattern. "
       "This edge OVERRIDES the project-level lag calendar setting. If your model has no per-relationship lag "
       "calendar you cannot represent concrete cure correctly.")
R("A4440", "A4450", "FS", 0)
R("A4110", "A4500", "FS", 0)
R("A4300", "A4500", "SS", 40, tags=["rel_ss", "lag_positive", "net_multiple_predecessors"])
R("A4500", "A4510", "SS", 0, tags=["rel_ss", "lag_zero", "lag_ss_zero"])
R("A4510", "A4520", "FF", 0, tags=["rel_ff", "lag_zero", "lag_ff_zero", "net_dangling_start"],
  note="The ONLY link into A4520 is an FF, so nothing drives its start.")
R("A4450", "A4600", "FS", 0)
R("A4360", "A4600", "FS", 0)
R("A4110", "A4600", "FS", 0, tags=["net_redundant_logic"],
  note="REDUNDANT: A4110 already reaches A4600 transitively via A4200 -> A4210 -> A4400 -> ... -> A4450. "
       "Never driving; a redundancy report should list it.")
R("A4360", "A4999", "FS", 0)
R("A4450", "A4999", "FS", 0)
R("A4520", "A4999", "FS", 0)
R("A4600", "A4999", "FS", 0)

# Steel
R("A4350", "A5100", "FS", 0)
R("A2300", "A5100", "FS", 80, tags=["rel_fs", "lag_exceeds_pred_duration"],
  note="Lag (80h) is DOUBLE the predecessor's original duration (40h). Legal, but a good test of lag arithmetic "
       "that is anchored on the predecessor's FINISH rather than its start.")
R("A5100", "A5110", "SS", 80, tags=["rel_ss", "lag_positive", "lag_ss_positive"])
R("A5100", "A5120", "FF", 0, tags=["rel_ff", "lag_zero", "lag_ff_zero"])
R("A5100", "A5130", "FS", 0)
R("A5100", "A5500", "SS", 40, tags=["rel_ss", "lag_positive", "cal_night_crosses_midnight"],
  note="Predecessor on CAL-02 (07:00-17:30), successor on CAL-04 (20:00-06:00). The lag must be resolved on ONE of "
       "them, and the successor's start must then be snapped to the next NIGHT-SHIFT working instant.")
R("A4440", "A5200", "FS", 0)
R("A2310", "A5200", "FS", 0)
R("A5200", "A5210", "SS", 80, tags=["rel_ss", "lag_positive"])
R("A5200", "A5220", "FF", 0, tags=["rel_ff", "lag_zero"])
R("A5200", "A5230", "FS", 0)
R("A4350", "A5300", "FS", 0)
R("A2300", "A5300", "FS", 0)
R("A5110", "A5400", "FS", 0)
R("A5120", "A5400", "FS", 0)
R("A5210", "A5400", "FS", 0)
R("A5220", "A5400", "FS", 0)
R("A5500", "A5400", "FS", 0)

# Mechanical
R("A2110", "A6000", "FS", 0)
R("A6000", "A6100", "FS", 400, tags=["rel_fs", "lag_positive", "lag_long"],
  note="VERY LONG LAG (400h = 50 working days on CAL-01). Not driving - the crane resource calendar is - "
       "which is itself the test.")
R("A2210", "A6100", "FS", 0)
R("A5300", "A6100", "FS", 0)
R("A6100", "A6200", "SS", 0, tags=["rel_ss", "lag_zero", "res_overallocation"],
  note="Forces A6100 and A6200 to overlap while both demand the single 600t crane. Unlevelled = 200%%.")
R("A2200", "A6200", "FS", 0)
R("A6100", "A6300", "SS", 80, tags=["rel_ss", "lag_positive", "net_dangling_activity"])
R("A2220", "A6400", "FS", 0)
R("A5300", "A6400", "FS", 0)
R("A6200", "A6500", "FS", 0)
R("A6400", "A6500", "FS", 0)
R("A6500", "A6600", "FS", 0)

# Piping
R("A5100", "A7100", "SS", 50, tags=["rel_ss", "lag_positive", "lag_ss_positive"])
R("A2320", "A7100", "FS", 0)
R("A7100", "A7110", "SS", 0, tags=["rel_ss", "lag_zero"])
R("A7100", "A7120", "FF", 40, tags=["rel_ff", "lag_positive", "lag_ff_positive"])
R("A7100", "A7130", "FS", 0)
R("A7110", "A7130", "FS", 0)
R("A5200", "A7200", "SS", 50, tags=["rel_ss", "lag_positive"])
R("A2330", "A7200", "FS", 0)
R("A7200", "A7210", "SS", 0, tags=["rel_ss", "lag_zero"])
R("A7200", "A7220", "FF", 40, tags=["rel_ff", "lag_positive"])
R("A7200", "A7230", "FS", 0)
R("A7210", "A7230", "FS", 0)
R("A6500", "A7300", "FS", 0)
R("A6300", "A7300", "SS", 0, tags=["rel_ss", "lag_zero", "net_dangling_activity"])
R("A7100", "A7400", "FF", 0, tags=["rel_ff", "lag_zero"])
R("A7200", "A7400", "FF", 0, tags=["rel_ff", "lag_zero"])
R("A7300", "A7400", "FF", 0, tags=["rel_ff", "lag_zero"])
R("A7400", "A7550", "FS", 0, tags=["net_zero_duration_task"])
R("A7550", "A7600", "FS", 0, tags=["net_zero_duration_task"])
R("A7120", "A7600", "FS", 0)
R("A7220", "A7600", "FS", 0)
R("A7130", "A7600", "FS", 0)
R("A7230", "A7600", "FS", 0)
R("A7600", "A7700", "FS", 0)
R("A7600", "A7730", "FS", 0, tags=["res_overallocation", "levelling_test"])
R("A7700", "A7710", "FS", 0)
R("A7710", "A7720", "FS", 0)
R("A7720", "A7740", "FS", 0)
R("A7730", "A7740", "FS", 0)
R("A7740", "A7500", "FS", 0)

# E&I
R("A5130", "A8000", "FS", 0)
R("A5230", "A8000", "FS", 0)
R("A8000", "A8010", "SS", -40, tags=["rel_ss", "lag_negative", "lag_ss_negative", "pathological"],
  note="NEGATIVE SS LAG. ES(succ) >= ES(pred) - 40h, so the successor may start FOUR DAYS BEFORE its predecessor. "
       "Almost certainly a modelling error in the real world; here it is a deliberate sign-convention test.")
R("A8000", "A8020", "SS", 80, tags=["rel_ss", "lag_positive"])
R("A8000", "A8100", "FS", 0)
R("A7100", "A8200", "FF", 40, tags=["rel_ff", "lag_positive"])
R("A7200", "A8200", "FF", 40, tags=["rel_ff", "lag_positive"])
R("A2230", "A8300", "FS", 40, tags=["rel_fs", "lag_positive", "lag_calendar_setting_sensitive"],
  note="Predecessor A2230 is on CAL-03 (24h). Successor A8300 is on CAL-01 (5-day) but is RESOURCE DEPENDENT on a "
       "MON-THU calendar. The 40h lag resolves to a different date under each 'calendar for relationship lag' setting: "
       "PREDECESSOR (24h) ~= +1.7 elapsed days; SUCCESSOR ~= +5 working days. This single edge is the best proof that "
       "the setting is actually wired up.")
R("A8100", "A8300", "FS", 0)
R("A8010", "A8400", "FS", 0)
R("A8020", "A8400", "FS", 0)
R("A8300", "A8400", "FS", 0)
R("A8400", "A8500", "FS", 0)
R("A8200", "A8500", "FS", 0)
R("A8500", "A8600", "FS", 0)
R("A8500", "A8700", "FS", 0)

# Insulation / Fireproofing / Painting
R("A5220", "A9000", "FF", -30, tags=["rel_ff", "lag_negative", "lag_ff_negative", "pathological"],
  note="NEGATIVE FF LAG. EF(succ) >= EF(pred) - 30h. The successor may finish 3 days BEFORE the predecessor.")
R("A5120", "A9000", "FS", 0)
R("A7740", "A9100", "FS", 0)
R("A8500", "A9100", "SS", 80, tags=["rel_ss", "lag_positive"])
R("A9100", "A9200", "SS", 80, tags=["rel_ss", "lag_positive"])
R("A9000", "A9200", "FS", 0)
R("A9200", "A9300", "SS", 40, tags=["rel_ss", "lag_positive"])
R("A9200", "A9400", "FS", 0)
R("A9300", "A9400", "FS", 0)

# Turnaround
R("A7400", "A10000", "FS", 0)
R("A10000", "A10100", "FS", 0, tags=["con_mandatory_start", "breaks_logic"],
  note="This edge can be VIOLATED by A10100's Mandatory Start. That is the point.")
R("A10100", "A10200", "FS", 0)
R("A10200", "A10300", "FS", 0)
R("A10300", "A10400", "FS", 0)
R("A10400", "A10500", "FS", 0, tags=["con_mandatory_finish", "breaks_logic"])
R("A11100", "A10450", "SF", 16, tags=["rel_sf", "lag_positive", "lag_sf_positive"],
  note="SF + POSITIVE LAG. EF(A10450) >= ES(A11100) + 16h.")
R("A11200", "A10460", "SF", -8, tags=["rel_sf", "lag_negative", "lag_sf_negative", "pathological"],
  note="SF + NEGATIVE LAG. EF(A10460) >= ES(A11200) - 8h. Pure sign-convention torture.")
R("A10500", "A10600", "FS", 0)

# Commissioning
R("A8600", "A11000", "FS", 0)
R("A9300", "A11000", "FS", 0)
R("A10500", "A11000", "FS", 0)
R("A11000", "A11050", "FS", 0)
R("A7740", "A11050", "FS", 0)
R("A11050", "A11100", "FS", 0)
R("A11100", "A11200", "FS", 24, tags=["rel_fs", "lag_positive", "cal_24h"],
  note="Both ends on CAL-03. A 24h lag here is exactly one elapsed day - verify it is not being converted through "
       "an 8h/day assumption somewhere.")
R("A11000", "A11300", "FS", 0)
R("A8700", "A11300", "FS", 0)
R("A11100", "A11400", "FS", 0)
R("A11200", "A11400", "FS", 0)
R("A11400", "A11500", "FS", 0)
R("A11300", "A11500", "FS", 0)
R("A11300", "A11600", "FS", 0)

# Mechanical Completion merge
for p in ["A11500", "A9400", "A6600", "A7500", "A10600", "A10450", "A10460", "A4999", "A5400"]:
    R(p, "A12000", "FS", 0, tags=["net_merge_point"])

# Handover
R("A12000", "A12100", "FS", 0)
R("A12000", "A12200", "FS", 0)
R("A9500", "A12200", "FS", 0, tags=["net_open_start"])
R("A12100", "A12300", "FS", 0)
R("A12200", "A12300", "FS", 0)
R("A11600", "A12300", "FS", 0)
R("A12300", "A12500", "FS", 0)
R("A12300", "A12600", "FS", 0)
R("A12600", "A12700", "FS", 0, tags=["cal_long_nonwork_block"])
R("A12500", "A13000", "FS", 0)
R("A12600", "A13000", "FS", 0)

# --------------------------------------------------------------------------
# ASSIGNMENTS
# --------------------------------------------------------------------------
ASSIGN = []
def AS_(act, res, units_per_h, budget_units, actual_units=0.0, remaining=None,
        curve_id="LINEAR", lag_h=0.0, role=None, tags=None, note=None):
    if remaining is None:
        remaining = max(budget_units - actual_units, 0.0)
    ASSIGN.append({
        "id": f"AS{len(ASSIGN)+1:04d}",
        "activity": act, "resource": res, "role": role,
        "units_per_hour": units_per_h,
        "budgeted_units": budget_units,
        "actual_units": actual_units,
        "remaining_units": remaining,
        "at_completion_units": actual_units + remaining,
        "curve": curve_id,
        "assignment_lag_h": lag_h,
        "test_tags": tags or [], "note": note,
    })

AS_("A1010", "LAB-SUP", 3, 3600, 620, curve_id="LINEAR", tags=["type_loe", "res_labour"])
AS_("A1020", "LAB-QA", 2, 2000, 300, tags=["type_loe"])
AS_("A1030", "LAB-SUP", 1, 1600, 260, tags=["type_loe"])
AS_("A3100", "LAB-SCAF", 6, 4800, 0, tags=["type_loe"])

AS_("A3010", "LAB-CIVIL", 6, 600, 600, remaining=0, tags=["prog_complete", "cost_actual"])
AS_("A4100", "LAB-CIVIL", 12, 1800, 1860, remaining=0,
    tags=["prog_complete", "cost_actual", "cost_overrun"],
    note="Actual units (1860) EXCEED budget (1800). At-completion must reflect the overrun; EV/CPI must go < 1.0.")
AS_("A4100", "NL-EXCAV", 2, 300, 320, remaining=0)
AS_("A4200", "LAB-CIVIL", 10, 2000, 1200, remaining=1200,
    tags=["prog_in_progress", "cost_actual"],
    note="At-completion = 1200 actual + 1200 remaining = 2400 vs 2000 budget. 20%% over.")
AS_("A4200", "NL-EXCAV", 1, 200, 120, remaining=120)
AS_("A4210", "LAB-CIVIL", 10, 1800, 300, remaining=1500, tags=["prog_suspended_no_resume"])
AS_("A4220", "LAB-QA", 2, 80, 32, remaining=48, tags=["prog_out_of_sequence"])
AS_("A4230", "LAB-CIVIL", 6, 720, 360, remaining=360, tags=["prog_suspend_resume"])

AS_("A4330", "MAT-CONC", 21.25, 850, 0, tags=["res_material", "dt_fixed_units"],
    note="MATERIAL resource, unit of measure m3 (not hours). 850 m3 over 40h = 21.25 m3/h.")
AS_("A4430", "MAT-CONC", 19.5, 780, 0, tags=["res_material"])

AS_("A5100", "LAB-STEEL", 6, 1200, 0, curve_id="BELL", tags=["res_curve_bell"])
AS_("A5100", "NL-CRANE200", 1, 200, 0, tags=["res_nonlabour"])
AS_("A5100", "MAT-STEEL", 0.6, 120, 0, tags=["res_material"])
AS_("A5200", "LAB-STEEL", 6, 1320, 0, curve_id="BELL")
AS_("A5200", "NL-CRANE200", 1, 220, 0)
AS_("A5200", "MAT-STEEL", 0.61, 135, 0)
AS_("A5500", "LAB-STEEL", 4, 240, 0, tags=["cal_night_crosses_midnight"],
    note="Resource LAB-STEEL's own calendar is CAL-02 (day shift) but the activity runs on CAL-04 (nights). "
         "For a TASK DEPENDENT activity the ACTIVITY calendar wins - the resource's calendar must be ignored here. "
         "Contrast with A6100/A8300, which are RESOURCE DEPENDENT.")

AS_("A6100", "NL-CRANE600", 1, 60, 0, tags=["type_resource_dependent", "res_calendar_drives", "res_driving"],
    note="DRIVING resource assignment on a RESOURCE DEPENDENT activity. The crane's calendar dictates the dates.")
AS_("A6100", "LAB-STEEL", 8, 480, 0)
AS_("A6200", "NL-CRANE600", 1, 80, 0, tags=["res_overallocation"],
    note="Second concurrent claim on the single 600t crane. 200%% allocation until levelled.")
AS_("A6200", "LAB-STEEL", 6, 480, 0)

AS_("A7100", "LAB-PIPE", 8, 2400, 0, curve_id="FRONT_LOADED", tags=["res_curve_front_loaded"])
AS_("A7100", "LAB-WELD", 4, 1104, 0, lag_h=24.0, curve_id="BELL",
    tags=["res_assignment_lag"],
    note="ASSIGNMENT LAG of 24h: welders join 3 days (24h on CAL-02) after the activity starts, so the assignment "
         "spans only 276h of the 300h activity. Resource histograms and cost spreads must both respect this.")
AS_("A7100", "NL-MEWP", 2, 600, 0)
AS_("A7100", "MAT-SPOOL", 0.73, 220, 0, tags=["res_material"])
AS_("A7200", "LAB-PIPE", 8, 2560, 0, role="ROLE-PF", tags=["res_role"])
AS_("A7200", "LAB-WELD", 4, 1280, 0, role="ROLE-WD", tags=["res_role"])
AS_("A7200", "MAT-SPOOL", 0.75, 240, 0)
AS_("A7700", "NL-HYDROPUMP", 1, 60, 0, tags=["res_overallocation", "levelling_test"])
AS_("A7700", "LAB-PIPE", 4, 240, 0)
AS_("A7730", "NL-HYDROPUMP", 1, 60, 0, tags=["res_overallocation", "levelling_test"],
    note="Same single-unit pump, same window as A7700. Levelling must serialise; unlevelled must report 200%%.")
AS_("A7730", "LAB-PIPE", 4, 240, 0)

AS_("A8010", "LAB-EI", 8, 1600, 0, tags=["pct_units"])
AS_("A8010", "MAT-CABLE", 60, 12000, 0, tags=["res_material", "pct_units"],
    note="UNITS %% COMPLETE is driven by this material assignment: metres of cable pulled / 12,000.")
AS_("A8300", "LAB-EI-SPEC", 2, 240, 0, role="ROLE-EIT",
    tags=["type_resource_dependent", "cal_4day_week", "res_driving"],
    note="Driving resource on a 4-day (Mon-Thu) resource calendar.")
AS_("A10300", "LAB-WELD", 8, 768, 0, tags=["cal_window_only"])
AS_("A10300", "NL-WELDSET", 8, 768, 0)
AS_("A11100", "LAB-COMM", 4, 640, 0, curve_id="BACK_LOADED", tags=["res_curve_back_loaded"])
AS_("A11200", "LAB-COMM", 4, 560, 0, curve_id="DOUBLE_PEAK", tags=["res_curve_double_peak"])
AS_("A9100", "LAB-INS", 8, 1920, 0)
AS_("A9200", "LAB-PAINT", 6, 960, 0)

# --------------------------------------------------------------------------
# STEPS (for physical % complete)
# --------------------------------------------------------------------------
STEPS = [
    {"activity": "A4200", "seq": 1, "name": "Rig set-up & piling mat check", "weight": 10, "percent_complete": 100},
    {"activity": "A4200", "seq": 2, "name": "Drive piles 1-40",              "weight": 35, "percent_complete": 70},
    {"activity": "A4200", "seq": 3, "name": "Drive piles 41-90",             "weight": 35, "percent_complete": 1.43},
    {"activity": "A4200", "seq": 4, "name": "Rig demob & as-built records",  "weight": 20, "percent_complete": 0},
    {"activity": "A7100", "seq": 1, "name": "Spool set-out & rigging",       "weight": 15, "percent_complete": 0},
    {"activity": "A7100", "seq": 2, "name": "Fit-up",                        "weight": 25, "percent_complete": 0},
    {"activity": "A7100", "seq": 3, "name": "Welding",                       "weight": 40, "percent_complete": 0},
    {"activity": "A7100", "seq": 4, "name": "NDT & hydro prep",              "weight": 20, "percent_complete": 0},
]
# Verify A4200 weighted physical % == 35.0
_pc = sum(s["weight"] * s["percent_complete"] / 100 for s in STEPS if s["activity"] == "A4200")
assert abs(_pc - 35.0) < 0.6, _pc

# --------------------------------------------------------------------------
# EXPENSES
# --------------------------------------------------------------------------
EXPENSES = [
    {"id": "E001", "activity": "A6100", "name": "600t Crane Mobilisation / Demobilisation",
     "cost_account": "C-3000", "budgeted_cost": 45000.0, "actual_cost": 0.0,
     "accrual_type": "START", "test_tags": ["cost_expense", "accrual_start"]},
    {"id": "E002", "activity": "A3010", "name": "Site Cabins & Welfare Hire",
     "cost_account": "C-0100", "budgeted_cost": 68000.0, "actual_cost": 71500.0,
     "accrual_type": "UNIFORM", "test_tags": ["cost_expense", "accrual_uniform", "cost_overrun"]},
    {"id": "E003", "activity": "A10300", "name": "Hot Work Permit & Fire Watch Standby",
     "cost_account": "C-3200", "budgeted_cost": 12000.0, "actual_cost": 0.0,
     "accrual_type": "UNIFORM", "test_tags": ["cost_expense"]},
    {"id": "E004", "activity": "A12500", "name": "Handover Dossier Print & Bind",
     "cost_account": "C-9000", "budgeted_cost": 3500.0, "actual_cost": 0.0,
     "accrual_type": "END", "test_tags": ["cost_expense", "accrual_end"]},
]

# --------------------------------------------------------------------------
# SCHEDULING OPTIONS + SCENARIOS
# --------------------------------------------------------------------------
BASE_OPTIONS = {
    "ignore_relationships_to_and_from_other_projects": False,
    "make_open_ended_activities_critical": False,
    "use_expected_finish_dates": True,
    "schedule_automatically_when_a_change_affects_dates": False,
    "level_resources_during_scheduling": False,
    "recalculate_assignment_costs_after_scheduling": True,
    "when_scheduling_progressed_activities_use": "RETAINED_LOGIC",
    "calendar_for_scheduling_relationship_lag": "PREDECESSOR",
    "define_critical_activities_as": "TOTAL_FLOAT_LESS_THAN_OR_EQUAL",
    "critical_float_threshold_h": 0,
    "compute_total_float_as": "FINISH_FLOAT",
    "calculate_float_based_on_finish_date_of": "EACH_PROJECT",
    "calculate_multiple_float_paths": False,
    "multiple_float_paths_use": "TOTAL_FLOAT",
    "multiple_float_paths_ending_with_activity": "A12500",
    "number_of_float_paths_to_calculate": 10,
}

SCENARIOS = [
    {"id": "S01_BASELINE_UNPROGRESSED",
     "description": "Baseline run. Schedule with data date = project start and ALL actuals stripped.",
     "overrides": {"data_date": "2026-01-05T08:00:00", "strip_all_actuals": True},
     "assertions": [
        "No activity starts before 2026-01-05 08:00.",
        "Snapshot the resulting dates/units/cost as Baseline BL1 - all variance tests key off this run.",
        "A2000 (START_ON) must sit exactly on 2026-01-19 08:00 in BOTH passes.",
     ]},
    {"id": "S02_PROGRESSED_RETAINED_LOGIC",
     "description": "The primary run. Data date 2026-03-02, Retained Logic.",
     "overrides": {},
     "assertions": [
        "No REMAINING work is scheduled before the data date (2026-03-02 08:00).",
        "A4220 (out of sequence): its remaining 24h must wait for A4200's remaining finish.",
        "A3040 (stopped, RD=0, no AF): remaining early finish = data date.",
        "A4230: remaining work must not start before its Resume date 2026-03-09.",
        "A12000 (MC) total float < 0.",
        "A12700 early start pushed to 2026-03-01/2027-03-01 by the CAL-06 winter block; large negative float; no cascade.",
        "All five LOE activities have float but are NEVER on the critical path and NEVER drive a successor.",
     ]},
    {"id": "S03_PROGRESS_OVERRIDE",
     "description": "Same as S02 but Progress Override.",
     "overrides": {"when_scheduling_progressed_activities_use": "PROGRESS_OVERRIDE"},
     "assertions": [
        "A4220's incomplete FS predecessor (A4200) is IGNORED: its remaining work starts at the data date.",
        "A4220 finishes earlier than in S02. Downstream of A4220 must move accordingly.",
        "This is the definitive Retained Logic vs Progress Override discriminator - if S02 and S03 give identical "
        "dates, the setting is not implemented.",
     ]},
    {"id": "S04_ACTUAL_DATES",
     "description": "Same as S02 but Actual Dates.",
     "overrides": {"when_scheduling_progressed_activities_use": "ACTUAL_DATES"},
     "assertions": [
        "Actual dates are never moved by the scheduler under any circumstance.",
        "Compare A4220's remaining early start against S02 and S03.",
     ]},
    {"id": "S05_LAG_CALENDAR_SUCCESSOR",
     "description": "Relationship lag resolved on the SUCCESSOR's calendar.",
     "overrides": {"calendar_for_scheduling_relationship_lag": "SUCCESSOR"},
     "assertions": [
        "A8300 must MOVE relative to S02 (predecessor A2230 is on CAL-03/24h, successor is on CAL-01).",
        "A4440 must NOT move: its relationship carries an explicit lag_calendar of 24H, which overrides the setting.",
     ]},
    {"id": "S06_LAG_CALENDAR_24H",
     "description": "Relationship lag resolved on a 24-hour calendar globally.",
     "overrides": {"calendar_for_scheduling_relationship_lag": "24_HOUR"},
     "assertions": [
        "Every positive lag shortens in elapsed terms. A5100 (FS+80h from A2300) must pull earlier.",
        "Negative lags (A4360, A8010, A9000, A10460) must also change - check the sign handling.",
     ]},
    {"id": "S07_LONGEST_PATH",
     "description": "Critical = Longest Path instead of Total Float <= 0.",
     "overrides": {"define_critical_activities_as": "LONGEST_PATH"},
     "assertions": [
        "The critical set must DIFFER from S02. Multi-calendar activities (CAL-03 24h) and the constrained "
        "activities are the usual divergence points.",
        "A12700 has hugely negative float but is NOT on the longest path to the project finish (it is open-ended) - "
        "so it must be critical under TF<=0 and NOT critical under Longest Path.",
     ]},
    {"id": "S08_OPEN_ENDS_CRITICAL",
     "description": "Make open-ended activities critical.",
     "overrides": {"make_open_ended_activities_critical": True},
     "assertions": [
        "A9500 (open start) and A3900 / A12700 (open finish) become critical.",
        "Their late dates are set from their early dates rather than from the project finish.",
     ]},
    {"id": "S09_IGNORE_EXTERNAL",
     "description": "Ignore relationships to/from other projects.",
     "overrides": {"ignore_relationships_to_and_from_other_projects": True},
     "assertions": [
        "All external_early_start values (A2120, A2200, A2210, A2220, A2230) are dropped; those milestones collapse "
        "to the data date.",
        "A12500's external_late_finish is dropped.",
        "The whole procurement-driven chain pulls left dramatically. If nothing moves, external dates are not wired in.",
     ]},
    {"id": "S10_LEVELLED",
     "description": "Resource levelling enabled.",
     "overrides": {"level_resources_during_scheduling": True},
     "assertions": [
        "NL-CRANE600 (max 1): A6100 and A6200 must SERIALISE. Note this conflicts with the 21-Aug end of the crane "
        "hire window - the engine must either extend past it or report the conflict. Both answers are defensible; "
        "pick one and document it.",
        "NL-HYDROPUMP (max 1): A7700 and A7730 must serialise.",
        "LAB-WELD (max 12): check A7100 (4) + A7200 (4) + A10300 (8) overlap.",
        "Levelling must NEVER move an activity with a MANDATORY constraint (A10100, A10500).",
     ]},
    {"id": "S11_MULTIPLE_FLOAT_PATHS",
     "description": "Compute 10 float paths ending at A12500 (RFSU).",
     "overrides": {"calculate_multiple_float_paths": True},
     "assertions": [
        "Float Path 1 = the driving path into A12500.",
        "Paths must be contiguous chains, not just activities sorted by total float.",
        "Re-run with multiple_float_paths_use = FREE_FLOAT and confirm the paths change.",
     ]},
    {"id": "S12_EXPECTED_FINISH_OFF",
     "description": "Use Expected Finish Dates = FALSE.",
     "overrides": {"use_expected_finish_dates": False},
     "assertions": [
        "A6200's remaining duration is NOT recalculated; it finishes per its 80h duration instead of on 2026-08-14.",
        "Diff against S02 - if identical, expected finish is not implemented.",
     ]},
    {"id": "S13_TOTAL_FLOAT_START",
     "description": "Compute Total Float as Start Float (and then Smallest of Start/Finish).",
     "overrides": {"compute_total_float_as": "START_FLOAT"},
     "assertions": [
        "Activities whose calendar differs from their predecessors' (A4340, A7710, A11100, A5500) are where "
        "start float and finish float diverge. Those are the ones to diff.",
     ]},
]

# --------------------------------------------------------------------------
# ASSEMBLE
# --------------------------------------------------------------------------
FIXTURE = {
    "schema_version": "1.0",
    "fixture": {
        "id": "P6-TORTURE-01",
        "name": "CPM/PDM Engine Conformance Fixture - Process Plant Construction",
        "purpose": "A realistic but deliberately pathological construction schedule that exercises every "
                   "relationship type, lag sign, constraint type, activity type, duration type, percent-complete "
                   "type, calendar pattern, progress state and scheduling option found in a P6-class engine.",
        "duration_unit": "hours",
        "currency": "GBP",
        "datetime_format": "ISO-8601 local (no timezone) - all calendars are site-local",
    },
    "project": {
        "id": "TT-300",
        "name": "Unit 300 Amine Regeneration Package - Construction & Commissioning",
        "planned_start": "2026-01-05T08:00:00",
        "data_date": "2026-03-02T08:00:00",
        "must_finish_by": "2026-12-18T17:00:00",
        "default_calendar": "CAL-01",
        "scheduling_options": BASE_OPTIONS,
    },
    "calendars": CALENDARS,
    "wbs": [{"id": i, "parent": p, "name": n} for i, p, n in WBS],
    "activity_code_types": ACTIVITY_CODE_TYPES,
    "udf_definitions": UDF_DEFINITIONS,
    "resource_curves": CURVES,
    "roles": [{"id": i, "name": n, "resources": r} for i, n, r in ROLES],
    "resources": [
        {"id": i, "name": n, "type": t, "max_units_per_hour": m,
         "price_per_unit": p, "unit_of_measure": u, "calendar": c}
        for i, n, t, m, p, u, c in RESOURCES
    ],
    "activities": ACTS,
    "relationships": RELS,
    "assignments": ASSIGN,
    "steps": STEPS,
    "expenses": EXPENSES,
    "scenarios": SCENARIOS,
}

# coverage index: tag -> [object ids]
cov = defaultdict(list)
for a in ACTS:
    for t in a["test_tags"]:
        cov[t].append(a["id"])
for r in RELS:
    for t in r["test_tags"]:
        cov[t].append(r["id"])
for c in CALENDARS:
    for t in c["test_tags"]:
        cov[t].append(c["id"])
for a in ASSIGN:
    for t in a["test_tags"]:
        cov[t].append(a["id"])
for e in EXPENSES:
    for t in e["test_tags"]:
        cov[t].append(e["id"])
FIXTURE["coverage_index"] = {k: sorted(set(v)) for k, v in sorted(cov.items())}

with open(os.path.join(OUT, "p6_torture_test_v1.json"), "w") as f:
    json.dump(FIXTURE, f, indent=2)

# --------------------------------------------------------------------------
# NEGATIVE / HOSTILE CASES  (kept OUT of the main network on purpose)
# --------------------------------------------------------------------------
NEG = {
    "schema_version": "1.0",
    "purpose": "Invalid, hostile and undefined-behaviour inputs. These MUST NOT be merged into the main network - "
               "load them one at a time and assert that the engine rejects, repairs or reports, but never hangs, "
               "crashes or silently produces nonsense.",
    "cases": [
        {"id": "N01_CYCLE_3", "expect": "REJECT_WITH_CYCLE_REPORT",
         "description": "Three-activity closed loop.",
         "activities": [{"id": "N1A", "name": "Loop A", "original_duration_h": 40, "calendar": "CAL-01"},
                        {"id": "N1B", "name": "Loop B", "original_duration_h": 40, "calendar": "CAL-01"},
                        {"id": "N1C", "name": "Loop C", "original_duration_h": 40, "calendar": "CAL-01"}],
         "relationships": [{"predecessor": "N1A", "successor": "N1B", "type": "FS", "lag_h": 0},
                           {"predecessor": "N1B", "successor": "N1C", "type": "FS", "lag_h": 0},
                           {"predecessor": "N1C", "successor": "N1A", "type": "FS", "lag_h": 0}],
         "assertion": "Engine must name the exact members of the cycle, not just say 'loop detected'."},

        {"id": "N02_SELF_LOOP", "expect": "REJECT",
         "description": "Activity is its own predecessor.",
         "activities": [{"id": "N2A", "name": "Self", "original_duration_h": 40, "calendar": "CAL-01"}],
         "relationships": [{"predecessor": "N2A", "successor": "N2A", "type": "FS", "lag_h": 0}]},

        {"id": "N03_SS_FF_CYCLE", "expect": "REJECT_WITH_CYCLE_REPORT",
         "description": "A subtle loop that only exists through SS/FF edges - trips naive FS-only cycle detectors.",
         "activities": [{"id": "N3A", "name": "SS/FF A", "original_duration_h": 80, "calendar": "CAL-01"},
                        {"id": "N3B", "name": "SS/FF B", "original_duration_h": 80, "calendar": "CAL-01"}],
         "relationships": [{"predecessor": "N3A", "successor": "N3B", "type": "SS", "lag_h": 8},
                           {"predecessor": "N3B", "successor": "N3A", "type": "FF", "lag_h": 8}],
         "assertion": "This IS a cycle in the constraint graph even though it looks like ordinary ladder logic."},

        {"id": "N04_DUPLICATE_RELATIONSHIP", "expect": "REJECT_OR_DEDUPE",
         "description": "Two relationships between the same activity pair. P6 permits only one - decide and document "
                        "whether you reject, dedupe, or keep both and take the most constraining.",
         "relationships": [{"predecessor": "A5100", "successor": "A5130", "type": "FS", "lag_h": 0},
                           {"predecessor": "A5100", "successor": "A5130", "type": "SS", "lag_h": 40}]},

        {"id": "N05_DANGLING_REFERENCE", "expect": "REJECT",
         "description": "Relationship pointing at an activity that does not exist.",
         "relationships": [{"predecessor": "A5100", "successor": "A9999", "type": "FS", "lag_h": 0}]},

        {"id": "N06_AF_BEFORE_AS", "expect": "REJECT",
         "description": "Actual finish precedes actual start.",
         "activities": [{"id": "N6A", "name": "Time traveller", "original_duration_h": 40, "calendar": "CAL-01",
                         "status": "COMPLETED", "actual_start": "2026-02-20T08:00:00",
                         "actual_finish": "2026-02-16T17:00:00"}]},

        {"id": "N07_ACTUAL_IN_FUTURE", "expect": "REJECT_OR_WARN",
         "description": "Actual start AFTER the data date.",
         "activities": [{"id": "N7A", "name": "Premature actual", "original_duration_h": 40, "calendar": "CAL-01",
                         "status": "IN_PROGRESS", "actual_start": "2026-04-01T08:00:00"}]},

        {"id": "N08_COMPLETE_NO_AF", "expect": "REPAIR_OR_WARN",
         "description": "100% complete with a remaining duration and no actual finish.",
         "activities": [{"id": "N8A", "name": "Schrodinger's activity", "original_duration_h": 40,
                         "calendar": "CAL-01", "status": "COMPLETED",
                         "actual_start": "2026-02-16T08:00:00", "actual_finish": None,
                         "remaining_duration_h": 16, "duration_percent_complete": 100}]},

        {"id": "N09_NEGATIVE_DURATION", "expect": "REJECT",
         "activities": [{"id": "N9A", "name": "Negative duration", "original_duration_h": -40, "calendar": "CAL-01"}]},

        {"id": "N10_IMPOSSIBLE_MANDATORY_PAIR", "expect": "SCHEDULE_AND_REPORT_VIOLATION",
         "description": "Mandatory Finish EARLIER than the predecessor's Mandatory Start. P6 will happily produce "
                        "this impossible schedule and simply show the violation. Your engine must not 'fix' it.",
         "activities": [{"id": "N10A", "name": "Mand start", "original_duration_h": 40, "calendar": "CAL-01",
                         "primary_constraint": {"type": "MANDATORY_START", "date": "2026-06-01T08:00:00"}},
                        {"id": "N10B", "name": "Mand finish", "original_duration_h": 40, "calendar": "CAL-01",
                         "primary_constraint": {"type": "MANDATORY_FINISH", "date": "2026-05-01T17:00:00"}}],
         "relationships": [{"predecessor": "N10A", "successor": "N10B", "type": "FS", "lag_h": 0}]},

        {"id": "N11_ZERO_HOUR_CALENDAR", "expect": "REJECT_AT_LOAD_OR_TERMINATE_SAFELY",
         "description": "*** THE ENGINE HANG TEST *** A calendar with NO working time at all. Any naive "
                        "'advance to the next working hour' loop will spin forever. Every calendar walker must have "
                        "an iteration cap and a 'no working time within N years' error.",
         "calendars": [{"id": "CAL-DEAD", "name": "No Working Time", "hours_per_day": 0,
                        "workweek": {d: [] for d in DAYS}, "exceptions": []}],
         "activities": [{"id": "N11A", "name": "Unschedulable", "original_duration_h": 40, "calendar": "CAL-DEAD"}]},

        {"id": "N12_LOE_NO_SPAN", "expect": "REJECT_OR_WARN",
         "description": "Level of Effort with no predecessor and no successor - it has nothing to span, so its "
                        "duration is undefined.",
         "activities": [{"id": "N12A", "name": "Orphan LOE", "activity_type": "LEVEL_OF_EFFORT",
                         "original_duration_h": 0, "calendar": "CAL-01"}]},

        {"id": "N13_LEAD_BEFORE_DATA_DATE", "expect": "CLAMP_TO_DATA_DATE",
         "description": "A negative lag large enough to pull an unstarted successor before the data date. "
                        "The data date is a hard floor for remaining work - the lead must be truncated, not honoured.",
         "activities": [{"id": "N13A", "name": "Pred", "original_duration_h": 40, "calendar": "CAL-01"},
                        {"id": "N13B", "name": "Succ", "original_duration_h": 40, "calendar": "CAL-01"}],
         "relationships": [{"predecessor": "N13A", "successor": "N13B", "type": "FS", "lag_h": -400}]},

        {"id": "N14_NEGATIVE_UNITS", "expect": "REJECT",
         "assignments": [{"activity": "A5100", "resource": "LAB-STEEL", "budgeted_units": -400}]},

        {"id": "N15_CONSTRAINT_BEFORE_PROJECT_START", "expect": "WARN",
         "description": "SNET earlier than the project planned start. Must not pull anything before the data date.",
         "activities": [{"id": "N15A", "name": "Time-warp constraint", "original_duration_h": 40, "calendar": "CAL-01",
                         "primary_constraint": {"type": "START_ON_OR_AFTER", "date": "2025-06-01T08:00:00"}}]},

        {"id": "N16_LAG_EXCEEDS_HORIZON", "expect": "REJECT_OR_WARN",
         "description": "A 100,000-hour lag - about 11 years on a 24h calendar, 48 years on CAL-01. Tests that your "
                        "date walker has a horizon and does not simply iterate.",
         "relationships": [{"predecessor": "A5100", "successor": "A5130", "type": "FS", "lag_h": 100000}]},

        {"id": "N17_MS_WITH_DURATION", "expect": "REJECT_OR_COERCE",
         "description": "A milestone with a non-zero duration.",
         "activities": [{"id": "N17A", "name": "Fat milestone", "activity_type": "START_MILESTONE",
                         "original_duration_h": 40, "calendar": "CAL-01"}]},

        {"id": "N18_RD_GT_OD_ON_COMPLETE", "expect": "REPAIR_OR_WARN",
         "description": "Completed activity that still carries a remaining duration.",
         "activities": [{"id": "N18A", "name": "Zombie", "original_duration_h": 40, "calendar": "CAL-01",
                         "status": "COMPLETED", "actual_start": "2026-02-02T08:00:00",
                         "actual_finish": "2026-02-06T17:00:00", "remaining_duration_h": 80}]},
    ],
}
with open(os.path.join(OUT, "negative_cases.json"), "w") as f:
    json.dump(NEG, f, indent=2)

# --------------------------------------------------------------------------
# CSV EXPORTS
# --------------------------------------------------------------------------
def w(name, rows, cols):
    with open(os.path.join(OUT, name), "w", newline="") as f:
        wr = csv.DictWriter(f, fieldnames=cols, extrasaction="ignore")
        wr.writeheader()
        for r in rows:
            wr.writerow(r)

acts_flat = []
for a in ACTS:
    r = dict(a)
    r["primary_constraint_type"] = (a["primary_constraint"] or {}).get("type", "")
    r["primary_constraint_date"] = (a["primary_constraint"] or {}).get("date", "") or ""
    r["secondary_constraint_type"] = (a["secondary_constraint"] or {}).get("type", "")
    r["secondary_constraint_date"] = (a["secondary_constraint"] or {}).get("date", "") or ""
    r["activity_codes"] = ";".join(f"{k}={v}" for k, v in a["activity_codes"].items())
    r["udfs"] = ";".join(f"{k}={v}" for k, v in a["udfs"].items())
    r["test_tags"] = ";".join(a["test_tags"])
    acts_flat.append(r)

w("activities.csv", acts_flat, [
    "id", "name", "wbs", "activity_type", "calendar", "original_duration_h",
    "original_duration_days_display", "remaining_duration_h", "duration_type",
    "percent_complete_type", "status", "actual_start", "actual_finish",
    "suspend_date", "resume_date", "duration_percent_complete",
    "physical_percent_complete", "units_percent_complete",
    "primary_constraint_type", "primary_constraint_date",
    "secondary_constraint_type", "secondary_constraint_date",
    "expected_finish", "external_early_start", "external_late_finish",
    "activity_codes", "udfs", "test_tags", "note"])

rels_flat = [dict(r, test_tags=";".join(r["test_tags"])) for r in RELS]
w("relationships.csv", rels_flat,
  ["id", "predecessor", "successor", "type", "lag_h", "lag_calendar", "test_tags", "note"])

w("resources.csv", FIXTURE["resources"],
  ["id", "name", "type", "max_units_per_hour", "price_per_unit", "unit_of_measure", "calendar"])

asg_flat = [dict(a, test_tags=";".join(a["test_tags"])) for a in ASSIGN]
w("assignments.csv", asg_flat,
  ["id", "activity", "resource", "role", "units_per_hour", "budgeted_units", "actual_units",
   "remaining_units", "at_completion_units", "curve", "assignment_lag_h", "test_tags", "note"])

cal_flat = []
for c in CALENDARS:
    cal_flat.append({
        "id": c["id"], "name": c["name"], "type": c["type"],
        "hours_per_day": c["hours_per_day"], "hours_per_week": c["hours_per_week"],
        "workweek": json.dumps(c["workweek"]),
        "exceptions": json.dumps(c["exceptions"]),
        "test_tags": ";".join(c["test_tags"]),
    })
w("calendars.csv", cal_flat,
  ["id", "name", "type", "hours_per_day", "hours_per_week", "workweek", "exceptions", "test_tags"])

print(f"activities:    {len(ACTS)}")
print(f"relationships: {len(RELS)}")
print(f"assignments:   {len(ASSIGN)}")
print(f"calendars:     {len(CALENDARS)}")
print(f"resources:     {len(RESOURCES)}")
print(f"scenarios:     {len(SCENARIOS)}")
print(f"negative cases:{len(NEG['cases'])}")
print(f"unique tags:   {len(FIXTURE['coverage_index'])}")
