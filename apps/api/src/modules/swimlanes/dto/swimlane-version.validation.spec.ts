import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { ReorderSwimlanesDto } from './reorder-swimlanes.dto';
import { UpdateSwimlaneDto } from './update-swimlane.dto';

const ID = '0199c1a2-3b4c-7d5e-8f6a-1b2c3d4e5f60';
const MAX_INT = 2147483647;
const ok = (cls: new () => object, body: object): boolean =>
  validateSync(plainToInstance(cls, body)).length === 0;

describe('swimlane versions fit the INT column', () => {
  it('rename accepts the ceiling and refuses one above it', () => {
    expect(ok(UpdateSwimlaneDto, { name: 'A', version: MAX_INT })).toBe(true);
    expect(ok(UpdateSwimlaneDto, { name: 'A', version: MAX_INT + 1 })).toBe(false);
  });

  it('reorder accepts the ceiling and refuses one above it', () => {
    expect(ok(ReorderSwimlanesDto, { order: [{ id: ID, version: MAX_INT }] })).toBe(true);
    expect(ok(ReorderSwimlanesDto, { order: [{ id: ID, version: MAX_INT + 1 }] })).toBe(false);
  });
});
