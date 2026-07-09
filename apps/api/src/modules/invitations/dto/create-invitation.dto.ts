import { ApiProperty } from '@nestjs/swagger';
import { ORGANIZATION_ROLES, type OrganizationRole } from '@repo/types';
import { Transform } from 'class-transformer';
import { IsEmail, IsIn, MaxLength } from 'class-validator';

/** Request body to invite someone to an organisation with a role. */
export class CreateInvitationDto {
  @ApiProperty({ format: 'email', maxLength: 254 })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email!: string;

  @ApiProperty({
    enum: ORGANIZATION_ROLES,
    description: 'Role to grant (External Guest is not valid).',
  })
  @IsIn([...ORGANIZATION_ROLES])
  role!: OrganizationRole;
}
