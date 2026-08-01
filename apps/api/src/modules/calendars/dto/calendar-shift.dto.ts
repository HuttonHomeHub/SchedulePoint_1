import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsInt,
  Max,
  Min,
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/** Minutes from local midnight; 1440 is 24:00 (a shift ending at midnight), never a wrap. */
const MINUTES_PER_DAY = 1440;

/**
 * One working window inside a day, as minutes from local midnight (ADR-0036 §2).
 *
 * A midnight-crossing night shift is **two adjacent-day windows**, not a wrap: 20:00–06:00 is
 * `{weekday: 0, 1200–1440}` plus `{weekday: 1, 0–360}`. That is the storage contract, and stating
 * it here is the difference between an author writing the shift they meant and one writing
 * `1200–360`, which has no meaning and which the ordering rule below would reject anyway.
 */
export class CalendarShiftDto {
  @ApiProperty({ minimum: 0, maximum: 6, description: '0 = Monday … 6 = Sunday.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(6)
  weekday!: number;

  @ApiProperty({ minimum: 0, maximum: MINUTES_PER_DAY, description: 'Minutes from midnight.' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY)
  startMinute!: number;

  @ApiProperty({
    minimum: 0,
    maximum: MINUTES_PER_DAY,
    description: 'Minutes from midnight; must be greater than startMinute.',
  })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY)
  endMinute!: number;
}

/** One working window inside a dated exception's replacement set — same contract, no weekday. */
export class CalendarExceptionWindowDto {
  @ApiProperty({ minimum: 0, maximum: MINUTES_PER_DAY })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY)
  startMinute!: number;

  @ApiProperty({ minimum: 0, maximum: MINUTES_PER_DAY })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(MINUTES_PER_DAY)
  endMinute!: number;
}

interface Window {
  weekday?: number;
  startMinute: number;
  endMinute: number;
}

/**
 * Windows must be non-empty, sorted and non-overlapping **within each day**.
 *
 * The engine asserts exactly this in `buildWorkingTimeCalendar` — but at *recalculation* time,
 * which means an overlapping pair authored on Monday surfaces as a failed schedule run on
 * Wednesday, pointing at the plan rather than at the calendar. Checking it at the boundary turns
 * that into a 422 naming the offending pair, which is the whole argument for validating at the DTO
 * rather than trusting the layer underneath to catch it eventually.
 */
export function AreWindowsOrdered(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'areWindowsOrdered',
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value)) return true; // shape is another validator's job
          const windows = value as Window[];
          if (windows.some((w) => w.endMinute <= w.startMinute)) return false;

          // Group by weekday so a shift array covering the whole week is checked day by day; the
          // exception form has no weekday and collapses to a single group, which is correct.
          const byDay = new Map<number, Window[]>();
          for (const w of windows) {
            const key = w.weekday ?? 0;
            byDay.set(key, [...(byDay.get(key) ?? []), w]);
          }
          for (const day of byDay.values()) {
            const sorted = [...day].sort((a, b) => a.startMinute - b.startMinute);
            // Deliberately compared against the CALLER's order too: an unsorted array is rejected
            // rather than quietly sorted, because storage is order-sensitive and silently
            // reordering an author's input hides which pair they got wrong.
            for (let i = 0; i < day.length; i += 1) {
              if (day[i] !== sorted[i]) return false;
              if (i > 0 && sorted[i]!.startMinute < sorted[i - 1]!.endMinute) return false;
            }
          }
          return true;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must be sorted and non-overlapping within each day, with startMinute < endMinute (a midnight-crossing shift is two adjacent-day windows, not a wrap).`;
        },
      },
    });
  };
}
