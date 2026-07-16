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
 * setting only one is rejected. Apply it to BOTH the type and date fields of a pair:
 * an omitted optional field skips its own validators, so the check must live on
 * whichever side is present to catch a lone value. `fields` names the pair — it
 * defaults to the primary `constraintType`/`constraintDate`, and the secondary pair
 * (ADR-0035 §10) passes its own field names so the same rule guards both.
 */
export function IsConstraintPaired(
  fields: { typeField: string; dateField: string } = {
    typeField: 'constraintType',
    dateField: 'constraintDate',
  },
  options?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isConstraintPaired',
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const obj = args.object as Record<string, unknown>;
          const typeValue = obj[fields.typeField];
          const dateValue = obj[fields.dateField];
          const hasType = typeValue !== undefined && typeValue !== null;
          const hasDate = dateValue !== undefined && dateValue !== null;
          return hasType === hasDate;
        },
        defaultMessage(): string {
          return `${fields.typeField} and ${fields.dateField} must be set together (or both cleared).`;
        },
      },
    });
  };
}
