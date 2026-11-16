import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * The token from the fragment of the emailed reset link, in the body and never the URL so it stays
 * out of access logs and `Referer` headers. Bounds match the email-verification confirm DTO.
 */
export class CheckPasswordResetDto {
  @ApiProperty({ description: 'The token from the fragment of the emailed reset link.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  token!: string;
}

export class PasswordResetCheckDto {
  @ApiProperty({
    description:
      'True when the reset POST would accept this token now. One answer for a link that never existed, expired, was used, or names a deleted account.',
  })
  usable!: boolean;
}
