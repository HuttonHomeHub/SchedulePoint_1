import { ApiProperty } from '@nestjs/swagger';
import type { PlanCodeLane, PlanCodeSwimlaneLanes } from '@repo/types';
import { IsUUID } from 'class-validator';

/** The query of the plan-wide code-lane read. */
export class CodeSwimlaneLanesQueryDto {
  @ApiProperty({ format: 'uuid', description: 'A live code type of this plan.' })
  @IsUUID()
  codeTypeId!: string;
}

export class PlanCodeLaneResponseDto implements PlanCodeLane {
  @ApiProperty({ format: 'uuid' })
  activityId!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    type: String,
    description: 'The value the lane belongs to; null is the "no value" band.',
  })
  codeValueId!: string | null;

  @ApiProperty({ minimum: 0, maximum: 10000 })
  laneIndex!: number;

  @ApiProperty({
    format: 'date-time',
    description: 'When the lane was last written; the tie-break when two placed members collide.',
  })
  updatedAt!: string;
}

export class PlanCodeSwimlaneLanesResponseDto implements PlanCodeSwimlaneLanes {
  @ApiProperty({ format: 'uuid' })
  codeTypeId!: string;

  @ApiProperty({
    type: PlanCodeLaneResponseDto,
    isArray: true,
    description:
      'Each live activity’s stored lane at its **current** basis under the type: its live value of ' +
      'it, or "no value" when it has none or the value is deleted. At most one per activity, ordered ' +
      'by activity id; an activity never placed at its basis has none. Rows for a basis an activity ' +
      'no longer has are stored but not sent.',
  })
  lanes!: PlanCodeLaneResponseDto[];
}
