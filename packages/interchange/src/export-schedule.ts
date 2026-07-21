import type { ExportGraph } from './export-graph.js';
import { exportMspdi, type ExportMspdiResult } from './export-mspdi.js';
import { exportXer, type ExportXerResult } from './export-xer.js';

/**
 * The **format-agnostic export entry point** (ADR-0050 M4b) — the write-direction mirror of
 * {@link importSchedule}. The thin persisting layer assembles a plan's {@link ExportGraph} and hands it
 * here with the desired `format`; this dispatches to the matching orchestrator ({@link exportXer} for P6
 * **XER**, {@link exportMspdi} for Microsoft Project **MSPDI** XML). Both run the *same* validate → limit →
 * map → emit → serialise → report pipeline over the *same* canonical model and return the *same* result
 * shape (bytes + {@link InterchangeReport}, or a typed rejection), so the caller stays format-blind — adding
 * a format is a new serialiser, never a second call site.
 */

/** The interchange formats the exporter can serialise. */
export type ExportFormat = 'xer' | 'mspdi';

export interface ExportScheduleInput {
  /** The SchedulePoint plan to export, already assembled into the domain-shaped export graph. */
  readonly graph: ExportGraph;
  /** Which interchange format to serialise to. */
  readonly format: ExportFormat;
}

/** Identical union to each orchestrator's result — file bytes + report, or a typed rejection. */
export type ExportScheduleResult = ExportXerResult | ExportMspdiResult;

/** Dispatch to the per-format orchestrator. Pure + deterministic; the engine is never invoked. */
export function exportSchedule(input: ExportScheduleInput): ExportScheduleResult {
  return input.format === 'mspdi'
    ? exportMspdi({ graph: input.graph })
    : exportXer({ graph: input.graph });
}
