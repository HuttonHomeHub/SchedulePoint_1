import { ApiProperty } from '@nestjs/swagger';

/** The answer to a crash report: a display reference, or null when nothing was stored or counted. */
export class CrashReportResponseDto {
  @ApiProperty({
    type: String,
    nullable: true,
    example: '7F3A9C',
    description:
      'Six upper-case hex characters naming the stored row, or null when the report was unusable, ' +
      'the table is full for new kinds of crash, or the write failed. Display only; not unique.',
  })
  reference!: string | null;
}
