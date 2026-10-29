import type { CodeValueSummary } from '@repo/types';

type NamedValue = Pick<CodeValueSummary, 'shortCode' | 'description'>;

/**
 * What a value is called wherever it is read as a name: its description, else its short code. One
 * rule, so a value reads the same in a cell, a history line and, from M4, a swimlane (the owner's
 * swimlane-name decision, `spec.md` Answered).
 */
export function codeValueName(value: NamedValue): string {
  return value.description ?? value.shortCode;
}

/**
 * A value in a list of choices: the short code leads, because it is what P6 users type, then the
 * description when there is one — "L1 — Level 1".
 */
export function codeValueOptionLabel(value: NamedValue): string {
  return value.description === null ? value.shortCode : `${value.shortCode} — ${value.description}`;
}
