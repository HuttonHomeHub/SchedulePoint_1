import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { useCallback, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';

import {
  GUTTER_NO_ROOM_REASON,
  isCollapsedGutterWidth,
  swimlaneGutterText,
  type GutterActions,
  type GutterLabelText,
  type GutterSwimlane,
} from '../render/swimlane-gutter';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem, MenuSection } from '@/components/ui/menu';
import { rovingIndexFor, containerShouldStandDown } from '@/components/ui/toolbar/toolbar-keyboard';
import { useToolbarFocusHandoff } from '@/components/ui/toolbar/use-focus-handoff';
import { useTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

export interface SwimlaneGutterProps {
  rootRef: React.RefObject<HTMLDivElement | null>;
  swimlanes: readonly GutterSwimlane[];
  /** The width the host reserved (`gutterWidthFor`). Whether this is the collapsed strip follows
   * from it, so there is one input and no pair that can disagree. */
  widthPx: number;
  cornerHeightPx: number;
  /** Height reserved at the foot (the resource strip), so the labels stop where the scene does. */
  footPx: number;
  /** The corner cell's and the menus' commands. Absent: a read-only gutter — still navigable. */
  actions?: GutterActions | undefined;
  /** Bring a swimlane into view; called when its button takes focus (C9). */
  onReveal?: ((swimlane: GutterSwimlane) => void) | undefined;
}

/**
 * **The swimlane gutter** (swimlanes epic M2-T3 geometry, M2-T9 composite; `docs/specs/swimlanes/
 * ui-architecture.md` C3, C4, C9, C12).
 *
 * ## A vertical toolbar on the shared roving rule, not the `Toolbar` component
 *
 * The labels are one `role="toolbar"` with `aria-orientation="vertical"` and **one tab stop**: Up and
 * Down move between swimlanes, Home and End jump, Tab leaves. It uses `rovingIndexFor` and
 * `containerShouldStandDown` from `toolbar-keyboard.ts` and the shared focus hand-off, but not
 * `Toolbar`, which "is horizontal, full stop" (`Toolbar.tsx`): a vertical stack that told assistive
 * technology it was horizontal would be wrong about the one thing `aria-orientation` exists to say.
 *
 * ## One voice for assistive technology
 *
 * Each label IS the button: its accessible name is "Mechanical, swimlane 2 of 5, 14 activities, 3
 * lanes" (`aria-label`, which starts with the visible text — WCAG 2.5.3; on the collapsed strip the
 * position leads: "2, Mechanical, swimlane 2 of 5, …") and the text inside is visual. There is no second, hidden copy of the names, so nothing is announced twice.
 *
 * **Every swimlane has a button, in view or not.** A swimlane panned out of view is *parked* — zero
 * height and transparent, written by the canvas's frame loop (`syncGutter`) — rather than
 * `display: none`, because a button that is not rendered cannot take focus, and focus is how a
 * keyboard or screen-reader user brings an off-screen swimlane into view (`onReveal`).
 *
 * ## Label sizing: the accessible name is the full name
 *
 * The visible text is clamped to the lines the swimlane's height allows (`maxLines`, from
 * `GUTTER_LINE_PX`), which are px and do not follow a reader's text size. That was chosen over
 * deriving the line height from rendered text because the full name never depends on the visible
 * text: it is the button's accessible name, the tooltip's text on focus (`name-echo`), and the menu's
 * heading — so a clipped line loses nothing a reader needs.
 *
 * ## Pointer behaviour over the gutter
 *
 * The wheel does nothing here, **deliberately**. The canvas's wheel is a zoom about the time axis
 * (`TsldCanvas` `onWheel`), and the gutter has no time axis, so forwarding it would zoom about a
 * point off the left edge of the scene. The lane axis is panned by dragging the ground, by the
 * minimap, and by focus (above). `overscroll-contain` stops the wheel chaining to the page.
 *
 * Padding and line height are the classes below, and `GUTTER_PAD_PX` / `GUTTER_LINE_PX` are the
 * numbers the model reasons with; `TsldPanel.gutter.test.tsx` pins the two together.
 */
export function SwimlaneGutter({
  rootRef,
  swimlanes,
  widthPx,
  cornerHeightPx,
  footPx,
  actions,
  onReveal,
}: SwimlaneGutterProps): React.ReactElement {
  const collapsed = isCollapsedGutterWidth(widthPx);
  const labels = useMemo(
    () => swimlaneGutterText({ swimlanes, widthPx, collapsed }),
    [swimlanes, widthPx, collapsed],
  );
  const named = labels.filter((l) => l.id !== null);

  // The roving stop: the last label focused, or the first. A key that no longer names a label falls
  // back to the first, so the single tab stop can never point at nothing.
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const stopKey = labels.some((l) => l.key === activeKey) ? activeKey : (labels[0]?.key ?? null);

  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const [menu, setMenu] = useState<{ key: string; x: number; y: number } | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setMenu(null), []);

  const focusHandoff = useToolbarFocusHandoff({
    containerRef: rootRef,
    resolvedIds: labels.map((l) => l.key),
    toolbarLabel: 'Swimlanes',
    lostReasonFor: () => 'the swimlane was deleted',
  });

  // A move re-orders the labels, and React may move the focused node to do it, which drops focus.
  // The label that asked for the move takes it back once the order has changed.
  const refocusKey = useRef<string | null>(null);
  useLayoutEffect(() => {
    const key = refocusKey.current;
    if (key === null) return;
    refocusKey.current = null;
    buttons.current.get(key)?.focus();
  }, [labels]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // The menu is portalled but its React events still reach here; only a key pressed ON a label is ours.
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    // On a label, or on the container itself: focus is left there by the hand-off when the swimlane it
    // was on is deleted, and the next arrow must start the sequence (`rovingIndexFor`'s `-1`), not die.
    const onContainer = target === event.currentTarget;
    if (!onContainer && !target.closest('[data-swimlane]')) return;
    if (containerShouldStandDown(event)) return;
    const key = event.key;
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(key)) return;
    const from = onContainer
      ? -1
      : labels.findIndex(
          (l) => l.key === target.closest('[data-swimlane]')?.getAttribute('data-swimlane'),
        );
    const next = labels[rovingIndexFor(key, from, labels.length)];
    if (!next) return;
    event.preventDefault();
    buttons.current.get(next.key)?.focus();
  };

  const menuLabel = menu ? labels.find((l) => l.key === menu.key) : undefined;
  const menuIndex = menuLabel ? named.findIndex((l) => l.key === menuLabel.key) : -1;
  // The label menus' own gate when the host gives one (a WBS swimlane is a summary, so its rows are shut
  // for a reason the corner's command is not); else the pen's, which is the corner's too.
  const rowGate = actions?.rows ?? actions?.write;
  const writable = rowGate?.writable ?? false;
  const writeReason = rowGate?.reason ?? undefined;

  return (
    <div
      data-testid="tsld-swimlane-gutter"
      data-chrome="swimlane-gutter"
      className="bg-canvas border-border absolute inset-y-0 left-0 z-10 overflow-hidden overscroll-contain border-r"
      style={{ width: widthPx }}
    >
      <div
        data-testid="tsld-swimlane-gutter-corner"
        className={cn(
          'border-border flex items-center gap-1 border-b px-1',
          collapsed ? 'justify-center' : 'justify-between',
        )}
        style={{ height: cornerHeightPx }}
      >
        {actions ? <CornerControls actions={actions} collapsed={collapsed} /> : null}
      </div>
      {/* The tab stop is the roving label, so the container is only ever focused programmatically (by
          the hand-off when the focused swimlane is deleted): `tabIndex={-1}`. */}
      <div
        ref={rootRef}
        role="toolbar"
        aria-label="Swimlanes"
        aria-orientation="vertical"
        tabIndex={-1}
        data-testid="tsld-swimlane-gutter-labels"
        className="absolute inset-x-0 overflow-hidden"
        style={{ top: cornerHeightPx, bottom: footPx }}
        onKeyDown={onKeyDown}
        {...focusHandoff}
      >
        {labels.map((l) => (
          <GutterLabelButton
            key={l.key}
            label={l}
            collapsed={collapsed}
            tabStop={l.key === stopKey}
            expanded={menu?.key === l.key}
            hasMenu={actions !== undefined && l.id !== null}
            registerButton={(node) => {
              if (node) buttons.current.set(l.key, node);
              else buttons.current.delete(l.key);
            }}
            onFocusLabel={() => {
              setActiveKey(l.key);
              const swimlane = swimlanes[l.index];
              if (swimlane) onReveal?.(swimlane);
            }}
            onOpenMenu={(point, button) => {
              openerRef.current = button;
              setMenu({ key: l.key, ...point });
            }}
          />
        ))}
      </div>
      {actions && menuLabel && menuLabel.id !== null ? (
        <Menu
          open
          onClose={closeMenu}
          anchor={{ x: menu?.x ?? 0, y: menu?.y ?? 0 }}
          label={`Actions for ${menuLabel.name}`}
          restoreFocusRef={openerRef}
          openerRef={openerRef}
        >
          {/* The swimlane's full name, visibly: the way a touch reader gets it from the collapsed strip. */}
          <MenuSection label={menuLabel.name} />
          <MenuItem
            disabled={!writable}
            {...(writeReason ? { disabledReason: writeReason } : {})}
            onSelect={() => actions.onRename(menuLabel.id as string)}
          >
            Rename…
          </MenuItem>
          <MenuItem
            disabled={!writable || menuIndex <= 0}
            {...(!writable && writeReason
              ? { disabledReason: writeReason }
              : menuIndex <= 0
                ? { disabledReason: 'This swimlane is already first.' }
                : {})}
            onSelect={() => {
              // Armed only once the write has landed: a refused or no-op move must not leave focus
              // waiting to jump on some later change of the list.
              const key = menuLabel.key;
              void actions.onMove(menuLabel.id as string, -1).then((moved) => {
                if (moved) refocusKey.current = key;
              });
            }}
          >
            Move up
          </MenuItem>
          <MenuItem
            disabled={!writable || menuIndex === named.length - 1}
            {...(!writable && writeReason
              ? { disabledReason: writeReason }
              : menuIndex === named.length - 1
                ? { disabledReason: 'This swimlane is already last.' }
                : {})}
            onSelect={() => {
              // Armed only once the write has landed: a refused or no-op move must not leave focus
              // waiting to jump on some later change of the list.
              const key = menuLabel.key;
              void actions.onMove(menuLabel.id as string, 1).then((moved) => {
                if (moved) refocusKey.current = key;
              });
            }}
          >
            Move down
          </MenuItem>
          <MenuItem
            destructive
            disabled={!writable}
            {...(writeReason ? { disabledReason: writeReason } : {})}
            onSelect={() => actions.onDelete(menuLabel.id as string)}
          >
            Delete…
          </MenuItem>
        </Menu>
      ) : null}
    </div>
  );
}

/**
 * The corner cell's controls: the **Swimlanes…** command (the object's own entry, ADR-0093) and the
 * expand/collapse control. In the collapsed strip only the expand control fits a 44 px cell as a
 * full target, so the command is reached from `View ▾ ▸ Structure` there.
 *
 * Both shade rather than hide (ADR-0204): `aria-disabled` plus a guard, never native `disabled`, with
 * the reason as a permanent `sr-only` description AND a `reason-echo` tooltip, so the keyboard, the
 * pointer and a finger each get it.
 */
const CORNER_LABEL = 'Swimlanes…';

function CornerControls({
  actions,
  collapsed,
}: {
  actions: GutterActions;
  collapsed: boolean;
}): React.ReactElement {
  const manageReasonId = useId();
  const collapseReasonId = useId();
  const manageReason = actions.write.writable ? undefined : (actions.write.reason ?? undefined);
  const collapseReason = actions.collapse.forcedByRoom ? GUTTER_NO_ROOM_REASON : undefined;
  // 176 px cannot hold "Set up swimlanes…" beside the collapse control, so the corner always SHOWS
  // "Swimlanes…" and the accessible name is the full command (which contains it: WCAG 2.5.3); a
  // name-echo tooltip says the full text when it differs.
  const manageTip = useTooltip({
    content:
      manageReason ?? (actions.manage.label === CORNER_LABEL ? undefined : actions.manage.label),
    purpose: manageReason ? 'reason-echo' : 'name-echo',
  });
  // The name is "Swimlane names" (pressed or not); the tip says what a press DOES, which the name does
  // not, so it is a `description` — and the shut reason where there is one.
  const collapseTip = useTooltip({
    content: collapseReason ?? (collapsed ? 'Show swimlane names' : 'Hide swimlane names'),
    purpose: collapseReason ? 'reason-echo' : 'description',
  });
  const Icon = collapsed ? PanelLeftOpen : PanelLeftClose;
  const collapseRef = useRef<HTMLButtonElement>(null);
  const { ref: collapseTipRef, ...collapseTipTrigger } = collapseTip.triggerProps;
  // The strip can collapse under the reader (a narrow window forces it) while "Swimlanes…" holds
  // focus; the command is not in the strip, so focus goes to the control that is (WCAG 2.4.3).
  const focusCollapse = useCallback(() => collapseRef.current?.focus(), []);
  return (
    <>
      {collapsed ? null : (
        <ManageButton
          tip={manageTip}
          actions={actions}
          reason={manageReason}
          reasonId={manageReasonId}
          onLoseFocus={focusCollapse}
        />
      )}
      <Button
        {...collapseTipTrigger}
        ref={(node) => {
          collapseTipRef(node);
          collapseRef.current = node;
        }}
        type="button"
        variant="ghost"
        size="icon"
        // A stable name with a pressed state, not a name that flips with the state it reports.
        aria-label="Swimlane names"
        aria-pressed={!collapsed}
        aria-disabled={collapseReason !== undefined || undefined}
        aria-describedby={collapseReason !== undefined ? collapseReasonId : undefined}
        onClick={() => {
          if (collapseReason === undefined) actions.collapse.onToggle();
        }}
        className="shrink-0"
      >
        <Icon aria-hidden="true" className="size-4" />
      </Button>
      {collapseReason !== undefined ? (
        <span id={collapseReasonId} className="sr-only">
          {collapseReason}
        </span>
      ) : null}
      {collapseTip.tooltip}
    </>
  );
}

/**
 * The corner's **Swimlanes…** command. Its own component so that its unmount can see whether it held
 * focus: a layout-effect cleanup runs before the DOM node is removed, which a parent's effect after
 * the commit cannot do (by then focus is already on `<body>`).
 */
function ManageButton({
  tip,
  actions,
  reason,
  reasonId,
  onLoseFocus,
}: {
  tip: ReturnType<typeof useTooltip>;
  actions: GutterActions;
  reason: string | undefined;
  reasonId: string;
  onLoseFocus: () => void;
}): React.ReactElement {
  const ref = useRef<HTMLButtonElement>(null);
  const loseFocusRef = useRef(onLoseFocus);
  useLayoutEffect(() => {
    loseFocusRef.current = onLoseFocus;
  });
  useLayoutEffect(() => {
    const node = ref.current;
    return () => {
      if (node !== null && document.activeElement === node) loseFocusRef.current();
    };
  }, []);
  const { ref: tipRef, ...tipTrigger } = tip.triggerProps;
  return (
    <>
      <Button
        {...tipTrigger}
        ref={(node) => {
          tipRef(node);
          ref.current = node;
        }}
        type="button"
        variant="outline"
        size="sm"
        aria-label={actions.manage.label}
        aria-disabled={reason !== undefined || undefined}
        aria-describedby={reason !== undefined ? reasonId : undefined}
        onClick={() => {
          if (reason === undefined) actions.manage.onOpen();
        }}
        className="min-w-0"
      >
        {CORNER_LABEL}
      </Button>
      {reason !== undefined ? (
        <span id={reasonId} className="sr-only">
          {reason}
        </span>
      ) : null}
      {tip.tooltip}
    </>
  );
}

/**
 * One swimlane's label — and its button. Rendered *parked* (`data-parked`, zero height, transparent)
 * until the canvas's first frame positions it; the loop un-parks it while any of the swimlane is in
 * view and parks it again when it is panned away (see `syncGutter` in `TsldCanvas`).
 *
 * "No swimlane" has no menu (nothing about it can be renamed, moved or deleted), but is a button all
 * the same: it is a stop in the stack, and activating it only brings it into view.
 */
function GutterLabelButton({
  label,
  collapsed,
  tabStop,
  expanded,
  hasMenu,
  registerButton,
  onFocusLabel,
  onOpenMenu,
}: {
  label: GutterLabelText;
  collapsed: boolean;
  tabStop: boolean;
  expanded: boolean;
  hasMenu: boolean;
  registerButton: (node: HTMLButtonElement | null) => void;
  onFocusLabel: () => void;
  onOpenMenu: (point: { x: number; y: number }, button: HTMLButtonElement) => void;
}): React.ReactElement {
  // The full name: always on focus when the strip shows a number or the name was cut. A tap on the
  // collapsed strip opens the menu (which names the swimlane); "No swimlane" has no menu, so its tap
  // shows the tip instead.
  const tip = useTooltip({
    content: collapsed || label.cut ? label.name : undefined,
    purpose: 'name-echo',
    placement: 'below',
  });
  const { ref: tipRef, ...tipTrigger } = tip.triggerProps;

  const open = (button: HTMLButtonElement, point?: { x: number; y: number }): void => {
    const rect = button.getBoundingClientRect();
    onOpenMenu(point ?? { x: rect.right, y: rect.top }, button);
  };

  return (
    <button
      {...tipTrigger}
      ref={(node) => {
        tipRef(node);
        registerButton(node);
      }}
      type="button"
      data-swimlane={label.key}
      data-toolbar-item={label.key}
      data-cut={label.cut}
      data-parked="true"
      aria-label={label.accessibleName}
      aria-haspopup={hasMenu ? 'menu' : undefined}
      aria-expanded={hasMenu ? expanded : undefined}
      tabIndex={tabStop ? 0 : -1}
      onFocus={(event) => {
        tipTrigger.onFocus(event);
        onFocusLabel();
      }}
      onClick={(event) => {
        if (hasMenu) open(event.currentTarget);
        else if (collapsed) tip.show();
      }}
      onKeyDown={(event) => {
        // ArrowDown is the roving key here, so the menu button's usual opener is taken; ArrowRight
        // (into a flyout) is the vertical toolbar's natural one. Enter and Space still open it.
        if (event.key !== 'ArrowRight' || !hasMenu) return;
        // A chord (Alt+Right is Back, Ctrl+Right a word jump) is the browser's or the reader's, not ours.
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        event.preventDefault();
        open(event.currentTarget);
      }}
      onContextMenu={(event) => {
        if (!hasMenu) return;
        event.preventDefault();
        // Shift+F10 and the Menu key report no pointer position (0, 0): anchor at the button instead.
        const keyboard = event.clientX === 0 && event.clientY === 0;
        open(event.currentTarget, keyboard ? undefined : { x: event.clientX, y: event.clientY });
      }}
      style={{ top: 0, height: 0 }}
      className={cn(
        // `data-parked` is the hidden-but-focusable state; the loop clears it and writes top/height.
        'border-border text-foreground hover:bg-accent focus-visible:ring-ring absolute inset-x-0 overflow-hidden border-b px-2 py-1 text-left text-xs leading-4 wrap-anywhere focus-visible:ring-2 focus-visible:outline-none focus-visible:ring-inset',
        'data-[parked=true]:pointer-events-none data-[parked=true]:border-0 data-[parked=true]:p-0 data-[parked=true]:opacity-0',
        collapsed && 'text-center',
      )}
    >
      <span
        aria-hidden="true"
        style={{
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          WebkitLineClamp: collapsed ? 1 : label.maxLines,
          overflow: 'hidden',
        }}
      >
        {label.text}
      </span>
      {tip.tooltip}
    </button>
  );
}
