import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for creating a project. The parent client and organisation are
 * taken from the route/scope, never from the body (anti-IDOR).
 */
export class CreateProjectDto {
  @ApiProperty({ minLength: 1, maxLength: 200, description: 'Display name of the project.' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ maxLength: 2000, description: 'Optional free-text description.' })
  @IsOptional()
  @IsString()
  @Transform(trim)
  @MaxLength(2000)
  description?: string;
}
