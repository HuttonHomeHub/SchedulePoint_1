import { ApiProperty } from '@nestjs/swagger';

import {
  DIAGNOSTIC_IDS,
  DIAGNOSTIC_NATURES,
  type DiagnosticId,
  type DiagnosticNature,
} from '../staff-diagnostics.registry';

/**
 * One named question's answer, and **the shape is the boundary** (ADR-0140 D2, clause 3).
 *
 * Every property is a `number` except the two registry literals, and that is not a style rule: it
 * is what bounds the disclosure. The query's reach is the whole estate; what crosses the process
 * boundary is a handful of integers, from which nothing is re-identifiable — "17 of 1,284 across 3
 * plans" names no plan, no client, no activity and no date.
 *
 * **This guarantee is weaker than ADR-0086 D1's, and ADR-0140 D3 says so in its own words rather
 * than borrowing D1's language.** D1 is a *negative* type property — `StaffPrincipal` lacks fields,
 * so assignment to `Principal` fails, and only an edit to one watched file can defeat it. This is a
 * *positive* property on one return type, defeated by a one-line widening in this very file that
 * typechecks and reads like a feature ("so staff can tell the customer which plans"). No compiler
 * complains. **Gate S-1 is the repair**, and it reads this file's source.
 */
export class StaffDiagnosticRowDto {
  @ApiProperty({
    enum: DIAGNOSTIC_IDS,
    description:
      'The registry identifier. A literal from a closed union, never data read from a customer row.',
  })
  id!: DiagnosticId;

  @ApiProperty({
    description:
      'The human label, also a registry literal. It describes the QUESTION, never an answer, so it ' +
      'carries nothing about this installation.',
  })
  label!: string;

  @ApiProperty({
    description:
      'How many rows the question was asked of. A count with no denominator is not a result — "17" ' +
      'means nothing without the 1,284 it is 17 of, and a panel showing only the numerator lets a ' +
      'reader conclude a defect is large when it is a rounding error.',
  })
  examined!: number;

  @ApiProperty({
    enum: DIAGNOSTIC_NATURES,
    description:
      'What a non-zero `affected` MEANS. `retrospective` sizes whose stored numbers changed ' +
      'meaning when a release landed — the work is not wrong now, and the count says who to tell. ' +
      '`prospective` sizes a defect that is still live. A registry literal from a closed union, ' +
      'never data: it is a property of the question, not of this installation.',
  })
  nature!: DiagnosticNature;

  @ApiProperty({ description: 'How many of those rows answer the question.' })
  affected!: number;

  @ApiProperty({
    description:
      'How many distinct plans those rows fall in. Deliberately a COUNT and never a list: the ids ' +
      'are the whole disclosure ADR-0086 D6 protects, and the customer-facing conversation belongs ' +
      'to the planner, from inside their own organisation.',
  })
  affectedPlans!: number;

  @ApiProperty({ description: 'How many distinct organisations those rows fall in.' })
  affectedOrganizations!: number;

  @ApiProperty({
    description:
      'Wall-clock milliseconds for this entry’s two aggregates. Reported so the reader can see ' +
      'what the press cost — the quantity the route’s rate limit is derived against.',
  })
  elapsedMs!: number;
}

/** The whole response. `TransformInterceptor` adds the `{ data }` envelope around this. */
export class StaffDiagnosticsDto {
  @ApiProperty({
    format: 'date-time',
    description:
      'The SERVER clock at the moment the run started, never the browser’s. The copy block pastes ' +
      'this into a measurement record, where a client-set timestamp would be unfalsifiable.',
  })
  takenAt!: string;

  @ApiProperty({
    description:
      'The API version that produced these numbers. Server-set — a browser cannot observe it — and ' +
      'it is what makes a pasted result comparable with one taken a release later.',
  })
  apiVersion!: string;

  @ApiProperty({ type: [StaffDiagnosticRowDto] })
  diagnostics!: StaffDiagnosticRowDto[];
}
