import { ApiProperty } from '@nestjs/swagger';

/**
 * The calling staff identity.
 *
 * Deliberately thin: a user id and the address that matched the allowlist. There is no role, no
 * capability list and no organisation, because {@link StaffPrincipal} has none — the console
 * operates the installation and staff-ness confers nothing inside any organisation (ADR-0086 D1).
 * A capability list here would be the first place that stopped being true.
 */
export class StaffIdentityDto {
  @ApiProperty({ description: 'The staff member’s user id.' })
  userId!: string;

  @ApiProperty({ description: 'The normalised address that matched the allowlist.' })
  email!: string;
}
