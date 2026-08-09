import { ApiProperty } from '@nestjs/swagger';

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

/**
 * Is mail working, and if not, since when?
 *
 * The one question the console exists to answer without a shell. Counts first, because
 * "is it broken **now**" is answered by a number and not by a list.
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
}
