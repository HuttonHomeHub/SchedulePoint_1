import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

/**
 * Version-agnostic UUID matcher. Our IDs are UUID v7 (time-ordered).
 *
 * **The original reason for hand-rolling this is now stale, and it is recorded rather than
 * quietly deleted.** This docblock said `ParseUUIDPipe` "only accept[s] v1–v5, so we validate
 * the canonical UUID shape directly to avoid rejecting valid v7 ids". Re-read at the 2026-09-16
 * reconciliation pass against the installed `@nestjs/common@11.2.3`, that is false twice over:
 * its options type is `'3' | '4' | '5' | '7'`, and its DEFAULT is `version = 'all'`, whose
 * pattern is `/^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}$/i` — the same
 * canonical shape `UUID_REGEX` below matches (`pipes/parse-uuid.pipe.js`, lines 37-52).
 *
 * So a bare `ParseUUIDPipe` would accept and reject exactly what this does. What differs is the
 * REJECTION MESSAGE, not the acceptance set, and every API e2e spec that asserts on a malformed-id
 * 400 is written against this one — which is why swapping them is a behaviour change to be measured
 * rather than a tidy-up to be done in a documentation pass (`docs/TECH_DEBT.md` #340).
 */
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validates a route/path parameter is a well-formed UUID (any version). */
@Injectable()
export class ParseUuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (typeof value !== 'string' || !UUID_REGEX.test(value)) {
      throw new BadRequestException('Parameter must be a valid UUID.');
    }
    return value;
  }
}
