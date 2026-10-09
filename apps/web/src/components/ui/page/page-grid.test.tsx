import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageGrid, PageGridItem } from './index';

/**
 * **jsdom evaluates no container query**, so nothing here can say whether the grid is one column or
 * two at a given width. These tests pin the CLASSES that carry the rule — which element declares the
 * container, which one queries it, where a caller's `className` lands — and the behaviour (one
 * column at 1280, two at 1600, two when the Explorer is folded, one when it is at 420) is held by the
 * `e2e-overview` journey, which runs in a real browser (docs/specs/landing-two-columns SC-1, SC-3).
 */
describe('PageGrid', () => {
  it('declares its container on a frame and queries it from the grid inside', () => {
    const { container } = render(
      <PageGrid>
        <PageGridItem span="narrow">a</PageGridItem>
      </PageGrid>,
    );

    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toMatch(/(?:^|\s)@container(?:\s|$)/);
    for (const cls of ['flex', 'min-h-0', 'flex-1', 'flex-col']) {
      expect(frame.className.split(/\s+/)).toContain(cls);
    }
    const grid = frame.firstElementChild as HTMLElement;
    expect(grid.className, 'an element is never its own query container').not.toMatch(/@container/);
    expect(grid.className).toMatch(/grid-cols-1/);
    expect(grid.className).toMatch(/@6xl:grid-cols-2/);
  });

  it('puts the caller className on the frame, not the grid', () => {
    const { container } = render(
      <PageGrid className="mt-6">
        <PageGridItem span="narrow">a</PageGridItem>
      </PageGrid>,
    );
    const frame = container.firstElementChild as HTMLElement;
    expect(frame.className).toMatch(/\bmt-6\b/);
    expect((frame.firstElementChild as HTMLElement).className).not.toMatch(/\bmt-6\b/);
  });

  it('emits the fit-then-fill row template only when asked, beside the split it belongs to', () => {
    const fit = render(
      <PageGrid rows="fit-then-fill">
        <PageGridItem span="narrow">a</PageGridItem>
      </PageGrid>,
    );
    const fitGrid = fit.container.firstElementChild?.firstElementChild as HTMLElement;
    expect(fitGrid.className).toContain('@6xl:grid-rows-[minmax(0,auto)_minmax(0,1fr)]');

    const auto = render(
      <PageGrid>
        <PageGridItem span="narrow">a</PageGridItem>
      </PageGrid>,
    );
    const autoGrid = auto.container.firstElementChild?.firstElementChild as HTMLElement;
    expect(autoGrid.className).not.toMatch(/grid-rows/);
  });

  it('spans a wide item across every explicit column without a breakpoint', () => {
    const { getByText } = render(
      <PageGrid>
        <PageGridItem span="wide">wide</PageGridItem>
        <PageGridItem span="narrow">narrow</PageGridItem>
      </PageGrid>,
    );
    expect(getByText('wide').className).toMatch(/\bcol-span-full\b/);
    expect(getByText('wide').className).not.toMatch(/md:|lg:/);
    expect(getByText('narrow').className).not.toMatch(/col-span/);
  });
});
