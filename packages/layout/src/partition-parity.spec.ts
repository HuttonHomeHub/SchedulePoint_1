import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { parityCorpus, runParityCorpus } from './partition-parity.fixtures.js';

// Recorded on the code before the partition parameter existed; see the fixtures' docblock.
const golden: unknown = JSON.parse(
  readFileSync(new URL('./partition-parity.golden.json', import.meta.url), 'utf8'),
);

describe('the optional swimlane partition: absent is the old behaviour', () => {
  it('has a corpus worth the name', () => {
    expect(parityCorpus().length).toBeGreaterThanOrEqual(30);
  });

  it('answers byte-for-byte as before when the partition is left off', () => {
    expect(JSON.stringify(runParityCorpus('absent'))).toBe(JSON.stringify(golden));
  });

  it('answers byte-for-byte as before when the partition is an explicit undefined', () => {
    expect(JSON.stringify(runParityCorpus('undefined'))).toBe(JSON.stringify(golden));
  });
});
