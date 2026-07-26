import type { CalendarScope } from '@prisma/client';
import {
  registerDecorator,
  type ValidationArguments,
  type ValidationOptions,
} from 'class-validator';

/**
 * The calendar tier and its owning project must agree (ADR-0053 §1): `scope: 'PROJECT'`
 * needs a `projectId`, and `scope: 'ORG'` must not carry one. Reads both fields off the
 * payload (not the decorated value) so it behaves identically whichever field it is applied
 * to — apply it to BOTH, since an omitted optional field skips its own validators and the
 * check must live on whichever side is present.
 *
 * This is the first of three lines of defence for the same invariant: the DTO (422 with a
 * field-level message), the service (`CALENDAR_SCOPE_PROJECT_MISMATCH`, so a non-HTTP caller
 * cannot bypass it), and `ck_calendars_scope_parent` in the database (fail-closed, the last
 * word). On an update, `scope` may legitimately be absent (re-homing a project calendar by
 * `projectId` alone), so an absent `scope` never fails here — the service resolves the
 * effective pair against the stored row.
 */
export function IsCalendarScopePaired(options?: ValidationOptions) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isCalendarScopePaired',
      target: object.constructor,
      propertyName,
      ...(options ? { options } : {}),
      validator: {
        validate(_value: unknown, args: ValidationArguments): boolean {
          const payload = args.object as { scope?: CalendarScope; projectId?: string | null };
          const { scope } = payload;
          if (scope === undefined) return true;
          const hasProject = payload.projectId !== undefined && payload.projectId !== null;
          return scope === 'PROJECT' ? hasProject : !hasProject;
        },
        defaultMessage(): string {
          return 'scope PROJECT requires a projectId; scope ORG must not have one.';
        },
      },
    });
  };
}
