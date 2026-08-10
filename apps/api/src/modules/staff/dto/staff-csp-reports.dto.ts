import { ApiProperty } from '@nestjs/swagger';

/** One distinct violation, with how often it has been seen. */
export class CspReportRowDto {
  @ApiProperty() id!: string;
  @ApiProperty({ description: 'The directive name, e.g. `script-src-elem`.' })
  effectiveDirective!: string;
  @ApiProperty({ description: 'What was blocked: a URL, or a keyword like `inline` or `eval`.' })
  blockedUri!: string;
  @ApiProperty() documentUri!: string;
  @ApiProperty({
    nullable: true,
    description:
      '`enforce` if the policy was live, `report` during an observing window, null if the ' +
      'reporter did not say. Part of the dedup key, so a report-only observation and a real ' +
      'block are never counted together.',
  })
  disposition!: string | null;
  @ApiProperty({ description: 'How many times this distinct violation has been reported.' })
  count!: number;
  @ApiProperty() firstSeenAt!: string;
  @ApiProperty() lastSeenAt!: string;
  @ApiProperty({
    nullable: true,
    description:
      'Where the offending code was. Names what to CHANGE, which the blocked URI often cannot: ' +
      "ADR-0074's report-only window found a violation from a dependency's own code.",
  })
  sourceFile!: string | null;
  @ApiProperty({ nullable: true }) lineNumber!: number | null;
  @ApiProperty({ nullable: true }) columnNumber!: number | null;
}
