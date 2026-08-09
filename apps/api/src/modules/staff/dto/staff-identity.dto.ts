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

  @ApiProperty({
    description:
      'Whether this account ALSO holds an organisation membership. ADR-0086 D4 permits dual-hatting ' +
      'rather than refusing it — refusing would lock the only staff member out on day one — and ' +
      'the compensation it named was that the console says which hat is active. That banner was ' +
      'decided and never shipped; this field is what makes it possible.',
  })
  dualHatted!: boolean;
}
