import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CANCEL_GRACE_MS, ExportAction } from './ExportAction';

import type { OrganizationExportState } from '@/features/organization-export/api/use-export-organization';

const onStart = vi.fn();
const onCancel = vi.fn();

function renderAction(state: OrganizationExportState) {
  const view = render(<ExportAction state={state} onStart={onStart} onCancel={onCancel} />);
  return {
    ...view,
    update: (next: OrganizationExportState) =>
      view.rerender(<ExportAction state={next} onStart={onStart} onCancel={onCancel} />),
  };
}

afterEach(() => {
  onStart.mockReset();
  onCancel.mockReset();
  vi.useRealTimers();
});

describe('ExportAction', () => {
  it('turns the same button into Cancel while busy', () => {
    vi.useFakeTimers();
    const view = renderAction({ status: 'idle' });
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));
    view.update({ status: 'busy', bytes: 0 });

    expect(screen.queryByRole('button', { name: 'Download export' })).toBeNull();
    act(() => void vi.advanceTimersByTime(CANCEL_GRACE_MS));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('ignores a Cancel pressed inside the grace period after start, then honours one after it', () => {
    vi.useFakeTimers();
    const view = renderAction({ status: 'idle' });
    fireEvent.click(screen.getByRole('button', { name: 'Download export' }));
    view.update({ status: 'busy', bytes: 0 });

    act(() => void vi.advanceTimersByTime(CANCEL_GRACE_MS - 1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).not.toHaveBeenCalled();

    act(() => void vi.advanceTimersByTime(1));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps the very same button element across Download and Cancel, so focus survives', () => {
    const view = renderAction({ status: 'idle' });
    const before = screen.getByRole('button', { name: 'Download export' });
    before.focus();

    view.update({ status: 'busy', bytes: 0 });

    const after = screen.getByRole('button', { name: 'Cancel' });
    expect(after).toBe(before);
    expect(after).toHaveFocus();
  });

  it('never marks anything disabled', () => {
    const view = renderAction({ status: 'idle' });
    view.update({ status: 'busy', bytes: 10 });
    expect(document.querySelectorAll('[disabled]')).toHaveLength(0);
  });

  it('keeps the live region constant while bytes arrive and shows the count outside it', () => {
    const view = renderAction({ status: 'busy', bytes: 0 });
    const live = screen.getByRole('status');
    expect(live).toHaveTextContent('Preparing your export…');

    view.update({ status: 'busy', bytes: 3_200_000 });

    expect(screen.getByRole('status')).toHaveTextContent(/^Preparing your export…$/);
    const count = screen.getByText('3.2 MB received');
    expect(count).toBeVisible();
    expect(live).not.toContainElement(count);
    expect(count.closest('[aria-live]')).toBeNull();
    expect(count.closest('[role="status"]')).toBeNull();
  });

  it('says Downloaded when finished', () => {
    renderAction({ status: 'done', filename: 'schedulepoint-export-acme.zip', bytes: 12_345_678 });

    expect(screen.getByRole('status')).toHaveTextContent(
      'Downloaded schedulepoint-export-acme.zip (12.3 MB). Your browser has saved it.',
    );
    expect(screen.getByRole('button', { name: 'Download export' })).toBeVisible();
  });

  it('says Export cancelled after a cancel', () => {
    renderAction({ status: 'cancelled' });

    expect(screen.getByRole('status')).toHaveTextContent('Export cancelled.');
  });

  it('announces a failure once, as an alert, and leaves the status line empty', () => {
    renderAction({
      status: 'error',
      message: 'Too many exports in a short time. Try again in about 10 minutes.',
    });

    expect(screen.getByRole('alert')).toHaveTextContent('Too many exports in a short time.');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
    expect(screen.getByRole('button', { name: 'Download export' })).toBeVisible();
  });
});
