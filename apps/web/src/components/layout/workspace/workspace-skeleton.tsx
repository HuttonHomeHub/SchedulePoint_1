import { LoadingShape, Skeleton } from '@/components/ui/page';

/**
 * The plan workspace's loading shape, in two pieces that share one material.
 *
 * - {@link CanvasPlaceholder} stands in for the diagram while the plan's activities load; it fills
 *   whatever the workspace gives the canvas and draws nothing else, because a diagram's content is
 *   not knowable.
 * - {@link WorkspaceSkeleton} is the whole frame while the PLAN itself loads — a header band, the
 *   canvas and the panel strip — so the load → loaded transition does not jump from a small centred
 *   box to a full-bleed column (ADR-0030).
 *
 * Two phases load in sequence on this route (the plan, then its activities). The plan phase speaks
 * ("Loading plan…"); the activities phase is `announce="none"`, reusing the same sentence slot, so
 * a reader hears one loading sentence rather than two.
 */
export function CanvasPlaceholder(): React.ReactElement {
  return <Skeleton className="h-full w-full rounded-none" />;
}

/** The activities phase: the canvas area only, with the plan already on screen around it. */
export function CanvasLoading(): React.ReactElement {
  return (
    <LoadingShape label="Loading the plan…" announce="none" className="grid h-full min-h-0 flex-1">
      <CanvasPlaceholder />
    </LoadingShape>
  );
}

/** The plan phase: header band, canvas and panel strip, speaking one sentence. */
export function WorkspaceSkeleton(): React.ReactElement {
  return (
    <LoadingShape label="Loading plan…" className="grid min-h-0 flex-1">
      <div className="flex h-full min-h-0 flex-col">
        <div className="border-border flex flex-col gap-2 border-b px-4 py-3">
          <Skeleton className="h-3 w-56" />
          <Skeleton className="h-6 w-64" />
        </div>
        <div className="min-h-0 flex-1">
          <CanvasPlaceholder />
        </div>
        <div className="border-border h-40 shrink-0 border-t px-4 py-3">
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    </LoadingShape>
  );
}
