import { ApiProperty } from '@nestjs/swagger';

/**
 * One distinct screen crash (browser crash reports, ADR-0211).
 *
 * Every field is already cleaned by the ingest path, so this DTO holds no person, organisation,
 * address or full URL by construction: the table has no column for any of them.
 */
export class CrashReportRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({
    description:
      'Six upper-case hex characters, the start of the dedupe hash. What the fallback screen ' +
      'showed the person. Display only: not unique by contract.',
  })
  reference!: string;
  @ApiProperty({ enum: ['route', 'app'], description: 'Which boundary caught the crash.' })
  boundary!: string;
  @ApiProperty({ description: 'A constructor name, e.g. `TypeError`.' }) errorName!: string;
  @ApiProperty({ description: 'The cleaned message; may be empty.' }) message!: string;
  @ApiProperty({
    nullable: true,
    description: 'The router route pattern, never a resolved path. Null when no match was active.',
  })
  routePattern!: string | null;
  @ApiProperty() webVersion!: string;
  @ApiProperty({ description: '`chrome`, `edge`, `firefox`, `safari` or `other`.' })
  browser!: string;
  @ApiProperty({ nullable: true, type: 'integer' }) browserMajor!: number | null;
  @ApiProperty({ nullable: true, description: 'The cleaned stack, as text.' })
  stack!: string | null;
  @ApiProperty({ nullable: true, description: 'The cleaned React component stack, as text.' })
  componentStack!: string | null;
  @ApiProperty({ type: 'integer', description: 'How many times this crash was reported.' })
  count!: number;
  @ApiProperty() firstSeenAt!: string;
  @ApiProperty() lastSeenAt!: string;
}

export class CrashReportsMetaDto {
  @ApiProperty({ type: 'integer', description: 'Every stored crash, not only the rows returned.' })
  total!: number;
  @ApiProperty({ type: 'integer', description: 'The most distinct crashes ever stored.' })
  cap!: number;
  @ApiProperty({
    description:
      'True when the table holds `cap` rows. New kinds of crash are then NOT recorded until old ' +
      'ones expire; repeats of a stored crash are still counted.',
  })
  capReached!: boolean;
  @ApiProperty({
    type: 'integer',
    description: 'Distinct crashes last reported within the past 7 days: the console summary.',
  })
  seenLast7Days!: number;
}
