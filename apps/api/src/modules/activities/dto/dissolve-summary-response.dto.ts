import { ApiProperty } from '@nestjs/swagger';

/** One activity a dissolve promoted, at its **new** parent and version. */
export class PromotedActivityDto {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({
    format: 'uuid',
    nullable: true,
    description:
      'The summary’s own former parent — `null` when the promoted activity is now top-level.',
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
 * What a dissolve returns.
 *
 * Deliberately not a bare 204. Dissolving mutates rows the caller never named and could not have
 * predicted — the summary's children — and bumps each one's `version`. Returning only "it worked"
 * would leave every cached child silently stale, with the next save failing on a conflict the user
 * did nothing to cause. This is `docs/API.md`'s cross-resource-recompute rule applied to the WBS
 * tree, and the same shape the batch membership write already returns.
 */
export class DissolveSummaryResponseDto {
  @ApiProperty({
    type: [PromotedActivityDto],
    description:
      'The promoted children, in id order. Empty when the summary held nothing — dissolving an ' +
      'empty grouping is legal and simply removes it.',
  })
  promoted!: PromotedActivityDto[];
}
