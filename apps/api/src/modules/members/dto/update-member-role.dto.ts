import { ApiProperty } from '@nestjs/swagger';
import { ORGANIZATION_ROLES, type OrganizationRole } from '@repo/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, Min } from 'class-validator';

/** Request body to change a member's role (with the expected version for locking). */
export class UpdateMemberRoleDto {
  @ApiProperty({
    enum: ORGANIZATION_ROLES,
    description: 'The new role (External Guest is not valid).',
  })
  @IsIn([...ORGANIZATION_ROLES])
  role!: OrganizationRole;

  @ApiProperty({ minimum: 1, description: 'Optimistic-locking version from the last read.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  version!: number;
}
