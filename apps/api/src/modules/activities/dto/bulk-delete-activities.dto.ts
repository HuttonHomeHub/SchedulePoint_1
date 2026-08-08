import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

/** One activity to delete, with the version it was read at (optimistic locking). */
export class DeleteActivityRefDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  id!: string;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}

/**
 * Request body for the bulk delete: soft-delete several of a plan's activities as **one act**.
 *
 * Rows rather than parallel `ids`/`versions` arrays, matching the batch family: parallel arrays can
 * be different lengths, and the failure mode is silent — the twelfth id checked against the
 * eleventh version.
 *
 * The batch shares one `deleteBatchId`, so undoing it is one restore rather than twelve. A
 * `WBS_SUMMARY` is refused (422): deleting one sweeps its whole subtree (ADR-0038), which is not
 * something a multi-select gesture should be able to do by including one bar among forty.
 */
export class BulkDeleteActivitiesDto {
  @ApiProperty({ type: DeleteActivityRefDto, isArray: true, minItems: 1, maxItems: 2000 })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => DeleteActivityRefDto)
  activities!: DeleteActivityRefDto[];
}
