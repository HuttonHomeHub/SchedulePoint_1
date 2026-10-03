import { ApiProperty } from '@nestjs/swagger';

/** One resource a dissolve promoted, at its **new** parent and version. */
export class PromotedResourceDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'The dissolved group’s own former parent — `null` when the resource is now top-level.',
  })
  parentId!: string | null;

  @ApiProperty({
    description:
      'The optimistic-lock version AFTER the promotion. A client holding an older copy must use ' +
      'this, or its next save will 409.',
  })
  version!: number;
}

/**
 * What a group dissolve returns.
 *
 * Deliberately not a bare 204. Dissolving mutates rows the caller never named and could not have
 * predicted — the group's children — and bumps each one's `version`. Returning only "it worked"
 * would leave every cached child silently stale, with the next save failing on a conflict the user
 * did nothing to cause (`docs/API.md`'s cross-resource rule; the WBS dissolve's shape).
 */
export class DissolveResourceGroupResponseDto {
  @ApiProperty({
    type: [PromotedResourceDto],
    description:
      'The promoted children, in id order. Empty when the group held nothing — dissolving an ' +
      'empty group is legal and simply removes it.',
  })
  promoted!: PromotedResourceDto[];
}
