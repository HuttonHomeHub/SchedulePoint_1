import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import {
  ActivityCodesRowDto,
  UpdateActivityCodesDto,
} from '../../activities/dto/update-activity-codes.dto';

import { CreateCodeTypeDto } from './create-code-type.dto';
import { CreateCodeValueDto } from './create-code-value.dto';
import { ReorderCodeTypesDto, ReorderCodeValuesDto } from './reorder-codes.dto';
import { UpdateCodeTypeDto } from './update-code-type.dto';
import { UpdateCodeValueDto } from './update-code-value.dto';

const ID = '0199c1a2-3b4c-7d5e-8f6a-1b2c3d4e5f60';
const MAX_INT = 2147483647;
const ok = (cls: new () => object, body: object): boolean =>
  validateSync(plainToInstance(cls, body)).length === 0;
const as = <T extends object>(cls: new () => T, body: object): T => plainToInstance(cls, body);

describe('code DTOs', () => {
  it('trim a name and a short code before they are checked', () => {
    expect(as(CreateCodeTypeDto, { name: '  Area ' }).name).toBe('Area');
    expect(as(CreateCodeValueDto, { shortCode: ' L1 ' }).shortCode).toBe('L1');
    expect(ok(CreateCodeTypeDto, { name: '   ' })).toBe(false);
  });

  it('bound a name and a short code at 80, and a description at 255', () => {
    expect(ok(CreateCodeTypeDto, { name: 'x'.repeat(80) })).toBe(true);
    expect(ok(CreateCodeTypeDto, { name: 'x'.repeat(81) })).toBe(false);
    expect(ok(CreateCodeValueDto, { shortCode: 'x'.repeat(81) })).toBe(false);
    expect(ok(CreateCodeValueDto, { shortCode: 'L', description: 'x'.repeat(255) })).toBe(true);
    expect(ok(CreateCodeValueDto, { shortCode: 'L', description: 'x'.repeat(256) })).toBe(false);
  });

  it('refuse a control character wherever the shape CHECK would', () => {
    expect(ok(CreateCodeTypeDto, { name: 'A\nB' })).toBe(false);
    expect(ok(CreateCodeValueDto, { shortCode: 'A\tB' })).toBe(false);
    expect(ok(CreateCodeValueDto, { shortCode: 'L', description: 'A\u0000B' })).toBe(false);
  });

  it.each([
    ['U+0000', '\u0000'],
    ['U+001F', '\u001F'],
    ['U+007F', '\u007F'],
    ['U+0085', '\u0085'],
    ['U+009F', '\u009F'],
    ['U+2028', '\u2028'],
    ['U+2029', '\u2029'],
    ['U+FFF9', '\uFFF9'],
    ['U+FFFA', '\uFFFA'],
    ['U+FFFB', '\uFFFB'],
  ])(
    'refuse %s in every text field, as the shape CHECK does (422, never a raw 500)',
    (_label, ch) => {
      expect(ok(CreateCodeTypeDto, { name: `A${ch}B` })).toBe(false);
      expect(ok(UpdateCodeTypeDto, { name: `A${ch}B`, version: 1 })).toBe(false);
      expect(ok(CreateCodeValueDto, { shortCode: `A${ch}B` })).toBe(false);
      expect(ok(CreateCodeValueDto, { shortCode: 'L', description: `A${ch}B` })).toBe(false);
      expect(ok(UpdateCodeValueDto, { shortCode: `A${ch}B`, version: 1 })).toBe(false);
      expect(ok(UpdateCodeValueDto, { description: `A${ch}B`, version: 1 })).toBe(false);
    },
  );

  it('still accept ordinary text beside them', () => {
    for (const ch of ['x', 'é', '-']) {
      expect(ok(CreateCodeTypeDto, { name: `A${ch}B` })).toBe(true);
    }
  });

  it('read a blank description as none, never as the stored empty string the CHECK refuses', () => {
    expect(as(CreateCodeValueDto, { shortCode: 'L', description: '   ' }).description).toBeNull();
    expect(ok(CreateCodeValueDto, { shortCode: 'L', description: '   ' })).toBe(true);
    expect(ok(CreateCodeValueDto, { shortCode: 'L', description: null })).toBe(true);
    expect(as(UpdateCodeValueDto, { description: '', version: 1 }).description).toBeNull();
  });

  it('leave an omitted edit field omitted, so an edit changes only what it names', () => {
    const dto = as(UpdateCodeValueDto, { version: 1 });
    expect(dto.shortCode).toBeUndefined();
    expect(dto.description).toBeUndefined();
  });

  it('fit versions in the INT column', () => {
    expect(ok(UpdateCodeTypeDto, { name: 'A', version: MAX_INT })).toBe(true);
    expect(ok(UpdateCodeTypeDto, { name: 'A', version: MAX_INT + 1 })).toBe(false);
    expect(ok(UpdateCodeValueDto, { shortCode: 'A', version: MAX_INT + 1 })).toBe(false);
    expect(ok(ReorderCodeTypesDto, { order: [{ id: ID, version: MAX_INT + 1 }] })).toBe(false);
    expect(ok(ReorderCodeValuesDto, { order: [{ id: ID, version: MAX_INT }] })).toBe(true);
  });

  it('cap a reorder at the plan’s and the type’s limits', () => {
    const rows = (n: number) => Array.from({ length: n }, () => ({ id: ID, version: 1 }));
    expect(ok(ReorderCodeTypesDto, { order: rows(100) })).toBe(true);
    expect(ok(ReorderCodeTypesDto, { order: rows(101) })).toBe(false);
    expect(ok(ReorderCodeValuesDto, { order: rows(1000) })).toBe(true);
    expect(ok(ReorderCodeValuesDto, { order: rows(1001) })).toBe(false);
    expect(ok(ReorderCodeValuesDto, { order: [] })).toBe(false);
  });
});

describe('UpdateActivityCodesDto', () => {
  const row = { id: ID, version: 1, codes: [{ codeTypeId: ID, codeValueId: ID }] };

  it('requires codeValueId on every entry, nullable but never omitted', () => {
    expect(ok(UpdateActivityCodesDto, { activities: [row] })).toBe(true);
    expect(
      ok(UpdateActivityCodesDto, {
        activities: [{ ...row, codes: [{ codeTypeId: ID, codeValueId: null }] }],
      }),
    ).toBe(true);
    expect(
      ok(UpdateActivityCodesDto, { activities: [{ ...row, codes: [{ codeTypeId: ID }] }] }),
    ).toBe(false);
  });

  it('refuses an entry that names a value that is not a uuid, and an empty batch or row', () => {
    expect(
      ok(UpdateActivityCodesDto, {
        activities: [{ ...row, codes: [{ codeTypeId: ID, codeValueId: 'L1' }] }],
      }),
    ).toBe(false);
    expect(ok(UpdateActivityCodesDto, { activities: [] })).toBe(false);
    expect(ok(ActivityCodesRowDto, { ...row, codes: [] })).toBe(false);
  });

  it('caps a row at the plan’s type limit and a batch at 2,000 activities', () => {
    const entry = { codeTypeId: ID, codeValueId: null };
    expect(
      ok(ActivityCodesRowDto, { ...row, codes: Array.from({ length: 100 }, () => entry) }),
    ).toBe(true);
    expect(
      ok(ActivityCodesRowDto, { ...row, codes: Array.from({ length: 101 }, () => entry) }),
    ).toBe(false);
    expect(
      ok(UpdateActivityCodesDto, { activities: Array.from({ length: 2000 }, () => row) }),
    ).toBe(true);
    expect(
      ok(UpdateActivityCodesDto, { activities: Array.from({ length: 2001 }, () => row) }),
    ).toBe(false);
  });

  it('fits the activity version in the INT column', () => {
    expect(ok(ActivityCodesRowDto, { ...row, version: MAX_INT })).toBe(true);
    expect(ok(ActivityCodesRowDto, { ...row, version: MAX_INT + 1 })).toBe(false);
  });
});
