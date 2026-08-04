import {
  ValidatorConstraint,
  type ValidationArguments,
  type ValidatorConstraintInterface,
} from 'class-validator';

/** The shape this constraint reads off the DTO. Narrow, so it cannot be pointed at anything else. */
interface DateRangeQuery {
  from?: unknown;
  to?: unknown;
}

/**
 * `from` must not be later than `to` on the audit reads (ADR-0073).
 *
 * An inverted range is **rejected**, not silently normalised by swapping the two. Swapping would
 * answer a question the caller did not ask and would return a page they cannot distinguish from
 * the one they wanted — the same class of quiet wrongness as a filter that matches nothing. And an
 * audit log is the last place to guess at intent: "show me everything between the 4th and the 1st"
 * is a mistake worth surfacing, because the caller is usually reconstructing an incident.
 *
 * Both bounds are inclusive, so `from === to` is legal and means "that instant exactly".
 *
 * Only the ORDER is checked here. Whether each value parses is `@IsISO8601`'s job, and this
 * constraint returns true when either is absent or unparseable so a malformed date produces one
 * clear message about its own field rather than two about different things.
 */
@ValidatorConstraint({ name: 'fromIsBeforeTo', async: false })
export class FromIsBeforeTo implements ValidatorConstraintInterface {
  validate(_value: unknown, args: ValidationArguments): boolean {
    const { from, to } = args.object as DateRangeQuery;
    if (typeof from !== 'string' || typeof to !== 'string') return true;

    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return true;

    return fromMs <= toMs;
  }

  defaultMessage(): string {
    return 'to must not be earlier than from.';
  }
}
