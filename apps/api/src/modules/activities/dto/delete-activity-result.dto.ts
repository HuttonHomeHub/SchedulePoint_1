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
 * **Not "additive" — the status code moved, 204 → 200.** This docblock said additive until the API
 * review pointed at the diff that disproved it: five of this repo's own e2e specs had to change
 * `.expect(204)` to `.expect(200)`, and any caller branching on the status, or a generated SDK that
 * treats 204 specially, breaks the same way. It is a non-additive, non-major contract change,
 * bumped **minor** under the pre-1.0 policy (CLAUDE.md §10) — which is the correct bump for a
 * different reason than the one first written down (ADR-0076: a claim that decides something
 * carries what established it, and "callers ignore the body" was never checked against the status
 * line).
 */
export class DeleteActivityResultDto {
  @ApiProperty({
    format: 'uuid',
    description:
      'The batch this delete belongs to — pass it to `restore-batch` to bring back exactly these ' +
      'rows, including a summary’s whole cascaded subtree and the links between them.',
  })
  deleteBatchId!: string;

  /** Mirrors `BulkDeleteResultDto.from` — the module's established shape for a receipt DTO. */
  static from(result: { deleteBatchId: string }): DeleteActivityResultDto {
    const dto = new DeleteActivityResultDto();
    dto.deleteBatchId = result.deleteBatchId;
    return dto;
  }
}
