import type { ActivitySummary, SwimlaneSource, SwimlaneSummary } from '@repo/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useSwimlanes } from '../api/use-swimlanes';

import { useSwimlaneActions, type SwimlaneActions } from './use-swimlane-actions';

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
interface DialogState {
  setup: boolean;
  manage: boolean;
  renameId: string | null;
  deleteId: string | null;
}

const CLOSED: DialogState = { setup: false, manage: false, renameId: null, deleteId: null };

export interface SwimlaneDialogsProps {
  state: DialogState;
  close: (which: keyof DialogState) => void;
  openRename: (swimlaneId: string) => void;
  openDelete: (swimlaneId: string) => void;
  plan: { id: string; version: number };
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
  plan: { id: string; version: number; swimlaneSource: SwimlaneSource };
  /** Swimlanes are drawn: the scene has an input. */
  shown: boolean;
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

  const [state, setState] = useState<DialogState>(CLOSED);
  const anyOpen = state.setup || state.manage || state.renameId !== null || state.deleteId !== null;
  const swimlanes = useSwimlanes(orgSlug, planId, anyOpen).data ?? EMPTY;
  // The gutter's move reads the latest list at the moment of the press, so its callbacks (and with them
  // the gutter model's identity) do not change every time the list does.
  const swimlanesRef = useRef(swimlanes);
  useEffect(() => {
    swimlanesRef.current = swimlanes;
  });

  const [{ collapsed: preferCollapsed }, setPref] = useDevicePref(COLLAPSED_KEY, parseCollapsed, {
    collapsed: false,
  });
  const [room, setRoom] = useState(true);
  const roomRef = useRef(true);
  const preferCollapsedRef = useRef(preferCollapsed);
  useEffect(() => {
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

  const open = useCallback(
    (patch: Partial<DialogState>) => setState((prev) => ({ ...prev, ...patch })),
    [],
  );
  const setUp = plan.swimlaneSource === 'NONE';
  const openSwimlanes = useCallback(
    () => open(setUp ? { setup: true } : { manage: true }),
    [open, setUp],
  );
  const manageLabel = setUp ? 'Set up swimlanes…' : 'Swimlanes…';

  const toggleCollapsed = useCallback(
    () => setPref((prev) => ({ collapsed: !prev.collapsed })),
    [setPref],
  );

  const gutterActions = useMemo<GutterActions>(
    () => ({
      write: { writable, reason },
      manage: { label: manageLabel, onOpen: openSwimlanes },
      collapse: {
        collapsed: width.collapsed,
        forcedByRoom: width.forcedByRoom,
        onToggle: toggleCollapsed,
      },
      onRename: (swimlaneId) => open({ renameId: swimlaneId }),
      onDelete: (swimlaneId) => open({ deleteId: swimlaneId }),
      onMove: (swimlaneId, delta) => {
        const list = swimlanesRef.current;
        const moved = list.find((s) => s.id === swimlaneId);
        void actions.move(list, swimlaneId, delta).then(
          (done) => {
            if (!done || !moved) return;
            const position = list.findIndex((s) => s.id === swimlaneId) + delta + 1;
            announce(
              `${moved.name} moved to position ${String(position)} of ${String(list.length)}.`,
            );
          },
          (error: unknown) =>
            announce(
              `Could not move the swimlane: ${error instanceof Error ? error.message : 'something went wrong.'}`,
            ),
        );
      },
    }),
    [
      writable,
      reason,
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
    (which: keyof DialogState) =>
      setState((prev) => ({
        ...prev,
        [which]: which === 'renameId' || which === 'deleteId' ? null : false,
      })),
    [],
  );
  const openRename = useCallback((id: string) => open({ renameId: id }), [open]);
  const openDelete = useCallback((id: string) => open({ deleteId: id }), [open]);
  const planId_ = plan.id;
  const planVersion = plan.version;
  const dialogs = useMemo<SwimlaneDialogsProps>(
    () => ({
      state,
      close,
      openRename,
      openDelete,
      plan: { id: planId_, version: planVersion },
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
      planId_,
      planVersion,
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
