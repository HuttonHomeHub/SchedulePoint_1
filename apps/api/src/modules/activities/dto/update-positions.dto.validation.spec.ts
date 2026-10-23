import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { UpdatePositionsDto } from './update-positions.dto';

const ID = '0199c1a2-3b4c-7d5e-8f6a-1b2c3d4e5f60';
const SW = '0199c1a2-3b4c-7d5e-8f6a-1b2c3d4e5f61';

const valid = (row: Record<string, unknown>): boolean =>
  validateSync(plainToInstance(UpdatePositionsDto, { positions: [row] }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).length === 0;

describe('UpdatePositionsDto', () => {
  it('accepts the pre-swimlane body: laneIndex and no swimlane', () => {
    expect(valid({ id: ID, laneIndex: 3, version: 1 })).toBe(true);
  });

  it('accepts the swimlane body, with or without a swimlaneId, and with a laneIndex too', () => {
    expect(valid({ id: ID, version: 1, swimlane: { laneIndex: 0 } })).toBe(true);
    expect(valid({ id: ID, version: 1, swimlane: { swimlaneId: SW, laneIndex: 9 } })).toBe(true);
    expect(valid({ id: ID, laneIndex: 2, version: 1, swimlane: { laneIndex: 4 } })).toBe(true);
  });

  it('needs at least one of laneIndex and swimlane', () => {
    expect(valid({ id: ID, version: 1 })).toBe(false);
  });

  it('refuses a null swimlane rather than reading it as "none"', () => {
    expect(valid({ id: ID, laneIndex: 1, version: 1, swimlane: null })).toBe(false);
  });

  it('bounds the in-swimlane lane like laneIndex (0 to 10,000)', () => {
    expect(valid({ id: ID, version: 1, swimlane: { laneIndex: -1 } })).toBe(false);
    expect(valid({ id: ID, version: 1, swimlane: { laneIndex: 10001 } })).toBe(false);
    expect(valid({ id: ID, version: 1, swimlane: { laneIndex: 10000 } })).toBe(true);
  });

  it('takes no basis from the client', () => {
    expect(valid({ id: ID, version: 1, swimlane: { laneIndex: 1, basis: 'WBS_SUMMARY' } })).toBe(
      false,
    );
  });

  it('refuses a malformed swimlaneId', () => {
    expect(valid({ id: ID, version: 1, swimlane: { swimlaneId: 'nope', laneIndex: 1 } })).toBe(
      false,
    );
  });
});
