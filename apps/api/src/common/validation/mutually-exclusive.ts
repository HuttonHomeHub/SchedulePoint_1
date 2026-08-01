import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * Two fields express the same quantity in different units; a payload may carry one, not both.
 *
 * Introduced for the day↔minute pairs that close TECH_DEBT #78 (`durationDays`/`durationMinutes`,
 * `lagDays`/`lagMinutes`). The alternative — silently preferring one — is the failure mode worth
 * refusing: a client that sends `durationDays: 2` and `durationMinutes: 240` has a bug, and picking
 * a winner hides it behind a schedule that is quietly not what was asked for.
 *
 * Apply it to **both** fields of the pair. An omitted optional field skips its own validators, so a
 * rule that lived on only one side would not fire when that side was the absent one — the same
 * reason `IsConstraintPaired` is applied to both halves of its pair.
 */
export function IsMutuallyExclusiveWith(otherField: string, options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isMutuallyExclusiveWith',
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate(value: unknown, args: ValidationArguments): boolean {
          const other = (args.object as Record<string, unknown>)[otherField];
          // `null` is a deliberate clear on the update DTOs, not a value — treating it as present
          // would make "clear the minutes, set the days" a 422 for no reason.
          const hasThis = value !== undefined && value !== null;
          const hasOther = other !== undefined && other !== null;
          return !(hasThis && hasOther);
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} and ${otherField} are the same value in different units — send one, not both.`;
        },
      },
    });
  };
}
