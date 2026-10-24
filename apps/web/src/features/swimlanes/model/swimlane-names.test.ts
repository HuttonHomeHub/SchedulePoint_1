import { describe, expect, it } from 'vitest';

import {
  SWIMLANE_LIMIT,
  SWIMLANE_NAME_MAX,
  parseSwimlaneNames,
  swimlaneNameProblem,
} from './swimlane-names';

describe('swimlaneNameProblem', () => {
  it('accepts a plain name', () => {
    expect(swimlaneNameProblem('Civil', [])).toBeNull();
  });

  it('refuses blank, over-long and control-character names', () => {
    expect(swimlaneNameProblem('   ', [])).toBe('Enter a name.');
    expect(swimlaneNameProblem('x'.repeat(SWIMLANE_NAME_MAX + 1), [])).toMatch(/80 characters/);
    expect(swimlaneNameProblem('a\tb', [])).toMatch(/control characters/);
    expect(swimlaneNameProblem('x'.repeat(SWIMLANE_NAME_MAX), [])).toBeNull();
  });

  it('compares ignoring case and surrounding space, as the server does', () => {
    expect(swimlaneNameProblem(' civil ', ['Civil'])).toMatch(/already exists/);
  });
});

describe('parseSwimlaneNames', () => {
  it('reads one name per line, trimmed, ignoring blank lines', () => {
    expect(parseSwimlaneNames('Civil\n\n  Mechanical  \nElectrical\n', [])).toEqual({
      names: ['Civil', 'Mechanical', 'Electrical'],
      problems: [],
    });
  });

  it('names a repeat, rather than quietly creating fewer swimlanes than were typed', () => {
    const { problems } = parseSwimlaneNames('Civil\ncivil', []);
    expect(problems).toEqual(['“civil”: A swimlane called “civil” already exists.']);
  });

  it('names one the plan already has', () => {
    expect(parseSwimlaneNames('Civil', ['civil']).problems).toHaveLength(1);
  });

  it('stops at the plan limit', () => {
    const text = Array.from({ length: SWIMLANE_LIMIT + 1 }, (_, i) => `S${String(i)}`).join('\n');
    expect(parseSwimlaneNames(text, []).problems).toContain(
      `A plan holds at most ${String(SWIMLANE_LIMIT)} swimlanes.`,
    );
  });
});
