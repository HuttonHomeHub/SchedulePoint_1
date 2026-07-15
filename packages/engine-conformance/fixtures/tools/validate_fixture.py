#!/usr/bin/env python3
"""
validate_fixture.py
===================
Structural validation of the fixture. This does NOT compute dates - P6 (or your engine)
is the oracle for dates. This only proves the fixture itself is well-formed:

  1. Referential integrity (every id referenced exists)
  2. The MAIN network is a DAG (no accidental loops) - deliberate loops live in negative_cases.json
  3. Every LOE has a span (>=1 predecessor and >=1 successor)
  4. Open ends are exactly the ones we intended
  5. Feature coverage: every feature in the checklist is exercised by >=1 object
"""
import json, sys
from collections import defaultdict

path = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs/p6_torture_test_v1.json"
F = json.load(open(path))

acts = {a["id"]: a for a in F["activities"]}
cals = {c["id"] for c in F["calendars"]}
wbs = {w["id"] for w in F["wbs"]}
res = {r["id"] for r in F["resources"]}
curves = {c["id"] for c in F["resource_curves"]}
roles = {r["id"] for r in F["roles"]}
rels = F["relationships"]

errors, warnings = [], []

# 1. Referential integrity ---------------------------------------------------
for a in acts.values():
    if a["calendar"] not in cals:
        errors.append(f"{a['id']}: unknown calendar {a['calendar']}")
    if a["wbs"] not in wbs:
        errors.append(f"{a['id']}: unknown WBS {a['wbs']}")
for r in rels:
    if r["predecessor"] not in acts:
        errors.append(f"{r['id']}: unknown predecessor {r['predecessor']}")
    if r["successor"] not in acts:
        errors.append(f"{r['id']}: unknown successor {r['successor']}")
    if r["type"] not in {"FS", "SS", "FF", "SF"}:
        errors.append(f"{r['id']}: bad type {r['type']}")
    if r["predecessor"] == r["successor"]:
        errors.append(f"{r['id']}: self-loop")
for s in F["assignments"]:
    if s["activity"] not in acts: errors.append(f"{s['id']}: unknown activity {s['activity']}")
    if s["resource"] not in res:  errors.append(f"{s['id']}: unknown resource {s['resource']}")
    if s["curve"] not in curves:  errors.append(f"{s['id']}: unknown curve {s['curve']}")
    if s["role"] and s["role"] not in roles: errors.append(f"{s['id']}: unknown role {s['role']}")
for s in F["steps"]:
    if s["activity"] not in acts: errors.append(f"step: unknown activity {s['activity']}")
for e in F["expenses"]:
    if e["activity"] not in acts: errors.append(f"{e['id']}: unknown activity {e['activity']}")
for rr in F["resources"]:
    if rr["calendar"] not in cals: errors.append(f"resource {rr['id']}: unknown calendar")

# duplicate relationship pairs (P6 allows only one per pair)
pairs = defaultdict(list)
for r in rels:
    pairs[(r["predecessor"], r["successor"])].append(r["id"])
for k, v in pairs.items():
    if len(v) > 1:
        errors.append(f"duplicate relationship pair {k}: {v}")

# 2. DAG check ---------------------------------------------------------------
adj = defaultdict(list)
indeg = {a: 0 for a in acts}
for r in rels:
    adj[r["predecessor"]].append(r["successor"])
    indeg[r["successor"]] += 1
q = [a for a, d in indeg.items() if d == 0]
seen = 0
order = []
while q:
    n = q.pop()
    order.append(n); seen += 1
    for m in adj[n]:
        indeg[m] -= 1
        if indeg[m] == 0:
            q.append(m)
if seen != len(acts):
    stuck = sorted(set(acts) - set(order))
    errors.append(f"CYCLE DETECTED in main network. Activities not topologically ordered: {stuck}")
else:
    print(f"[OK] Main network is acyclic ({len(order)} activities topologically ordered).")

# 3. LOE spans ---------------------------------------------------------------
preds = defaultdict(list); succs = defaultdict(list)
for r in rels:
    preds[r["successor"]].append(r)
    succs[r["predecessor"]].append(r)
for a in acts.values():
    if a["activity_type"] == "LEVEL_OF_EFFORT":
        if not preds[a["id"]] or not succs[a["id"]]:
            errors.append(f"{a['id']}: LOE without a full span")

# 4. Open ends ---------------------------------------------------------------
EXPECTED_OPEN_START = {"A1000", "A2100", "A9500",
                       "A2200", "A2210", "A2220", "A2230",
                       "W4000", "W5000", "W7000"}
EXPECTED_OPEN_FINISH = {"A3900", "A12700", "A13000", "W4000", "W5000", "W7000"}
open_start = {a for a in acts if not preds[a]}
open_finish = {a for a in acts if not succs[a]}
if open_start != EXPECTED_OPEN_START:
    warnings.append(f"open starts differ. got={sorted(open_start)} expected={sorted(EXPECTED_OPEN_START)}")
if open_finish != EXPECTED_OPEN_FINISH:
    warnings.append(f"open finishes differ. got={sorted(open_finish)} expected={sorted(EXPECTED_OPEN_FINISH)}")

# 5. Progress sanity ---------------------------------------------------------
DD = F["project"]["data_date"]
for a in acts.values():
    st = a["status"]
    if st == "COMPLETED":
        if not a["actual_start"] or not a["actual_finish"]:
            errors.append(f"{a['id']}: COMPLETED without both actual dates")
        elif a["actual_finish"] > DD:
            errors.append(f"{a['id']}: actual finish after data date")
        if a["remaining_duration_h"] != 0:
            errors.append(f"{a['id']}: COMPLETED with remaining duration")
    if st == "IN_PROGRESS":
        if not a["actual_start"]:
            errors.append(f"{a['id']}: IN_PROGRESS without actual start")
        elif a["actual_start"] > DD and a["activity_type"] != "LEVEL_OF_EFFORT":
            errors.append(f"{a['id']}: actual start after data date")
    if st == "NOT_STARTED" and (a["actual_start"] or a["actual_finish"]):
        errors.append(f"{a['id']}: NOT_STARTED with actual dates")
    if a["activity_type"] in ("START_MILESTONE", "FINISH_MILESTONE") and a["original_duration_h"] != 0:
        errors.append(f"{a['id']}: milestone with non-zero duration")

# 6. Feature coverage --------------------------------------------------------
REQUIRED = [
    # relationship types
    "rel_fs", "rel_ss", "rel_ff", "rel_sf",
    # lag signs by type
    "lag_zero", "lag_positive", "lag_negative",
    "lag_fs_negative", "lag_ss_positive", "lag_ss_negative", "lag_ss_zero",
    "lag_ff_positive", "lag_ff_negative", "lag_ff_zero",
    "lag_sf_zero", "lag_sf_positive", "lag_sf_negative",
    "lag_exceeds_pred_duration", "lag_long",
    "lag_calendar_24h", "lag_calendar_setting_sensitive",
    # constraints
    "con_start_on", "con_snet", "con_snlt", "con_finish_on", "con_fnet", "con_fnlt",
    "con_alap", "con_mandatory_start", "con_mandatory_finish", "con_expected_finish",
    "con_secondary_fnlt", "con_on_nonworkday",
    # activity types
    "type_task_vs_resource_contrast", "type_resource_dependent", "type_loe",
    "type_start_ms", "type_finish_ms", "type_wbs_summary",
    # duration types
    "dt_fixed_units", "dt_fixed_units_time", "dt_fixed_dur_units",
    # percent complete types
    "pct_physical", "pct_units", "code_steps",
    # calendars
    "cal_5day", "cal_6day", "cal_24h", "cal_night_crosses_midnight",
    "cal_window_only", "cal_long_nonwork_block", "cal_resource", "cal_4day_week",
    "cal_holidays", "cal_shutdown", "cal_positive_exception", "cal_empty_base_week",
    # progress
    "prog_complete", "prog_in_progress", "prog_out_of_sequence",
    "prog_suspend_resume", "prog_suspended_no_resume", "prog_stopped_zero_remaining",
    "prog_rd_vs_pct_divergence", "prog_resume_after_data_date",
    "retained_logic_vs_progress_override",
    # network topology
    "net_open_start", "net_open_finish", "net_dangling_start", "net_dangling_activity",
    "net_redundant_logic", "net_multiple_predecessors", "net_merge_point",
    "net_external_early_start", "net_external_late_finish", "net_zero_duration_task",
    "net_external_open_start", "net_external_vs_internal",
    # float
    "float_negative", "float_zero_free", "float_multiple_paths_target",
    # resources / cost
    "res_labour", "res_nonlabour", "res_material", "res_role",
    "res_assignment_lag", "res_overallocation", "res_calendar_drives", "res_driving",
    "res_curve_bell", "res_curve_front_loaded", "res_curve_back_loaded", "res_curve_double_peak",
    "levelling_test", "cost_expense", "cost_actual", "cost_overrun",
    "accrual_start", "accrual_uniform", "accrual_end",
    # misc
    "pathological", "breaks_logic", "elapsed_duration", "interproject",
]
cov = F["coverage_index"]
missing = [t for t in REQUIRED if t not in cov]

print()
print("=" * 78)
if errors:
    print(f"ERRORS ({len(errors)}):")
    for e in errors: print("  x " + e)
else:
    print("[OK] No structural errors.")
if warnings:
    print(f"\nWARNINGS ({len(warnings)}):")
    for x in warnings: print("  ! " + x)

print()
if missing:
    print(f"[FAIL] Missing feature coverage ({len(missing)}): {missing}")
else:
    print(f"[OK] Feature coverage complete: all {len(REQUIRED)} required features exercised.")

# summary counts
by_type = defaultdict(int)
for r in rels: by_type[r["type"]] += 1
lag_pos = sum(1 for r in rels if r["lag_h"] > 0)
lag_neg = sum(1 for r in rels if r["lag_h"] < 0)
lag_zero = sum(1 for r in rels if r["lag_h"] == 0)
cons = defaultdict(int)
for a in acts.values():
    if a["primary_constraint"]: cons[a["primary_constraint"]["type"]] += 1
    if a["secondary_constraint"]: cons["(secondary) " + a["secondary_constraint"]["type"]] += 1
    if a["expected_finish"]: cons["EXPECTED_FINISH"] += 1
atypes = defaultdict(int)
for a in acts.values(): atypes[a["activity_type"]] += 1

print()
print("-" * 78)
print(f"Activities            : {len(acts)}")
print(f"Relationships         : {len(rels)}   FS={by_type['FS']} SS={by_type['SS']} FF={by_type['FF']} SF={by_type['SF']}")
print(f"Lags                  : zero={lag_zero} positive={lag_pos} negative={lag_neg}")
print(f"Activity types        : " + ", ".join(f"{k}={v}" for k, v in sorted(atypes.items())))
print(f"Constraints           : " + ", ".join(f"{k}={v}" for k, v in sorted(cons.items())))
print(f"Calendars             : {len(F['calendars'])}")
print(f"Resources             : {len(F['resources'])}   Assignments: {len(F['assignments'])}")
print(f"Scenarios             : {len(F['scenarios'])}")
print(f"Distinct feature tags : {len(cov)}")
print("-" * 78)

sys.exit(1 if errors or missing else 0)
