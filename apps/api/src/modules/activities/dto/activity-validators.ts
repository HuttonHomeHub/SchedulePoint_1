import type { ActivityType } from '@prisma/client';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

const MILESTONE_TYPES: readonly ActivityType[] = ['START_MILESTONE', 'FINISH_MILESTONE'];

/**
 * A milestone (start/finish) is a point in time, so its duration must be 0.
 * Applied to `durationDays`; validates only when `type` is present in the same
 * payload (a definition update that doesn't change `type` can't be checked here —
 * the service coerces milestone durations to 0 defensively).
 */
export function IsZeroWhenMilestone(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isZeroWhenMilestone',
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const type = (args.object as { type?: ActivityType }).type;
          if (type === undefined || !MILESTONE_TYPES.includes(type)) return true;
          return value === undefined || value === 0;
        },
        defaultMessage(): string {
          return 'durationDays must be 0 for a milestone activity.';
        },
      },
    });
  };
}

/**
 * A schedule constraint needs both its type and its date, or neither — you cannot
 * set one without the other. Reads both fields off the payload (not the decorated
 * value) so it behaves the same whichever field it is applied to; treats
 * `null`/`undefined` as absent, so sending both as `null` (to clear) is valid, but
 * setting only one is rejected. Apply it to BOTH `constraintType` and
 * `constraintDate`: an omitted optional field skips its own validators, so the
 * check must live on whichever side is present to catch a lone value.
 */
export function IsConstraintPaired(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isConstraintPaired',
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as { constraintType?: unknown; constraintDate?: unknown };
          const hasType = obj.constraintType !== undefined && obj.constraintType !== null;
          const hasDate = obj.constraintDate !== undefined && obj.constraintDate !== null;
          return hasType === hasDate;
        },
        defaultMessage(): string {
          return 'constraintType and constraintDate must be set together (or both cleared).';
        },
      },
    });
  };
}
