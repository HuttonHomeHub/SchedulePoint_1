import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { DEFAULT_VIEW_TOGGLES } from '../render/paint';

import { TsldViewControls } from './TsldViewControls';

function renderControls(props: Partial<React.ComponentProps<typeof TsldViewControls>> = {}) {
  return render(
    <TsldViewControls
      zoomPreset="week"
      onZoomPreset={vi.fn()}
      onZoomStep={vi.fn()}
      onFit={vi.fn()}
      toggles={DEFAULT_VIEW_TOGGLES}
      onToggle={vi.fn()}
      {...props}
    />,
  );
}

describe('TsldViewControls', () => {
  it('marks the active zoom preset with aria-pressed and commands a preset on click', () => {
    const onZoomPreset = vi.fn();
    renderControls({ zoomPreset: 'month', onZoomPreset });
    expect(screen.getByRole('button', { name: 'Month' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Week' })).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Day' }));
    expect(onZoomPreset).toHaveBeenCalledWith('day');
  });

  it('offers a Swimlanes checkbox only when the host supplies the lens (the guest view)', () => {
    const onChange = vi.fn();
    const { rerender } = renderControls();
    expect(screen.queryByRole('checkbox', { name: 'Swimlanes' })).not.toBeInTheDocument();

    rerender(
      <TsldViewControls
        zoomPreset="week"
        onZoomPreset={vi.fn()}
        onZoomStep={vi.fn()}
        onFit={vi.fn()}
        toggles={DEFAULT_VIEW_TOGGLES}
        onToggle={vi.fn()}
        swimlanes={{ checked: true, onChange }}
      />,
    );
    const lens = screen.getByRole('checkbox', { name: 'Swimlanes' });
    expect(lens).toBeChecked();
    fireEvent.click(lens);
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('steps zoom in and out', () => {
    const onZoomStep = vi.fn();
    renderControls({ onZoomStep });
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }));
    fireEvent.click(screen.getByRole('button', { name: 'Zoom out' }));
    expect(onZoomStep).toHaveBeenCalledTimes(2);
    expect(onZoomStep.mock.calls[0]![0]).toBeGreaterThan(1); // in
    expect(onZoomStep.mock.calls[1]![0]).toBeLessThan(1); // out
  });

  it('renders the six layer toggles as labelled checkboxes reflecting state', () => {
    renderControls({ toggles: { ...DEFAULT_VIEW_TOGGLES, nonWorking: false } });
    for (const label of ['Day grid', 'Month grid', 'Year grid', 'Today', 'Non-working', 'Labels']) {
      expect(screen.getByRole('checkbox', { name: label })).toBeInTheDocument();
    }
    expect(screen.getByRole('checkbox', { name: 'Day grid' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Labels' })).toBeChecked(); // default on
    expect(screen.getByRole('checkbox', { name: 'Non-working' })).not.toBeChecked();
  });

  it('toggles a layer on change', () => {
    const onToggle = vi.fn();
    renderControls({ onToggle });
    fireEvent.click(screen.getByRole('checkbox', { name: 'Today' }));
    expect(onToggle).toHaveBeenCalledWith('today');
  });

  it('fits on demand', () => {
    const onFit = vi.fn();
    renderControls({ onFit });
    fireEvent.click(screen.getByRole('button', { name: 'Fit to plan' }));
    expect(onFit).toHaveBeenCalledTimes(1);
  });
});
