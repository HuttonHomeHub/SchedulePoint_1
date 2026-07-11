import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

/**
 * Documents a **423 Locked** response in OpenAPI (ADR-0028). `@nestjs/swagger` has
 * no built-in shortcut for 423 (unlike `@ApiConflictResponse`), so this mirrors
 * that pattern for the plan edit-lock precondition. Apply it to every endpoint that
 * can return 423 — the edit-lock routes and the pen-gated structural writes — so
 * the generated spec carries the lock contract, not just prose.
 */
export function ApiLockedResponse(description = 'Plan edit-lock precondition failed.') {
  return applyDecorators(ApiResponse({ status: HttpStatus.LOCKED, description }));
}
