import { MoreHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Menu } from '@/components/ui/menu';

export interface RowActionsMenuProps {
  /**
   * The row's subject, as a reader would say it — a client's name, a plan's name.
   *
   * It is **required** and it is not a label: the component builds the accessible name from it,
   * because a table renders one of these per row and a bare "Actions" repeated forty times tells a
   * screen-reader user nothing about which row they are in.
   */
  subject: string;
  /** The row's secondary actions, as `MenuItem`s. The primary stays visible beside this trigger. */
  children: React.ReactNode;
}

/**
 * **A row's secondary actions: the trigger and the menu, never the items.**
 *
 * The shape is ADR-0097 Landing F1's, decided on the calendars table and now on every list in the
 * estate: **the primary action stays visible; the rest move behind a `⋯`**, with every shaded item
 * keeping its reason (ADR-0082). It is deliberately **not** "put the row's actions in a menu" —
 * `docs/UX_STANDARDS.md` "Row / node actions" is written for dense list and tree rows, which have
 * nowhere to show actions at all; these tables have an actions column, and burying `Edit` behind a
 * click would trade the frequent interaction for the infrequent.
 *
 * **What is extracted, and what deliberately is not.** Written out side by side, the five menus
 * share **no items at all** — calendars offers a tier move, resources an archive, clients and
 * projects and plans only a delete. What they share is the trigger: a ghost icon button carrying
 * `aria-haspopup`, `aria-expanded`, a subject-bearing name, the anchor arithmetic, and a `Menu`
 * whose label is the **same string** as the trigger's, so the phrase a reader hears opening the menu
 * is the phrase they hear landing inside it. That is five copies of a keyboard and naming contract,
 * which is exactly the thing ADR-0065 and ADR-0121 record drifting invisibly — each copy looks right
 * alone, and only somebody opening two rows in two tables would ever see they differ.
 *
 * The items stay at the call site because they are not shared and pretending otherwise would mean a
 * props object growing one boolean per table.
 *
 * `restoreFocusRef` is the trigger, which is what stops focus falling to `<body>` when a menu item
 * removes the row it acted on — the failure this register records four separate times.
 */
export function RowActionsMenu({ subject, children }: RowActionsMenuProps): React.ReactElement {
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const label = `Actions for ${subject}`;

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        size="icon-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={anchor !== null}
        onClick={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          setAnchor({ x: rect.left, y: rect.bottom });
        }}
      >
        <MoreHorizontal aria-hidden="true" className="size-4" />
      </Button>
      <Menu
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        anchor={anchor ?? { x: 0, y: 0 }}
        label={label}
        restoreFocusRef={triggerRef}
      >
        {children}
      </Menu>
    </>
  );
}
