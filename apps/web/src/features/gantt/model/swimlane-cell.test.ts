import { describe, expect, it, vi } from 'vitest';

import { swimlaneCellGate, swimlaneCellLabel } from './swimlane-cell';

import type {
  SwimlaneAssignment,
  SwimlaneColumnSource,
} from '@/features/tsld/model/swimlane-assignment';
import { SWIMLANES_FOLLOW_WBS_REASON } from '@/features/tsld/model/swimlane-assignment';

const assignment = (): SwimlaneAssignment => ({
  shown: true,
  choices: [
    { id: 'gf', name: 'Ground floor' },
    { id: null, name: 'No Area' },
  ],
  currentOf: (id) => (id === 'a' ? 'gf' : null),
  assign: vi.fn(),
});

const OPEN = { writable: true, readable: true, readOnly: false, reason: null };
const editing = { gateFor: vi.fn(() => OPEN) };

describe('swimlaneCellGate', () => {
  it('defers to the pen and role for hand-made swimlanes', () => {
    const swimlanes: SwimlaneColumnSource = { source: 'MANUAL', assignment: assignment() };
    expect(swimlaneCellGate(swimlanes, editing, 'a')).toBe(OPEN);
  });

  it('is shut with the WBS rule’s sentence, even for a writer', () => {
    expect(swimlaneCellGate({ source: 'WBS' }, editing, 'a')).toMatchObject({
      writable: false,
      reason: SWIMLANES_FOLLOW_WBS_REASON,
    });
  });

  it('is shut under a code source with the sentence that says where the value is written', () => {
    const gate = swimlaneCellGate(
      { source: 'ACTIVITY_CODE', assignment: assignment(), typeName: 'Area' },
      editing,
      'a',
    );
    expect(gate).toEqual({
      writable: false,
      readable: true,
      readOnly: true,
      reason: 'Swimlanes follow Area in this plan. Change it with Set code… or the editor’s Codes.',
    });
  });
});

describe('swimlaneCellLabel', () => {
  const code: SwimlaneColumnSource = {
    source: 'ACTIVITY_CODE',
    assignment: assignment(),
    typeName: 'Area',
  };

  it('names the value an activity is in, and reads null (a dash) for "No Area"', () => {
    expect(swimlaneCellLabel(code, 'a')).toBe('Ground floor');
    expect(swimlaneCellLabel(code, 'b')).toBeNull();
  });
});
