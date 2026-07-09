import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * The invitation token, passed in the request body (not the URL) so it is
 * redacted from logs (`req.body.token`) and not leaked via referrers.
 */
export class InvitationTokenDto {
  @ApiProperty({ description: 'The opaque invitation token from the invite link.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(256)
  token!: string;
}
