import type { ConformanceFixture } from './schema.js';

/**
 * Feature-coverage completeness — a TypeScript port of the `REQUIRED` checklist in
 * `fixtures/tools/validate_fixture.py`. Every feature the fixture claims to exercise must appear in
 * its `coverage_index` (tag → object ids). A missing tag means the fixture stopped covering a
 * capability the framework promises to benchmark, which is a reviewed regression (ADR-0034).
 */
export const REQUIRED_COVERAGE_TAGS: readonly string[] = [
  // relationship types
  'rel_fs',
  'rel_ss',
  'rel_ff',
  'rel_sf',
  // lag signs by type
  'lag_zero',
  'lag_positive',
  'lag_negative',
  'lag_fs_negative',
  'lag_ss_positive',
  'lag_ss_negative',
  'lag_ss_zero',
  'lag_ff_positive',
  'lag_ff_negative',
  'lag_ff_zero',
  'lag_sf_zero',
  'lag_sf_positive',
  'lag_sf_negative',
  'lag_exceeds_pred_duration',
  'lag_long',
  'lag_calendar_24h',
  'lag_calendar_setting_sensitive',
  // constraints
  'con_start_on',
  'con_snet',
  'con_snlt',
  'con_finish_on',
  'con_fnet',
  'con_fnlt',
  'con_alap',
  'con_mandatory_start',
  'con_mandatory_finish',
  'con_expected_finish',
  'con_secondary_fnlt',
  'con_on_nonworkday',
  // activity types
  'type_task_vs_resource_contrast',
  'type_resource_dependent',
  'type_loe',
  'type_start_ms',
  'type_finish_ms',
  'type_wbs_summary',
  // duration types
  'dt_fixed_units',
  'dt_fixed_units_time',
  'dt_fixed_dur_units',
  // percent complete types
  'pct_physical',
  'pct_units',
  'code_steps',
  // calendars
  'cal_5day',
  'cal_6day',
  'cal_24h',
  'cal_night_crosses_midnight',
  'cal_window_only',
  'cal_long_nonwork_block',
  'cal_resource',
  'cal_4day_week',
  'cal_holidays',
  'cal_shutdown',
  'cal_positive_exception',
  'cal_empty_base_week',
  // progress
  'prog_complete',
  'prog_in_progress',
  'prog_out_of_sequence',
  'prog_suspend_resume',
  'prog_suspended_no_resume',
  'prog_stopped_zero_remaining',
  'prog_rd_vs_pct_divergence',
  'prog_resume_after_data_date',
  'retained_logic_vs_progress_override',
  // network topology
  'net_open_start',
  'net_open_finish',
  'net_dangling_start',
  'net_dangling_activity',
  'net_redundant_logic',
  'net_multiple_predecessors',
  'net_merge_point',
  'net_external_early_start',
  'net_external_late_finish',
  'net_zero_duration_task',
  'net_external_open_start',
  'net_external_vs_internal',
  // float
  'float_negative',
  'float_zero_free',
  'float_multiple_paths_target',
  // resources / cost
  'res_labour',
  'res_nonlabour',
  'res_material',
  'res_role',
  'res_assignment_lag',
  'res_overallocation',
  'res_calendar_drives',
  'res_driving',
  'res_curve_bell',
  'res_curve_front_loaded',
  'res_curve_back_loaded',
  'res_curve_double_peak',
  'levelling_test',
  'cost_expense',
  'cost_actual',
  'cost_overrun',
  'accrual_start',
  'accrual_uniform',
  'accrual_end',
  // misc
  'pathological',
  'breaks_logic',
  'elapsed_duration',
  'interproject',
];

export interface CoverageResult {
  ok: boolean;
  /** Required tags with no entry in `coverage_index`. */
  missing: string[];
}

export function checkCoverage(fixture: ConformanceFixture): CoverageResult {
  const covered = fixture.coverage_index;
  const missing = REQUIRED_COVERAGE_TAGS.filter((tag) => !(tag in covered));
  return { ok: missing.length === 0, missing };
}
