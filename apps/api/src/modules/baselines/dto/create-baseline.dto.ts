import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Request body for capturing a baseline of a plan. Only the name is client input —
 * the snapshot (which activities, at what dates) is taken server-side from the plan's
 * currently-persisted computed schedule (ADR-0025), never supplied by the caller.
 */
export class CreateBaselineDto {
  @ApiProperty({ minLength: 1, maxLength: 120, description: 'Display name of the baseline.' })
  @IsString()
  @Transform(trim)
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;
}
