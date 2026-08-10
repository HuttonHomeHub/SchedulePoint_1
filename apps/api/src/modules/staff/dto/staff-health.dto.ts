import { ApiProperty } from '@nestjs/swagger';

import {
  RETENTION_TABLES,
  type RetentionTable,
} from '../../../common/operational/retention-policy';

/** One failed or abandoned send, as the console shows it. */
export class MailFailureDto {
  @ApiProperty() id!: string;
  @ApiProperty() occurredAt!: string;
  @ApiProperty({ enum: ['invitation', 'email_verification', 'password_reset', 'test'] })
  kind!: string;
  @ApiProperty({ enum: ['FAILED', 'ABANDONED'] }) outcome!: string;
  @ApiProperty({
    nullable: true,
    description:
      'The full recipient address (CQ-1). Null once erased — ADR-0085 D1 anonymises the actor, and ' +
      'this table is ordinary precisely so that scrub can reach it.',
  })
  recipient!: string | null;
  @ApiProperty({ nullable: true }) errorClass!: string | null;
}

/** One table's retention state, as the console shows it (ADR-0087). */
export class RetentionTableDto {
  @ApiProperty({
    // The vocabulary is closed and already enumerable at runtime — `RETENTION_TABLES` is a `const`
    // array for exactly this reason (the `MAIL_EVENT_KINDS` / `AUDIT_ACTIONS` pattern), and the
    // sibling `MailFailureDto` above already declares its bounded fields this way. A bare `string`
    // would describe an open set the sweep structurally cannot produce.
    enum: RETENTION_TABLES,
    description: 'The table name, exactly as it exists in the database.',
  })
  table!: RetentionTable;

  @ApiProperty({ description: 'The configured period in days.' })
  retentionDays!: number;

  @ApiProperty({
    nullable: true,
    description:
      'When the oldest surviving row was last written. Null means the table is EMPTY — which the ' +
      'surface must render as "no rows" rather than "0 days", since a measurement of zero and the ' +
      'absence of anything to measure are different facts.',
  })
  oldestAt!: string | null;

  @ApiProperty({
    nullable: true,
    description:
      'The age in whole days of the oldest surviving row, or null when the table is empty.',
  })
  oldestAgeDays!: number | null;

  @ApiProperty({
    description:
      'Whether the oldest surviving row is older than the period plus one sweep interval. ' +
      'DERIVED from the data rather than from the sweep\u2019s own bookkeeping, so it is true whether ' +
      'or not any sweep has ever run.',
  })
  overdue!: boolean;

  @ApiProperty({
    nullable: true,
    description:
      'How many rows this process last deleted from this table, or null if it has not swept.',
  })
  lastDeleted!: number | null;

  @ApiProperty({
    description:
      'Whether the last run hit the per-run cap, so a backlog remains that later runs will take.',
  })
  cappedOut!: boolean;

  @ApiProperty({
    description:
      'Whether the last run failed for this table — including a run that threw before it reached ' +
      'any table, which reports no per-table result at all and would otherwise be indistinguishable ' +
      'from never having swept.',
  })
  failed!: boolean;
}

/**
 * Is retention being honoured, and can a dead sweep be told from an idle one? (ADR-0087)
 *
 * **The leading signal is derived, not reported.** A last-run timestamp alone cannot distinguish
 * "the sweep is working" from "the sweep never armed" — the inverted-signal problem `HeartbeatService`
 * exists to solve one layer out, and the reason `RetentionStatusStore` is explicitly not the panel's
 * primary answer. So `overdue` is computed from the age of the oldest surviving row against the
 * configured period, which is a fact about the database and true whether or not this code ever ran.
 *
 * `processStartedAt` is here for the same reason: a null `lastRunAt` means something different two
 * minutes after boot than it does three days after boot, and the console has to be able to say which.
 */
export class RetentionDto {
  @ApiProperty({ description: 'Whether the sweep is enabled at all. False means no timer exists.' })
  enabled!: boolean;

  @ApiProperty({ description: 'The configured interval between sweeps, in minutes.' })
  intervalMinutes!: number;

  @ApiProperty({ description: 'When this API process started.' })
  processStartedAt!: string;

  @ApiProperty({
    nullable: true,
    description:
      'When this process last swept, or null if it has not. Read against processStartedAt: the ' +
      'store is in memory and resets on restart, so null is a statement about this process only.',
  })
  lastRunAt!: string | null;

  @ApiProperty({ description: 'How many consecutive runs have failed. Zero after any clean run.' })
  consecutiveFailures!: number;

  @ApiProperty({ type: [RetentionTableDto] })
  tables!: RetentionTableDto[];
}

/**
 * Is mail working, and if not, since when?
 *
 * The one question the console exists to answer without a shell. Counts first, because
 * "is it broken **now**" is answered by a number and not by a list.
 *
 * **It also carries retention**, which its name does not suggest (ADR-0087, spec §4.6). That is
 * deliberate: retention is health, and a second route would earn its own census entry and write a
 * second `staff.panel_read` row every time the page loads — buying a tidier name with a noisier
 * audit log. The DTO says so here rather than leaving the next reader to wonder.
 */
export class StaffHealthDto {
  @ApiProperty({ description: 'Failures in the last 24 hours.' })
  failuresLast24h!: number;

  @ApiProperty({ description: 'Failures in the last hour — the "is it broken now" number.' })
  failuresLastHour!: number;

  @ApiProperty({
    nullable: true,
    description: 'When mail last failed, or null if it never has.',
  })
  lastFailureAt!: string | null;

  @ApiProperty({
    description:
      'Whether a transport is configured at all. False means every send is being LOGGED rather ' +
      'than sent, which produces zero failures and is not the same as healthy — the distinction ' +
      'the count alone cannot make.',
  })
  transportConfigured!: boolean;

  @ApiProperty({ description: 'Whether MAIL_ALERT_URL is set, so a failure would reach somebody.' })
  alertingConfigured!: boolean;

  @ApiProperty({ description: 'Whether HEARTBEAT_URL is set.' })
  heartbeatConfigured!: boolean;

  @ApiProperty({ type: [MailFailureDto], description: 'The most recent failures, newest first.' })
  recentFailures!: MailFailureDto[];

  @ApiProperty({
    type: RetentionDto,
    description: 'Whether retention is being honoured (ADR-0087).',
  })
  retention!: RetentionDto;
}
