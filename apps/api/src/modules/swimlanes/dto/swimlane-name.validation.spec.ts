import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';

import { CreateSwimlaneDto } from './create-swimlane.dto';
import { UpdateSwimlaneDto } from './update-swimlane.dto';

const nameErrors = (cls: new () => object, name: string): number =>
  validateSync(plainToInstance(cls, { name, version: 1 })).length;

// What `[[:cntrl:]]` in ck_swimlanes_name_shape counts beyond C0/C1 on a musl-style collation: a name
// the DTO let through would be a raw 500 from the CHECK rather than a 422.
const BEYOND_C0_C1 = [
  ['U+2028', ' '],
  ['U+2029', ' '],
  ['U+FFF9', '￹'],
  ['U+FFFA', '￺'],
  ['U+FFFB', '￻'],
] as const;

describe.each([
  ['create', CreateSwimlaneDto],
  ['update', UpdateSwimlaneDto],
])('%s swimlane name', (_label, cls) => {
  it.each(BEYOND_C0_C1)('refuses %s inside the name', (_cp, ch) => {
    expect(nameErrors(cls, `Level${ch}1`)).toBeGreaterThan(0);
  });

  it('still refuses a newline and a tab, and accepts an ordinary name', () => {
    expect(nameErrors(cls, 'Level\n1')).toBeGreaterThan(0);
    expect(nameErrors(cls, 'Level\t1')).toBeGreaterThan(0);
    expect(nameErrors(cls, 'Level 1')).toBe(0);
  });
});
