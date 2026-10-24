import type { ActivitySummary, SwimlaneSummary } from '@repo/types';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { useSwimlanes } from '../api/use-swimlanes';

import { focusAfterDelete, type FocusAfterDelete } from './focus-after-delete';
import { swimlaneErrorText } from './swimlane-errors';
import {
  useSwimlaneActions,
  type SwimlaneActions,
  type SwimlanePlanFacts,
} from './use-swimlane-actions';
import { WBS_GUTTER_REASON } from './wbs-swimlane-copy';

import { useAnnounce } from '@/components/ui/announcer';
import type { GutterActions } from '@/features/tsld';
import { gutterWidthForRoom } from '@/features/tsld/render/swimlane-gutter';
import type { Command } from '@/features/undo-redo';
import { useDevicePref } from '@/hooks/use-device-pref';

const EMPTY: readonly SwimlaneSummary[] = [];

const COLLAPSED_KEY = 'schedulepoint-swimlane-gutter';

// A non-boolean `collapsed` is expanded rather than truthy, like the minimap's `open`.
function parseCollapsed(raw: unknown): { collapsed: boolean } {
  return {
    collapsed:
      typeof raw === 'object' &&
      raw !== null &&
      (raw as { collapsed?: unknown }).collapsed === true,
  };
}

/** Which of the swimlane dialogs are open. Independent flags: rename and delete stack over Manage. */
export interface SwimlaneDialogState {
  setup: boolean;
  manage: boolean;
  renameId: string | null;
  deleteId: string | null;
}

const CLOSED: SwimlaneDialogState = { setup: false, manage: false, renameId: null, deleteId: null };

export interface SwimlaneDialogsProps {
  state: SwimlaneDialogState;
  close: (which: keyof SwimlaneDialogState) => void;
  openRename: (swimlaneId: string) => void;
  openDelete: (swimlaneId: string) => void;
  plan: SwimlanePlanFacts;
  /** Told when a delete has landed, before its dialog closes: see {@link focusAfterDelete}. */
  afterDelete: (swimlane: SwimlaneSummary) => void;
  swimlanes: readonly SwimlaneSummary[];
  activities: readonly ActivitySummary[] | undefined;
  actions: SwimlaneActions;
  gate: { writable: boolean; reason: string | null };
}

export interface SwimlaneManagement {
  /** What the lens's button and the corner cell open: Set up when none exist, Manage otherwise. */
  openSwimlanes: () => void;
  /** "Set up swimlanes…" or "Swimlanes…". */
  manageLabel: string;
  /** The gutter's reservation: `0` unless swimlanes are shown. */
  gutterWidthPx: number;
  /** Memoised: the canvas rewrites every label when this identity changes. */
  gutterActions: GutterActions;
  onGutterRoomChange: (room: boolean) => void;
  dialogs: SwimlaneDialogsProps;
}

/**
 * **Everything the workspace needs to set up and manage swimlanes** (swimlanes M2-T9), in one hook so
 * the host adds one call and one element and the gutter's, the lens button's and the dialogs'
 * behaviour cannot drift apart.
 *
 * - **Width.** The gutter's reservation is 0 unless swimlanes are `shown`; otherwise the expanded or
 *   collapsed width, collapsed when the planner chose it (a device preference, ADR-0004) or the
 *   canvas reported there is no room (`onGutterRoomChange`). A forced collapse is announced.
 * - **Identity.** `gutterActions` is memoised on the facts it carries; every callback in it reads the
 *   latest list through a ref, so it does not change when the list does. A re-render with equal
 *   inputs returns the same object, which is what keeps the canvas from rewriting the labels.
 * - **Reads.** The list is read through the shared query (`useSwimlanes`) and only fetched while a
 *   dialog is open; while swimlanes are shown the host's scene already holds it in the cache.
 */
export function useSwimlaneManagement(args: {
  orgSlug: string;
  planId: string;
  plan: SwimlanePlanFacts;
  /** Swimlanes are drawn: the scene has an input. */
  shown: boolean;
  /** How many swimlanes the plan has, once known. A hand-made plan can have none. */
  swimlaneCount?: number | undefined;
  activities: readonly ActivitySummary[] | undefined;
  /** May the caller write swimlanes, and when not, why (the pen sentence). */
  gate: { writable: boolean; reason: string | null };
  /** The workspace's undo history seam. */
  record?: (command: Command) => void;
}): SwimlaneManagement {
  const { orgSlug, planId, plan, shown, activities, record } = args;
  const { writable, reason } = args.gate;
  const announce = useAnnounce();
  const actions = useSwimlaneActions(orgSlug, planId, record);

  const [state, setState] = useState<SwimlaneDialogState>(CLOSED);
  const anyOpen = state.setup || state.manage || state.renameId !== null || state.deleteId !== null;
  const swimlanes = useSwimlanes(orgSlug, planId, anyOpen).data ?? EMPTY;
  // The gutter's move reads the latest list at the moment of the press, so its callbacks (and with them
  // the gutter model's identity) do not change every time the list does.
  const swimlanesRef = useRef(swimlanes);
  useLayoutEffect(() => {
    swimlanesRef.current = swimlanes;
  });

  const [{ collapsed: preferCollapsed }, setPref] = useDevicePref(COLLAPSED_KEY, parseCollapsed, {
    collapsed: false,
  });
  const [room, setRoom] = useState(true);
  const roomRef = useRef(true);
  const preferCollapsedRef = useRef(preferCollapsed);
  useLayoutEffect(() => {
    preferCollapsedRef.current = preferCollapsed;
  });
  const onGutterRoomChange = useCallback(
    (next: boolean): void => {
      if (next === roomRef.current) return;
      roomRef.current = next;
      setRoom(next);
      // A planner who collapsed it themselves already knows; only a change they did not make is news.
      if (!preferCollapsedRef.current) {
        announce(
          next
            ? 'Swimlane names expanded.'
            : 'Swimlane names collapsed: there is not enough room to show them.',
        );
      }
    },
    [announce],
  );
  const width = gutterWidthForRoom({ collapsed: preferCollapsed, room });

  // Where focus goes back to when the last dialog closes. The dialogs are code-split and load on the
  // first request, so by the time the native `<dialog>` calls `showModal()` focus may already have
  // moved, and its own restore would return to the wrong element: the opener is taken at the request.
  // Only the first request of a stack is kept (Rename over Manage returns to Manage's opener).
  const openerRef = useRef<HTMLElement | null>(null);
  const open = useCallback((patch: Partial<SwimlaneDialogState>) => {
    const held = document.activeElement;
    if (openerRef.current === null && held instanceof HTMLElement && held !== document.body) {
      openerRef.current = held;
    }
    setState((prev) => ({ ...prev, ...patch }));
  }, []);
  // "None set up" is a plan with no source AND a hand-made plan with no swimlanes (undoing a setup).
  const setUp = plan.swimlaneSource === 'NONE' || args.swimlaneCount === 0;
  const openSwimlanes = useCallback(
    () => open(setUp ? { setup: true } : { manage: true }),
    [open, setUp],
  );
  const manageLabel = setUp ? 'Set up swimlanes…' : 'Swimlanes…';

  const toggleCollapsed = useCallback(
    () => setPref((prev) => ({ collapsed: !prev.collapsed })),
    [setPref],
  );

  const moving = useRef(false);
  // Where the delete came from and the order the list had, captured when its dialog OPENS: by the time
  // it succeeds a refetch may already have dropped the row, and the order could not be recovered.
  const deleteContext = useRef<Omit<FocusAfterDelete, 'id'>>({ from: 'gutter', order: [] });
  const followsWbs = plan.swimlaneSource === 'WBS';
  const gutterActions = useMemo<GutterActions>(
    () => ({
      // A WBS swimlane is a summary, not a row of its own: it is renamed and ordered where the summary
      // is. The pen's own reason, where that is why, comes first (the planner can fix that one).
      write:
        writable && followsWbs
          ? { writable: false, reason: WBS_GUTTER_REASON }
          : { writable, reason },
      manage: { label: manageLabel, onOpen: openSwimlanes },
      collapse: {
        collapsed: width.collapsed,
        forcedByRoom: width.forcedByRoom,
        onToggle: toggleCollapsed,
      },
      onRename: (swimlaneId) => open({ renameId: swimlaneId }),
      onDelete: (swimlaneId) => {
        deleteContext.current = { from: 'gutter', order: swimlanesRef.current.map((s) => s.id) };
        open({ deleteId: swimlaneId });
      },
      onMove: (swimlaneId, delta) => {
        // One move at a time: a second press while the first is in flight would read the same list,
        // send the same versions and be refused as stale — a failure the planner caused by being quick.
        if (moving.current) return Promise.resolve(false);
        const list = swimlanesRef.current;
        const moved = list.find((s) => s.id === swimlaneId);
        moving.current = true;
        return actions
          .move(list, swimlaneId, delta)
          .then(
            (done) => {
              if (done && moved) {
                const position = list.findIndex((s) => s.id === swimlaneId) + delta + 1;
                announce(
                  `${moved.name} moved to position ${String(position)} of ${String(list.length)}.`,
                );
              }
              return done;
            },
            (error: unknown) => {
              announce(swimlaneErrorText(`move ${moved?.name ?? 'the swimlane'}`, error));
              return false;
            },
          )
          .finally(() => {
            moving.current = false;
          });
      },
    }),
    [
      writable,
      reason,
      followsWbs,
      manageLabel,
      openSwimlanes,
      width.collapsed,
      width.forcedByRoom,
      toggleCollapsed,
      open,
      actions,
      announce,
    ],
  );

  const close = useCallback(
    (which: keyof SwimlaneDialogState) =>
      setState((prev) => ({
        ...prev,
        [which]: which === 'renameId' || which === 'deleteId' ? null : false,
      })),
    [],
  );
  const openRename = useCallback((id: string) => open({ renameId: id }), [open]);
  const openDelete = useCallback(
    (id: string) => {
      deleteContext.current = { from: 'manage', order: swimlanesRef.current.map((s) => s.id) };
      open({ deleteId: id });
    },
    [open],
  );

  // Focus after a delete. The dialog returns focus to what held it — the deleted label or row, still
  // present when it closes and gone a refetch later — so the host picks the destination itself, once
  // the dialog has closed AND the row has left the list, and one frame later so the browser's own
  // restore (inside the dialog's close) has run first and cannot overwrite it.
  const pendingFocus = useRef<FocusAfterDelete | null>(null);
  const afterDelete = useCallback((deleted: SwimlaneSummary): void => {
    pendingFocus.current = { id: deleted.id, ...deleteContext.current };
  }, []);
  useEffect(() => {
    const pending = pendingFocus.current;
    if (pending === null || state.deleteId !== null) return;
    if (swimlanes.some((s) => s.id === pending.id)) return;
    pendingFocus.current = null;
    requestAnimationFrame(() => {
      focusAfterDelete(pending);
    });
  }, [swimlanes, state.deleteId]);

  // The parent's effect runs after the dialog's own close (children first), so this has the last word
  // over the native restore. A delete picks its own destination above, and an opener that has left
  // the page (a menu item) is not a place to return to.
  useEffect(() => {
    if (anyOpen) return;
    const opener = openerRef.current;
    openerRef.current = null;
    if (opener?.isConnected && pendingFocus.current === null) opener.focus();
  }, [anyOpen]);

  const planIdentity = plan.id;
  const planVersion = plan.version;
  const planSource = plan.swimlaneSource;
  const planLevel = plan.swimlaneWbsLevel;
  const dialogs = useMemo<SwimlaneDialogsProps>(
    () => ({
      state,
      close,
      openRename,
      openDelete,
      plan: {
        id: planIdentity,
        version: planVersion,
        swimlaneSource: planSource,
        swimlaneWbsLevel: planLevel,
      },
      afterDelete,
      swimlanes,
      activities,
      actions,
      gate: { writable, reason },
    }),
    [
      state,
      close,
      openRename,
      openDelete,
      planIdentity,
      planVersion,
      planSource,
      planLevel,
      afterDelete,
      swimlanes,
      activities,
      actions,
      writable,
      reason,
    ],
  );

  return {
    openSwimlanes,
    manageLabel,
    gutterWidthPx: shown ? width.widthPx : 0,
    gutterActions,
    onGutterRoomChange,
    dialogs,
  };
}
