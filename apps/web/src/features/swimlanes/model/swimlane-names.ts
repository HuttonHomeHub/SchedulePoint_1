/** The API's bounds (`CreateSwimlaneDto`, `SWIMLANE_LIMIT`): checked here so a refusal is a sentence beside the field, not a 422. */
export const SWIMLANE_NAME_MAX = 80;
export const SWIMLANE_LIMIT = 100;

// Control characters are refused by the API (`NO_CONTROL_CHARACTERS`); a pasted tab or NUL is the realistic way in.
// eslint-disable-next-line no-control-regex -- matching control characters is the point.
const CONTROL_CHARACTERS = /[\u0000-\u001F\u007F-\u009F]/;

const fold = (name: string): string => name.trim().toLowerCase();

/**
 * Why one name cannot be used, or `null`. `others` are the plan's other active swimlane names: the
 * server compares **ignoring case** (`docs/API.md` "Swimlanes"), so this does too.
 */
export function swimlaneNameProblem(name: string, others: readonly string[]): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Enter a name.';
  if (trimmed.length > SWIMLANE_NAME_MAX) {
    return `Use ${String(SWIMLANE_NAME_MAX)} characters or fewer.`;
  }
  if (CONTROL_CHARACTERS.test(trimmed)) return 'Remove the control characters.';
  if (others.some((other) => fold(other) === fold(trimmed))) {
    return `A swimlane called “${trimmed}” already exists.`;
  }
  return null;
}

export interface ParsedSwimlaneNames {
  /** Trimmed, in the order typed, empty lines dropped. */
  names: string[];
  /** One sentence per problem, each naming the line it is about. Empty when the list can be created. */
  problems: string[];
}

/**
 * The setup dialog's text: one swimlane per line. Blank lines are ignored, so a trailing newline is not
 * a problem. A name that repeats an earlier line, or one the plan already has, is named in the
 * problems rather than silently dropped — dropping it would create fewer swimlanes than the planner
 * typed with nothing saying so.
 */
export function parseSwimlaneNames(text: string, existing: readonly string[]): ParsedSwimlaneNames {
  const names = text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  const problems: string[] = [];
  const seen: string[] = [...existing];
  for (const name of names) {
    const problem = swimlaneNameProblem(name, seen);
    if (problem !== null)
      problems.push(problem === 'Enter a name.' ? problem : `“${name}”: ${problem}`);
    seen.push(name);
  }
  if (existing.length + names.length > SWIMLANE_LIMIT) {
    problems.push(`A plan holds at most ${String(SWIMLANE_LIMIT)} swimlanes.`);
  }
  return { names, problems };
}
