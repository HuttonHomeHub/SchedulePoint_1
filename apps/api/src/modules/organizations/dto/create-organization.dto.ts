import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

/** Request body for creating an organisation. The slug is derived server-side. */
export class CreateOrganizationDto {
  @ApiProperty({ minLength: 1, maxLength: 120, description: 'Display name of the organisation.' })
  @IsString()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
