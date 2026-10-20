import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/**
 * The token from the emailed link, in the body and never the URL so it stays out of access logs
 * and `Referer` headers. 2048 is generous for a signed JWT carrying one address.
 */
export class ConfirmEmailVerificationDto {
  @ApiProperty({ description: 'The token from the fragment of the emailed verification link.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(2048)
  token!: string;
}

export class EmailVerificationConfirmedDto {
  @ApiProperty({ description: 'Always true: the address is verified, now or already.' })
  verified!: true;
}
