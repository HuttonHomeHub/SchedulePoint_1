import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * Query params for the multiple-float-paths analysis (ADR-0035 §19). `target` is the activity the
 * paths run into (required); `maxPaths` bounds how many ranked contiguous chains are returned.
 */
export class FloatPathsQueryDto {
  @ApiProperty({ format: 'uuid', description: 'The activity the float paths run into.' })
  @IsUUID()
  target!: string;

  @ApiPropertyOptional({
    minimum: 1,
    maximum: 50,
    default: 10,
    description: 'Maximum number of ranked paths to return (path 0 is the driving path).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  maxPaths = 10;
}
