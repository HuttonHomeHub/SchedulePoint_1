import { BadRequestException, Injectable, type PipeTransform } from '@nestjs/common';

/**
 * Version-agnostic UUID matcher. Our IDs are UUID v7 (time-ordered); some
 * `class-validator`/`ParseUUIDPipe` versions only accept v1–v5, so we validate
 * the canonical UUID shape directly to avoid rejecting valid v7 ids.
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
