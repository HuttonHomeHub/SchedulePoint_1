import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { RailResizer } from './rail-resizer';
import { RAIL_MAX_WIDTH, RAIL_MIN_WIDTH } from './use-rail-prefs';

function renderResizer(width = 300, onResize = vi.fn()) {
  render(<RailResizer width={width} onResize={onResize} />);
  return {
    separator: screen.getByRole('separator', { name: 'Resize Project Explorer' }),
    onResize,
  };
}

describe('RailResizer', () => {
  it('exposes the current width as an accessible vertical separator', () => {
    const { separator } = renderResizer(320);
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('aria-valuenow', '320');
    expect(separator).toHaveAttribute('aria-valuemin', String(RAIL_MIN_WIDTH));
    expect(separator).toHaveAttribute('aria-valuemax', String(RAIL_MAX_WIDTH));
    expect(separator).toHaveAttribute('tabindex', '0');
  });

  it('nudges width with arrow keys and jumps to bounds with Home/End', () => {
    const { separator, onResize } = renderResizer(300);
    fireEvent.keyDown(separator, { key: 'ArrowRight' });
    expect(onResize).toHaveBeenLastCalledWith(316);
    fireEvent.keyDown(separator, { key: 'ArrowLeft' });
    expect(onResize).toHaveBeenLastCalledWith(284);
    fireEvent.keyDown(separator, { key: 'Home' });
    expect(onResize).toHaveBeenLastCalledWith(RAIL_MIN_WIDTH);
    fireEvent.keyDown(separator, { key: 'End' });
    expect(onResize).toHaveBeenLastCalledWith(RAIL_MAX_WIDTH);
  });

  it('ignores unrelated keys', () => {
    const { separator, onResize } = renderResizer(300);
    fireEvent.keyDown(separator, { key: 'a' });
    expect(onResize).not.toHaveBeenCalled();
  });
});
