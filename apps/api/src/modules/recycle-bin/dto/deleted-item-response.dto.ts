import { ApiProperty } from '@nestjs/swagger';
import type { DeletedHierarchyItem, DeletedItemBlocker } from '@repo/types';

/**
 * The ancestor standing between a deleted row and its restore.
 *
 * **A class, not an inline shape**, and that is not style: `@nestjs/swagger` cannot emit a usable
 * nested schema from a bare interface type with `nullable: true` — it needs a class to reflect over
 * and a `type:` to point at. The precedent is `DependencyEndpointDto`
 * (`modules/dependencies/dto/dependency-response.dto.ts`), and ADR-0053 M6 records a missing
 * declaration of exactly this kind as a real finding rather than a tidiness one.
 */
export class DeletedItemBlockerDto implements DeletedItemBlocker {
  @ApiProperty({
    enum: ['client', 'project'],
    description:
      'Never `plan` — a plan has no hierarchy descendants, so it can block nothing. Typed to the ' +
      'two values that are reachable so a consumer need not handle an impossible third.',
  })
  kind!: 'client' | 'project';

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      "The BLOCKER's own deletion — the batch a reader must restore, which is not this row's.",
  })
  deleteBatchId!: string | null;
}

/** Public representation of one soft-deleted hierarchy row in the recycle bin. */
export class DeletedItemResponseDto implements DeletedHierarchyItem {
  @ApiProperty({
    enum: ['client', 'project', 'plan'],
    description: 'Which hierarchy level this is.',
  })
  kind!: 'client' | 'project' | 'plan';

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'date-time' })
  deletedAt!: string;

  @ApiProperty({
    description: 'False when an ancestor is still deleted — restore the parent first.',
  })
  canRestore!: boolean;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'The deletion this row was part of (ADR-0096). A cascade stamps one id on every row it ' +
      'touches and the restore is keyed on that value, so rows sharing this id come back together ' +
      'and are presented as one entry. Null only for a row deleted before the batch id existed.',
  })
  deleteBatchId!: string | null;

  @ApiProperty({
    type: DeletedItemBlockerDto,
    nullable: true,
    description:
      'The still-deleted ancestor blocking this row, or null. **Per row, not per group**: a ' +
      'descendant deleted in the SAME cascade also carries one — its own batch root — because it ' +
      'is computed from the immediate parent. Only the group root’s blocker is a real ' +
      'obstacle; reading this per row re-creates the noise ADR-0096 removes.',
  })
  blockedBy!: DeletedItemBlockerDto | null;
}
