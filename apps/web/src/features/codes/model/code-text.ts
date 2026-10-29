import { CODE_DESCRIPTION_MAX, CODE_NAME_MAX, CODE_SHORT_CODE_MAX } from '@repo/types';

// Control characters are refused by the API (`NO_CONTROL_CHARACTERS`, which also counts the line and
// paragraph separators and the interlinear marks); a pasted tab or newline is the realistic way in.
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F\u2028\u2029\uFFF9-\uFFFB]/;

const fold = (text: string): string => text.trim().toLowerCase();

const taken = (others: readonly string[], text: string): boolean =>
  others.some((other) => fold(other) === fold(text));

/**
 * Why one code type's name cannot be used, or `null`. `others` are the plan's other live type names:
 * the server compares **ignoring case** (`docs/API.md` "Codes"), so this does too. The limits are the
 * shared ones in `@repo/types`, so the form and the DTO read one number.
 */
export function typeNameProblem(name: string, others: readonly string[]): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name.';
  if (trimmed.length > CODE_NAME_MAX) return `Use ${String(CODE_NAME_MAX)} characters or fewer.`;
  if (CONTROL_CHARACTERS.test(trimmed)) return 'Remove the control characters.';
  if (taken(others, trimmed)) return `A code type called “${trimmed}” already exists.`;
  return null;
}

export interface ValueProblems {
  shortCode: string | null;
  description: string | null;
}

/**
 * Why a value's short code or description cannot be used. `others` are the type's other live short
 * codes (case-insensitive, as the server compares them). A blank description is not a problem: it is
 * stored as none.
 */
export function valueProblems(
  input: { shortCode: string; description: string },
  others: readonly string[],
  typeName: string,
): ValueProblems {
  const shortCode = input.shortCode.trim();
  const description = input.description.trim();
  let shortCodeProblem: string | null = null;
  if (shortCode === '') shortCodeProblem = 'Enter a short code.';
  else if (shortCode.length > CODE_SHORT_CODE_MAX) {
    shortCodeProblem = `Use ${String(CODE_SHORT_CODE_MAX)} characters or fewer.`;
  } else if (CONTROL_CHARACTERS.test(shortCode)) {
    shortCodeProblem = 'Remove the control characters.';
  } else if (taken(others, shortCode)) {
    shortCodeProblem = `${typeName} already has a value “${shortCode}”.`;
  }
  let descriptionProblem: string | null = null;
  if (description.length > CODE_DESCRIPTION_MAX) {
    descriptionProblem = `Use ${String(CODE_DESCRIPTION_MAX)} characters or fewer.`;
  } else if (CONTROL_CHARACTERS.test(description)) {
    descriptionProblem = 'Remove the control characters.';
  }
  return { shortCode: shortCodeProblem, description: descriptionProblem };
}

export const hasValueProblem = (problems: ValueProblems): boolean =>
  problems.shortCode !== null || problems.description !== null;
