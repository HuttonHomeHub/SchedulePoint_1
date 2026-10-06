import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Limb, LoadingReading } from '../loading/model/limb';
import { LOADING_MARKER_KEY } from '../loading/model/marker';

import { LoadingProbeSection } from './loading-probe-section';

import { AnnouncerProvider } from '@/components/ui/announcer';

const start = vi.fn();
const resume = vi.fn();
const runnerLoaded = vi.fn();

vi.mock('../loading/runner/run-loading-probe', () => {
  runnerLoaded();
  return {
    browserEnv: () => ({ fake: true }),
    startLoadingProbe: (env: unknown) => start(env),
    resumeLoadingProbe: (env: unknown) => resume(env),
  };
});

vi.mock('@/features/staff/api/staff-panels', () => ({
  useStaffInstallation: () => ({ data: { apiVersion: '0.140.0' } }),
}));

const limb = (name: Limb['name'], over: { cache: number; revalidated: number }): Limb => ({
  name,
  status: 'taken',
  readyMs: 10,
  tally: {
    observed: 4,
    cache: over.cache,
    revalidated: over.revalidated,
    downloaded: 4 - over.cache - over.revalidated,
    notExposed: 0,
    heuristic: 0,
    protocols: ['h2'],
  },
});

const reading: LoadingReading = {
  takenAt: '2026-10-06T10:00:00.000Z',
  development: true,
  browser: 'Chrome 130',
  webVersion: '1.2.3',
  apiVersion: null,
  reload: limb('reload', { cache: 4, revalidated: 0 }),
  revisit: limb('revisit', { cache: 1, revalidated: 3 }),
  network: limb('network', { cache: 0, revalidated: 0 }),
  cacheControl: { status: 'read', value: 'no-cache', url: 'https://sp.test/assets/a.js' },
};

const fresh = JSON.stringify({ v: 1, runId: 'r', startedAt: Date.now(), step: 'reload' });

function mount(): { status: ReturnType<typeof vi.fn> } {
  const status = vi.fn();
  render(
    <AnnouncerProvider>
      <LoadingProbeSection onStatusChange={status} />
    </AnnouncerProvider>,
  );
  return { status };
}

describe('LoadingProbeSection', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
    start.mockReset();
    resume.mockReset();
    runnerLoaded.mockReset();
  });

  it('names its entry point and loads nothing until asked', async () => {
    mount();
    expect(screen.getByRole('button', { name: 'Measure plan loading' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy plan loading report' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    // A console visit with no pending press must not download the runner.
    await Promise.resolve();
    expect(runnerLoaded).not.toHaveBeenCalled();
    expect(resume).not.toHaveBeenCalled();
  });

  it('says what it does not measure, beside the control', () => {
    mount();
    expect(screen.getByText(/does not measure the plan’s own data requests/)).toBeInTheDocument();
  });

  it('confirms before reloading the page, and cancelling starts nothing', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Measure plan loading' }));
    expect(await screen.findByRole('alertdialog', { name: 'Measure plan loading?' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Not now' }));
    expect(start).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Measure plan loading' })).toHaveFocus(),
    );
  });

  it('starts a press on confirm', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Measure plan loading' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Measure' }));
    await waitFor(() => expect(start).toHaveBeenCalledWith({ fake: true }));
    expect(screen.getByRole('button', { name: 'Measuring…' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  it('resumes a pending press on mount, shows the result and moves focus to it', async () => {
    window.sessionStorage.setItem(LOADING_MARKER_KEY, fresh);
    resume.mockResolvedValue({ kind: 'done', reading });
    const { status } = mount();
    // Paints "measuring" on the first frame, before the runner has been fetched.
    expect(screen.getByRole('button', { name: 'Measuring…' })).toBeInTheDocument();
    const heading = await screen.findByRole('heading', { name: 'Plan loading reading' });
    await waitFor(() => expect(heading).toHaveFocus());
    expect(screen.getByText('development build: not a reading of the live server')).toBeVisible();
    expect(screen.getByText('Went to the network: 3')).toBeInTheDocument();
    expect(
      screen.getByText(/Cache-Control on \/assets\/a\.js: no-cache \(immutable: no\)/),
    ).toBeVisible();
    // The API version arrives from the installation query, not from the runner.
    expect(screen.getByText(/API 0\.140\.0/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy plan loading report' })).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await waitFor(() =>
      expect(status).toHaveBeenLastCalledWith(expect.stringContaining('Plan loading measured')),
    );
  });

  it('copies the block the screen is showing', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    window.sessionStorage.setItem(LOADING_MARKER_KEY, fresh);
    resume.mockResolvedValue({ kind: 'done', reading });
    mount();
    await screen.findByRole('heading', { name: 'Plan loading reading' });
    fireEvent.click(screen.getByRole('button', { name: 'Copy plan loading report' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const text = String(writeText.mock.calls[0]?.[0]);
    expect(text).toContain('SchedulePoint plan-screen loading reading');
    expect(text).toContain('API version: 0.140.0');
  });

  it('keeps the section "measuring" while the page is about to navigate', async () => {
    window.sessionStorage.setItem(LOADING_MARKER_KEY, fresh);
    resume.mockResolvedValue({ kind: 'navigating' });
    mount();
    await waitFor(() => expect(resume).toHaveBeenCalled());
    expect(screen.getByRole('button', { name: 'Measuring…' })).toBeInTheDocument();
  });

  it('reports a failed measurement as an event, with no numbers', async () => {
    window.sessionStorage.setItem(LOADING_MARKER_KEY, fresh);
    resume.mockResolvedValue({ kind: 'failed', message: 'boom' });
    mount();
    expect(await screen.findByText(/did not complete, so there is no reading: boom/)).toBeVisible();
    expect(screen.queryByText('Plan loading reading')).toBeNull();
  });

  it('discards a stale marker with a notice, and never loads the runner for it', async () => {
    window.sessionStorage.setItem(
      LOADING_MARKER_KEY,
      JSON.stringify({ v: 1, runId: 'r', startedAt: 1, step: 'reload' }),
    );
    mount();
    expect(await screen.findByText(/did not finish and was discarded/)).toBeVisible();
    expect(window.sessionStorage.getItem(LOADING_MARKER_KEY)).toBeNull();
    expect(runnerLoaded).not.toHaveBeenCalled();
  });
});
