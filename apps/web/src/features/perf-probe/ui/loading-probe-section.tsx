import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { LoadingReading } from '../loading/model/limb';
import { LOADING_MARKER_KEY, readMarker } from '../loading/model/marker';
import {
  cacheControlLine,
  DEVELOPMENT_LABEL,
  formatLoadingReport,
  limbLines,
  loadingStatus,
  MEASURES_SENTENCE,
  PRIME_SENTENCE,
} from '../loading/model/report';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useStaffInstallation } from '@/features/staff/api/staff-panels';
import { useClipboardCopy } from '@/hooks/use-clipboard-copy';

/**
 * Measure plan loading — the second section of the Performance panel (`docs/TECH_DEBT.md` #433).
 *
 * **Entry point, named rather than implied** (ADR-0081): `/staff` → Performance → **Measure plan
 * loading** → **Measure**. The press reloads this page, then navigates it once more, with no further
 * input, and the result appears where it started.
 *
 * **Nothing here talks to the server.** It reads the browser's own timing record of the plan
 * screen's code files, so it needs no API route, writes nothing and leaves nothing to audit. The
 * runner is reached only through `await import()` (`panel-imports.structural.test.ts`): the staff
 * chunk is a few kilobytes and a console visit that never presses the control must not pay for it.
 * That includes the resume below — a page with no marker never loads the runner.
 *
 * **The panel owns the one polite region** (`Panel`), so this section reports its status upward
 * rather than mounting a second live region beside it.
 */
export function LoadingProbeSection({
  onStatusChange,
}: {
  onStatusChange: (status: string) => void;
}): React.ReactElement {
  const installation = useStaffInstallation();
  const apiVersion = installation.data?.apiVersion ?? null;
  const headingId = useId();

  const [confirming, setConfirming] = useState(false);
  // Read once, synchronously, so a resumed page paints "measuring" at once rather than offering
  // the button for the first frames of a cycle already under way.
  const [pending] = useState(() => readMarker(window.sessionStorage, Date.now()));
  const [measuring, setMeasuring] = useState(pending.kind === 'pending');
  const [reading, setReading] = useState<LoadingReading | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [discarded, setDiscarded] = useState(pending.kind === 'discarded');

  const pressRef = useRef<HTMLButtonElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  const clipboard = useClipboardCopy({
    copiedMessage: 'Plan loading report copied to the clipboard.',
    failedMessage: 'Could not reach the clipboard. The numbers are below — copy them by hand.',
  });
  // The stable half: depending on the whole object would re-create `press` whenever a copy settles.
  const { reset: resetCopyState } = clipboard;

  useEffect(() => {
    if (pending.kind === 'discarded') {
      // A stale or malformed marker is removed here, without the runner: nothing was measured.
      window.sessionStorage.removeItem(LOADING_MARKER_KEY);
      return;
    }
    if (pending.kind !== 'pending') return;
    let live = true;
    void (async () => {
      const { browserEnv, resumeLoadingProbe } =
        await import('../loading/runner/run-loading-probe');
      const result = await resumeLoadingProbe(browserEnv());
      if (!live) return;
      if (result.kind === 'done') {
        setReading(result.reading);
        setMeasuring(false);
      } else if (result.kind === 'failed') {
        setFailure(result.message);
        setMeasuring(false);
      } else if (result.kind === 'discarded') {
        setDiscarded(true);
        setMeasuring(false);
      } else if (result.kind === 'none') {
        setMeasuring(false);
      }
      // `navigating`: the page is about to be replaced, so the section stays "measuring".
    })();
    return () => {
      live = false;
    };
  }, [pending]);

  // The API version arrives on its own query; the reading is completed with it rather than
  // blocking on it, and the block says "not yet known" in the one case it is still missing.
  const shown = useMemo(
    () => (reading === null ? null : { ...reading, apiVersion }),
    [reading, apiVersion],
  );

  // ADR-0135: a reload leaves nothing focused, so when the result lands it takes focus, and a
  // keyboard or screen-reader user arrives at it rather than at the top of a page they did not move.
  const hadResult = useRef(false);
  useEffect(() => {
    if (shown !== null && !hadResult.current) resultHeadingRef.current?.focus();
    hadResult.current = shown !== null;
  }, [shown]);

  useEffect(() => {
    onStatusChange(
      measuring
        ? 'Measuring plan loading. The page will reload and navigate by itself.'
        : failure !== null
          ? 'Plan loading could not be measured.'
          : shown !== null
            ? loadingStatus(shown)
            : '',
    );
  }, [failure, measuring, onStatusChange, shown]);

  const press = useCallback(async () => {
    setConfirming(false);
    setMeasuring(true);
    setFailure(null);
    setReading(null);
    setDiscarded(false);
    resetCopyState();
    try {
      const { browserEnv, startLoadingProbe } = await import('../loading/runner/run-loading-probe');
      startLoadingProbe(browserEnv());
    } catch (error) {
      setMeasuring(false);
      setFailure(error instanceof Error ? error.message : String(error));
    }
  }, [resetCopyState]);

  const copyBlockedId = useId();

  return (
    <section aria-labelledby={headingId} className="space-y-4 border-t pt-4">
      {/* `<strong>` rather than a placed weight: the screens' weight ceiling counts every
          `font-*` class, and a heading's weight is the heading's own. */}
      <h3 id={headingId} className="text-sm">
        <strong>Plan loading</strong>
      </h3>
      <p className="text-muted-foreground text-sm">
        Measures whether this server makes a reload or a revisit of the plan screen fetch its code
        again, which protocol it travels over, and which <code>Cache-Control</code> header arrives
        after every proxy. The page reloads and navigates by itself, about ten to twenty seconds,
        and nothing is sent anywhere: it makes no request to the API and loads no plan.
      </p>
      <p className="text-muted-foreground text-sm">{MEASURES_SENTENCE}</p>
      <p className="text-muted-foreground text-sm">{PRIME_SENTENCE}</p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={pressRef}
          aria-disabled={measuring}
          aria-busy={measuring}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          onClick={() => {
            if (!measuring) setConfirming(true);
          }}
        >
          {measuring ? 'Measuring…' : 'Measure plan loading'}
        </Button>
        <Button
          variant="outline"
          aria-disabled={shown === null}
          aria-describedby={shown === null ? copyBlockedId : undefined}
          className="aria-disabled:pointer-events-none aria-disabled:opacity-50"
          onClick={() => {
            if (shown !== null) clipboard.copy(formatLoadingReport(shown));
          }}
        >
          Copy plan loading report
        </Button>
        {shown === null ? (
          <span id={copyBlockedId} className="sr-only">
            {measuring
              ? 'Wait for the measurement to finish.'
              : 'Measure plan loading first — there is nothing to copy yet.'}
          </span>
        ) : null}
        {/* The announcement goes through the shared hook; this is the cue a sighted reader needs. */}
        <span className="text-muted-foreground text-sm">
          {clipboard.state === 'copied' ? 'Report copied.' : ''}
          {clipboard.state === 'failed'
            ? 'Could not reach the clipboard. The numbers are below — copy them by hand.'
            : ''}
        </span>
      </div>

      {measuring ? (
        // A bare icon, not `<Spinner>`: its `role="status"` would be a second live region.
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
          Measuring. Leave this tab alone until the result appears.
        </p>
      ) : null}

      {discarded ? (
        <Alert purpose="event" tone="info">
          An earlier measurement did not finish and was discarded. Press the control to take a new
          one.
        </Alert>
      ) : null}

      {failure !== null ? (
        <Alert purpose="event" tone="error">
          The measurement did not complete, so there is no reading: {failure}
        </Alert>
      ) : null}

      {shown !== null ? (
        <div className="space-y-3" data-loading-result>
          <h4 ref={resultHeadingRef} tabIndex={-1} className="text-sm">
            <strong>Plan loading reading</strong>
          </h4>
          {shown.development ? (
            <Alert purpose="condition" tone="info">
              {DEVELOPMENT_LABEL}
            </Alert>
          ) : null}
          {[shown.reload, shown.revisit, shown.network].map((limb) => (
            <ul key={limb.name} className="text-sm" data-limb={limb.name}>
              {limbLines(limb).map((line, index) => (
                <li
                  key={`${String(index)}-${line}`}
                  className={index === 0 ? undefined : 'text-muted-foreground'}
                >
                  {index === 0 ? <strong>{line.trim()}</strong> : line.trim()}
                </li>
              ))}
            </ul>
          ))}
          <p className="text-sm" data-cache-control>
            {cacheControlLine(shown.cacheControl)}
          </p>
          <p className="text-muted-foreground text-xs">
            {shown.browser}, web {shown.webVersion}, API {shown.apiVersion ?? 'not yet known'}. This
            reading speaks for this browser only.
          </p>
        </div>
      ) : null}

      <ConfirmDialog
        open={confirming}
        onClose={() => {
          setConfirming(false);
          pressRef.current?.focus();
        }}
        onConfirm={() => {
          void press();
        }}
        title="Measure plan loading?"
        description="This page will reload, then navigate once more, by itself — about ten to twenty seconds. Nothing is sent anywhere and no plan is opened."
        confirmLabel="Measure"
        cancelLabel="Not now"
        confirmVariant="default"
      />
    </section>
  );
}
