import { ApiProperty } from '@nestjs/swagger';

/**
 * What `DELETE …/activities/:activityId` answers with (`docs/TECH_DEBT.md` #113).
 *
 * The route used to be `204 No Content`. The `deleteBatchId` it now carries has always existed —
 * `cascadeSoftDelete` assigns one per delete, covering the whole subtree when the activity is a
 * `WBS_SUMMARY` — but a bodiless response meant the client never learnt it, so it could not call
 * `POST …/activities/restore-batch` on the thing it had just deleted. That is why undoing a band
 * copy had no redo: the undo deletes the copy's root and lets the cascade run, and the redo needs
 * an id nobody was told.
 *
 * Additive rather than breaking: 204 → 200 with a body that existing callers ignore.
 */
export class DeleteActivityResultDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The batch this delete belongs to — pass it to `restore-batch` to bring back exactly these ' +
      'rows, including a summary’s whole cascaded subtree and the links between them.',
  })
  deleteBatchId!: string;
}
