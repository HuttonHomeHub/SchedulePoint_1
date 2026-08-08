import { ApiProperty } from '@nestjs/swagger';

/**
 * What a bulk delete swept, and the thread that ties it together.
 *
 * The `deleteBatchId` is the point of the response rather than a diagnostic: it is what the client
 * hands back to `POST …/activities/restore-batch/:batchId` to undo the whole gesture id-stably,
 * which is the only way the dependencies between the deleted activities survive (CQ-4).
 */
export class BulkDeleteResultDto {
  @ApiProperty({
    format: 'uuid',
    description: 'The batch every swept row was stamped with. Pass it to restore-batch to undo.',
  })
  deleteBatchId!: string;

  @ApiProperty({ description: 'Activities soft-deleted (the batch is leaf-only, so no subtrees).' })
  activityCount!: number;

  @ApiProperty({ description: 'Dependencies soft-deleted alongside them.' })
  dependencyCount!: number;

  static from(result: {
    deleteBatchId: string;
    activityCount: number;
    dependencyCount: number;
  }): BulkDeleteResultDto {
    const dto = new BulkDeleteResultDto();
    dto.deleteBatchId = result.deleteBatchId;
    dto.activityCount = result.activityCount;
    dto.dependencyCount = result.dependencyCount;
    return dto;
  }
}
