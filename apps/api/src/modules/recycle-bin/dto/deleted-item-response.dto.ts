import { ApiProperty } from '@nestjs/swagger';
import type { DeletedHierarchyItem } from '@repo/types';

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
}
