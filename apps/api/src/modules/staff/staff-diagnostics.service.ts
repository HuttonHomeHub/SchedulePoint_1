import { Injectable } from '@nestjs/common';

import { VersionService } from '../../version/version.service';

import type { StaffDiagnosticRowDto, StaffDiagnosticsDto } from './dto/staff-diagnostics.dto';
import { DIAGNOSTICS, type DiagnosticEntry } from './staff-diagnostics.registry';
import { StaffDiagnosticsRepository } from './staff-diagnostics.repository';

/**
 * Runs every registry entry and returns integers (ADR-0140).
 *
 * **It takes no argument, and that is the decision rather than a small API** (ADR-0140 D2, clause
 * 2). A parameterless aggregate cannot be used to ask about anybody in particular, because an
 * oracle requires the caller to vary the question — so the absence of an input here, and of an
 * input decorator on the handler that calls it, is what the whole narrowing of ADR-0086 D6 rests
 * on. Gate S-2 refuses the decorator; this signature is the same refusal one layer down.
 *
 * **No `StaffPrincipal` is threaded through it**, and that is deliberate too: there is nothing to
 * scope. The answer is installation-wide by construction, so no caller identity could change it,
 * and taking one would invite a future reader to think it could.
 *
 * Entries run in sequence rather than in parallel. `Promise.all` would be a little faster and would
 * make the per-entry `elapsedMs` meaningless — four numbers that each include the others' wait,
 * pasted into a measurement record as though they were costs. The measured worst case for the whole
 * run is far inside the throttle it was derived against.
 */
@Injectable()
export class StaffDiagnosticsService {
  constructor(
    private readonly repository: StaffDiagnosticsRepository,
    private readonly version: VersionService,
  ) {}

  async run(): Promise<StaffDiagnosticsDto> {
    // The SERVER clock, taken once before the first query rather than per entry: the block a staff
    // member pastes into a measurement record needs one time for the reading, and a per-entry
    // timestamp would invite somebody to treat entries taken 40 ms apart as separate observations.
    const takenAt = new Date().toISOString();

    const diagnostics: StaffDiagnosticRowDto[] = [];
    for (const entry of DIAGNOSTICS) {
      diagnostics.push(await this.runOne(entry));
    }

    return { takenAt, apiVersion: this.version.getVersion(), diagnostics };
  }

  private async runOne(entry: DiagnosticEntry): Promise<StaffDiagnosticRowDto> {
    const startedAt = Date.now();
    const examined = await this.repository.examined(entry);
    const counts = await this.repository.affected(entry);

    return {
      id: entry.id,
      label: entry.label,
      nature: entry.nature,
      examined,
      affected: counts.affected,
      affectedPlans: counts.affectedPlans,
      affectedOrganizations: counts.affectedOrganizations,
      elapsedMs: Date.now() - startedAt,
    };
  }
}
