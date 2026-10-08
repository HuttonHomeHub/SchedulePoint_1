import { describe, expect, it } from 'vitest';

import {
  EXPLORER_DEFAULT_WIDTH,
  EXPLORER_MAX_WIDTH,
  EXPLORER_MIN_WIDTH,
  STAGE_MIN_WIDTH,
  explorerCeiling,
} from './use-explorer-prefs';

describe('explorerCeiling', () => {
  it('leaves the stage its floor at the 1024 design floor, with room over the default', () => {
    const ceiling = explorerCeiling(1024);
    expect(1024 - ceiling - 1).toBeGreaterThanOrEqual(STAGE_MIN_WIDTH);
    expect(ceiling).toBeGreaterThanOrEqual(EXPLORER_DEFAULT_WIDTH);
  });

  it('reaches the stored maximum from 1141 px up and never exceeds it', () => {
    expect(explorerCeiling(1141)).toBe(EXPLORER_MAX_WIDTH);
    expect(explorerCeiling(1920)).toBe(EXPLORER_MAX_WIDTH);
  });

  it('never drops below the Explorer minimum, however narrow the window', () => {
    expect(explorerCeiling(900)).toBe(EXPLORER_MIN_WIDTH);
    expect(explorerCeiling(320)).toBe(EXPLORER_MIN_WIDTH);
  });
});
