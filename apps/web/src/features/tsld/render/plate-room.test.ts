import { describe, expect, it } from 'vitest';

import { freePlatePosition, lagPlateCandidates } from './link-marks';
import { PLATE_GRAZE_PX, plateRoom, SLACK_CHIP_H } from './plate-room';
import type { Point, Rect } from './render-model';

/**
 * **The plate sub-term's question** (links-and-labels M2, spec D-5): does the painter's own
 * `freePlatePosition` find room on this line? The room buckets its boxes by y, which is only a
 * speed-up: the property below holds it to the unbucketed answer.
 */
const LINE: Point[] = [
  { x: 0, y: 30 },
  { x: 200, y: 30 },
  { x: 200, y: 150 },
];
const W = 40;

describe('plateRoom', () => {
  it('finds room on a line nothing is near', () => {
    expect(plateRoom([], []).hasRoom(LINE, W)).toBe(true);
  });

  it('finds no room when text covers every position the plate may take', () => {
    const covered: Rect[] = [
      { x: -10, y: 20, w: 230, h: 20 },
      { x: 190, y: 20, w: 20, h: 140 },
    ];
    expect(plateRoom(covered, []).hasRoom(LINE, W)).toBe(false);
    // And a glyph covering them refuses it the same way.
    expect(plateRoom([], covered).hasRoom(LINE, W)).toBe(false);
  });

  it('lets a plate graze a text row by its leading, and not a glyph', () => {
    // A row box whose edge overlaps the plate by less than the graze allowance on every candidate.
    const edge = 30 + SLACK_CHIP_H / 2 - PLATE_GRAZE_PX + 0.5;
    const grazing: Rect[] = [
      { x: -10, y: edge, w: 230, h: 10 },
      { x: 150, y: 0, w: 100, h: 200 },
    ];
    expect(plateRoom([grazing[0]!], [grazing[1]!]).hasRoom(LINE, W)).toBe(true);
    expect(plateRoom([], grazing).hasRoom(LINE, W)).toBe(false);
  });

  it('gives the answer the painter’s function gives over every box at once', () => {
    let seed = 7;
    const rand = (): number => {
      seed = (seed * 1103515245 + 12345) % 2147483648;
      return seed / 2147483648;
    };
    // Boxes drawn around the line, large enough that some draws leave no room at all.
    const box = (): Rect => ({
      x: rand() * 240 - 20,
      y: rand() * 170,
      w: 20 + rand() * 100,
      h: 10 + rand() * 30,
    });
    let rooms = 0;
    for (let run = 0; run < 400; run += 1) {
      const text = Array.from({ length: Math.floor(rand() * 40) }, box);
      const glyphs = Array.from({ length: Math.floor(rand() * 12) }, box);
      const expected =
        freePlatePosition(
          lagPlateCandidates(LINE, W, SLACK_CHIP_H),
          W,
          SLACK_CHIP_H,
          text,
          glyphs,
          PLATE_GRAZE_PX,
        ) !== null;
      expect(plateRoom(text, glyphs).hasRoom(LINE, W)).toBe(expected);
      if (expected) rooms += 1;
    }
    // Not vacuous: the draws produce both answers.
    expect(rooms).toBeGreaterThan(40);
    expect(rooms).toBeLessThan(360);
  });
});
