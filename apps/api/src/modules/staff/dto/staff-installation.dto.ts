import { ApiProperty } from '@nestjs/swagger';

/**
 * What this installation is running and how it is configured.
 *
 * **Every field is an explicit, named scalar. Nothing here is derived from the config object by
 * omission**, and that is the rule rather than a style: `MAIL_SMTP_URL` is
 * `smtps://user:PASSWORD@host:port`, so a response built by spreading config and deleting the
 * fields somebody remembered publishes a live password the first time a field is added. It is the
 * `smtpEndpoint` rule (`mail-bootstrap.service.ts:14-24`) — "a new object with two scalars … so a
 * future field cannot arrive by accident" — applied to a response instead of a log line, and a test
 * asserts the response contains no substring of any configured secret.
 */
export class StaffInstallationDto {
  @ApiProperty({ description: "The API's package version." })
  apiVersion!: string;

  @ApiProperty({ description: 'production | development | test.' })
  environment!: string;

  @ApiProperty({ description: 'Whether a verified email is required to use an account.' })
  requireEmailVerification!: boolean;

  @ApiProperty({ description: 'Whether the plan edit-lock is enforced server-side (ADR-0028).' })
  planEditLockEnforced!: boolean;

  @ApiProperty({
    description: 'Mail transport host and port — never the credential.',
    nullable: true,
  })
  mailHost!: string | null;

  @ApiProperty({ description: 'Whether a mail-failure alert URL is configured.' })
  mailAlertingConfigured!: boolean;

  @ApiProperty({ description: 'Whether a heartbeat target is configured.' })
  heartbeatConfigured!: boolean;

  @ApiProperty({ description: 'How many addresses may reach this console.' })
  staffCount!: number;
}

/** An account that has not proved it controls its address. */
export class UnverifiedAccountDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The address (CQ-1: staff may read one).' }) email!: string;
  @ApiProperty() createdAt!: string;
}

/**
 * Who cannot sign in, and how many.
 *
 * The count is separate from the page because it answers a different question — "is this a
 * deployment-wide problem or one person?" — and a reader should not have to page to the end to
 * learn it.
 */
export class StaffAccountsDto {
  @ApiProperty({ description: 'Total accounts with an unverified address.' })
  unverifiedTotal!: number;

  @ApiProperty({ type: [UnverifiedAccountDto], description: 'Oldest first — the most stuck.' })
  unverified!: UnverifiedAccountDto[];

  @ApiProperty({ description: 'True when more rows exist beyond this page.' })
  hasMore!: boolean;

  @ApiProperty({
    nullable: true,
    description:
      'Pass as `?cursor=` to fetch the next page. Null on the last page. **This field is why the ' +
      'route is genuinely paginated**: `hasMore` alone told a caller more rows existed and gave ' +
      'them no way to ask for them — a capability declared and not honoured, which is TECH_DEBT ' +
      "#19's class of defect. Two independent reviews found it.",
  })
  nextCursor!: string | null;
}

/** One recorded staff action. */
export class StaffActivityRowDto {
  @ApiProperty() id!: string;
  @ApiProperty() occurredAt!: string;
  @ApiProperty() action!: string;
  @ApiProperty({ nullable: true }) actorLabel!: string | null;
  @ApiProperty({ nullable: true }) subjectLabel!: string | null;
}
