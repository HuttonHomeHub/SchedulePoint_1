import { RESOURCE_COLLISION_RESOLUTIONS } from '@repo/interchange';
import { ValidatorConstraint, type ValidatorConstraintInterface } from 'class-validator';

/**
 * The sentinel a malformed JSON string becomes on the way in. It is an object, so `@IsObject()` lets
 * it through to this constraint, which then rejects it — which is what puts the failure in the
 * caller's 422 body under the right field name rather than in a stack trace from `JSON.parse`.
 */
export const RESOLUTIONS_UNPARSEABLE = { __unparseable__: '' };

/**
 * `resourceResolutions` must be a flat `{ [resourceKey]: 'REUSE_EXISTING' | 'CREATE_COPY' }` map.
 *
 * The keys are NOT validated against the dry-run's report — they cannot be, because the commit
 * re-parses the file and re-probes the library, and that in-transaction pass is the authoritative one
 * (the library may have changed since the planner reviewed). An answer for a key that no longer
 * collides is simply inert; a collision with no answer is refused by the service with
 * `UNRESOLVED_RESOURCE_COLLISIONS`. This constraint owns only the SHAPE.
 */
@ValidatorConstraint({ name: 'isResourceResolutionMap', async: false })
export class IsResourceResolutionMap implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === RESOLUTIONS_UNPARSEABLE) return false;
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    return Object.entries(value).every(
      ([key, resolution]) =>
        key.length > 0 &&
        typeof resolution === 'string' &&
        (RESOURCE_COLLISION_RESOLUTIONS as readonly string[]).includes(resolution),
    );
  }

  defaultMessage(): string {
    return `resourceResolutions must be a JSON object mapping each resourceKey to one of: ${RESOURCE_COLLISION_RESOLUTIONS.join(', ')}.`;
  }
}
