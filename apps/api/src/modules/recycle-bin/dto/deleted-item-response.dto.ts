import { ApiProperty } from '@nestjs/swagger';
import type { CalendarScope, DeletedItem, DeletedItemBlocker, ResourceKind } from '@repo/types';

/**
 * What stands between a deleted row and its restore: a still-deleted parent, or a still-deleted
 * calendar the row's batch depends on (ADR-0195 D3).
 *
 * **A class, not an inline shape**, and that is not style: `@nestjs/swagger` cannot emit a usable
 * nested schema from a bare interface type with `nullable: true` — it needs a class to reflect over
 * and a `type:` to point at. The precedent is `DependencyEndpointDto`
 * (`modules/dependencies/dto/dependency-response.dto.ts`), and ADR-0053 M6 records a missing
 * declaration of exactly this kind as a real finding rather than a tidiness one.
 */
export class DeletedItemBlockerDto implements DeletedItemBlocker {
  @ApiProperty({
    enum: ['client', 'project', 'resource', 'calendar'],
    description:
      'Never `plan` — a plan has no descendants, so it can block nothing. `resource` is a deleted ' +
      'parent group; `calendar` is a deleted calendar a resource in the batch uses.',
  })
  kind!: 'client' | 'project' | 'resource' | 'calendar';

  @ApiProperty({
    enum: ['parent', 'calendar'],
    description:
      '`parent`: the row’s immediate parent is deleted, whatever batch it is in (so a group’s ' +
      'members keep a blocker inside their own batch and stay members). `calendar`: only ever ' +
      'served for a row with NO deleted parent — a group’s root — and names the first deleted ' +
      'calendar used anywhere in that row’s batch.',
  })
  relation!: 'parent' | 'calendar';

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

/** Public representation of one soft-deleted row in the recycle bin. */
export class DeletedItemResponseDto implements DeletedItem {
  @ApiProperty({
    enum: ['client', 'project', 'plan', 'resource', 'calendar'],
    description: 'Which hierarchy level, or which library, this is.',
  })
  kind!: 'client' | 'project' | 'plan' | 'resource' | 'calendar';

  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'The resource kind (`GROUP` makes it a resource group) or the calendar scope (`ORG` or ' +
      '`PROJECT`); null for a client, project or plan. For display only — never authorisation.',
  })
  subtype!: ResourceKind | CalendarScope | null;

  @ApiProperty({
    format: 'date-time',
    nullable: true,
    type: String,
    description:
      'When the retention timer WOULD permanently remove this row, or null when none ever does: a ' +
      'resource and an organisation calendar never expire, and a project calendar goes with its ' +
      'project. Served whether or not `meta.retentionActive`; a client still says nothing about ' +
      'expiry unless it is.',
  })
  expiresAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ format: 'date-time' })
  deletedAt!: string;

  @ApiProperty({
    description:
      'False when a parent is still deleted, or a resource’s calendar is — restore that first.',
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
      'The still-deleted parent (or calendar) blocking this row, or null. **Per row, not per group**: a ' +
      'descendant deleted in the SAME cascade also carries one — its own batch root — because it ' +
      'is computed from the immediate parent. Only the group root’s blocker is a real ' +
      'obstacle; reading this per row re-creates the noise ADR-0096 removes.',
  })
  blockedBy!: DeletedItemBlockerDto | null;
}
