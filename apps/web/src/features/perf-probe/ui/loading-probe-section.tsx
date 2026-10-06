import { Loader2 } from 'lucide-react';
import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';

import type { LoadingReading } from '../loading/model/limb';
import { LOADING_MARKER_KEY, readMarker } from '../loading/model/marker';
import {
  cacheControlLine,
  coldReloadWarning,
  DEVELOPMENT_LABEL,
  FAILURE_SENTENCE,
  formatLoadingReport,
  limbLines,
  loadingStatus,
  MEASURES_SENTENCE,
  plainVerdict,
} from '../loading/model/report';
import { unsupportedReason } from '../loading/model/support';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { CopyButton } from '@/components/ui/copy-button';

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
 * **The panel owns the one polite region** (`StatusSection`), so this section reports its status upward
 * rather than mounting a second live region beside it.
 */
export interface LoadingProbeSectionProps {
  /** `null` until the installation read settles; the report then says "unknown version". */
  apiVersion: string | null;
  onStatusChange: (status: string) => void;
}

export function LoadingProbeSection({
  apiVersion,
  onStatusChange,
}: LoadingProbeSectionProps): React.ReactElement {
  const headingId = useId();

  const [confirming, setConfirming] = useState(false);
  // Read once, synchronously, so a resumed page paints "measuring" at once rather than offering
  // the button for the first frames of a cycle already under way.
  // An unsupported browser is offered nothing and reads no marker: it cannot have left one.
  const [unsupported] = useState(() => unsupportedReason());
  const [pending] = useState(() =>
    unsupported === null
      ? readMarker(window.sessionStorage, Date.now())
      : ({ kind: 'none' } as const),
  );
  const [measuring, setMeasuring] = useState(pending.kind === 'pending');
  const [reading, setReading] = useState<LoadingReading | null>(null);
  const [failed, setFailed] = useState(false);
  const [discarded, setDiscarded] = useState(pending.kind === 'discarded');

  const pressRef = useRef<HTMLButtonElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
  // A failure or a discarded run leaves nothing focused after the reload, so the notice takes focus.
  const noticeRef = useRef<HTMLDivElement>(null);

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
        // The raw error is for the console; the screen gets a sentence a reader can act on.
        console.error('plan loading probe failed:', result.message);
        setFailed(true);
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
    if ((failed || discarded) && !measuring) noticeRef.current?.focus();
  }, [failed, discarded, measuring]);

  useEffect(() => {
    onStatusChange(
      measuring
        ? 'Measuring plan loading. The page will reload and navigate by itself.'
        : failed
          ? FAILURE_SENTENCE
          : shown !== null
            ? loadingStatus(shown)
            : '',
    );
  }, [failed, measuring, onStatusChange, shown]);

  const press = useCallback(async () => {
    setConfirming(false);
    setMeasuring(true);
    setFailed(false);
    setReading(null);
    setDiscarded(false);
    try {
      const { browserEnv, startLoadingProbe } = await import('../loading/runner/run-loading-probe');
      startLoadingProbe(browserEnv());
    } catch (error) {
      console.error('plan loading probe could not start:', error);
      setMeasuring(false);
      setFailed(true);
    }
  }, []);

  const unsupportedId = useId();

  const blocked = measuring || unsupported !== null;

  return (
    <section aria-labelledby={headingId} className="space-y-4 border-t pt-4">
      <h3 id={headingId} className="text-sm font-medium">
        Plan loading
      </h3>
      <p className="text-muted-foreground text-sm">
        Checks whether this server makes the plan screen download its code again when you reload it.{' '}
        {MEASURES_SENTENCE}
      </p>
      <ol className="text-muted-foreground list-decimal space-y-1 pl-5 text-sm">
        <li>Open any plan in this browser.</li>
        <li>
          Come back here and press <strong>Measure plan loading</strong>.
        </li>
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          ref={pressRef}
          aria-disabled={blocked}
          aria-busy={measuring}
          aria-describedby={unsupported === null ? undefined : unsupportedId}
          className="aria-disabled:opacity-60"
          onClick={() => {
            if (!blocked) setConfirming(true);
          }}
        >
          {measuring ? 'Measuring…' : 'Measure plan loading'}
        </Button>
        {/* `resetKey`: a new measurement clears the confirmation, which would otherwise describe the
            PREVIOUS reading. `shown` is null for the whole of one. */}
        <CopyButton
          subject="Plan loading report"
          text={shown === null ? null : () => formatLoadingReport(shown)}
          resetKey={shown}
          unavailableReason={
            measuring
              ? 'Wait for the measurement to finish.'
              : 'Measure plan loading first — there is nothing to copy yet.'
          }
        >
          Copy plan loading report
        </CopyButton>
      </div>

      {unsupported !== null ? (
        <p id={unsupportedId} className="text-sm">
          {unsupported}
        </p>
      ) : null}

      {measuring ? (
        // A bare icon, not `<Spinner>`: its `role="status"` would be a second live region.
        <p className="flex items-center gap-2 text-sm">
          <Loader2 className="text-muted-foreground size-5 animate-spin" aria-hidden="true" />
          The page will reload once and then briefly navigate. This is normal — leave this tab alone
          until the result appears.
        </p>
      ) : null}

      {discarded || failed ? (
        <div ref={noticeRef} tabIndex={-1} className="focus:outline-none">
          {discarded ? (
            <Alert purpose="event" tone="info">
              An earlier measurement did not finish and was discarded. Press{' '}
              <strong>Measure plan loading</strong> to take a new one.
            </Alert>
          ) : (
            <Alert purpose="event" tone="error">
              {FAILURE_SENTENCE}
            </Alert>
          )}
        </div>
      ) : null}

      {shown !== null ? (
        <div className="space-y-3" data-loading-result>
          <h4
            ref={resultHeadingRef}
            tabIndex={-1}
            className="focus:ring-ring focus:ring-offset-background rounded-sm text-sm font-medium focus:ring-2 focus:ring-offset-2 focus:outline-none"
          >
            Plan loading reading
          </h4>
          <p className="text-sm">{plainVerdict(shown)}</p>
          {coldReloadWarning(shown) !== null ? (
            <Alert purpose="condition" tone="info">
              {coldReloadWarning(shown)}
            </Alert>
          ) : null}
          {shown.development ? (
            <Alert purpose="condition" tone="info">
              {DEVELOPMENT_LABEL}
            </Alert>
          ) : null}
          {[shown.reload, shown.revisit, shown.network].map((limb) => (
            <ul key={limb.name} className="text-sm" data-limb={limb.name}>
              {limbLines(limb).map((line, index) => (
                // The index is part of the key because two lines of one limb can read the same;
                // the list is rebuilt whole from `limbLines` and never reordered.
                <li
                  key={`${String(index)}-${line}`}
                  className={index === 0 ? undefined : 'text-muted-foreground'}
                >
                  {line.trim()}
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
