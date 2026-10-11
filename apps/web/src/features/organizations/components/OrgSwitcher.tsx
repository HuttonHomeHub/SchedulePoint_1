import { useNavigate, useParams } from '@tanstack/react-router';
import { Building, Check, ChevronDown } from 'lucide-react';

import { useOrganizations } from '../api/use-organizations';

import { Button } from '@/components/ui/button';
import { Menu, MenuItem, useMenuTrigger } from '@/components/ui/menu';
import { useTooltip } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

/**
 * Header control to switch the active organisation. The URL is authoritative: choosing an
 * organisation navigates to `/orgs/$orgSlug`. **Hidden until the user has organisations**, and it
 * is a ghost button that opens a {@link Menu} of `menuitemradio` rows (toolbar-redesign M6 V5,
 * CQ-4).
 *
 * **It was a native `<select>` "for full keyboard/screen-reader support", and the replacement keeps
 * what that argument was protecting.** The menu is the APG menu button on the hand-rolled `Menu`
 * primitive — ArrowUp/ArrowDown/Home/End, Escape and Tab returning focus to the trigger — and the
 * current organisation is `aria-checked`, so a screen reader hears which one is active. What the
 * native control had and this does not is **type-ahead**: `Menu` has none, and adding it would
 * change a shared primitive's keyboard contract, which ADR-0111 reviews before release rather than
 * inside a visual milestone. The limit is stated here and in `docs/UX_STANDARDS.md`; the list is the
 * reader's own organisations, which is a handful, not a directory.
 *
 * **Why it is no longer a select.** A bordered `<select>` was the one control in the header that
 * drew a field, a native chevron and a user-agent popup in a band whose every other control is a
 * ghost on the navy; it also could not show its name and its purpose at once, and the closed popup
 * was painted by the platform, outside the design system and outside its contrast gates.
 *
 * **A single organisation is a plain label, not a menu** (ADR-0104: no control whose action cannot
 * apply). A one-row menu whose only row is already checked does nothing, so offering it is a
 * button that opens to a refusal. The exception is the route with no organisation in the path
 * (`/account`, `/me/activity`): there the one organisation is not current, choosing it **is** the
 * reader's route back, so the menu stays — which `e2e-shell/org-less-screens.spec.ts` asserts.
 *
 * **The visible name is the current organisation's, and the CONTROL is capped at
 * {@link ORG_SWITCHER_MAX}** (`--container-org-switcher`, a named sizing token rather than an
 * arbitrary `max-w-[12rem]`) with the name truncating inside it. The cap is on the control and not on
 * the name: the first build capped the name, which left the glyph, the chevron and the padding on top
 * of 12 rem, and the header wrapped to two lines at 1024 with two organisations (measured, M6 §5).
 * And
 * the accessible name carries the whole of it: "Active organisation: ‹Name›". That contains the
 * visible text, so 2.5.3 holds even when the visible text is cut. The tooltip carries the whole
 * name too — a `name-echo`, because the name is already in the control's own name.
 */
const ORG_SWITCHER_MAX = 'max-w-org-switcher';

export function OrgSwitcher(): React.ReactElement | null {
  const { data: organizations } = useOrganizations();
  const params = useParams({ strict: false });
  const navigate = useNavigate();
  const { triggerRef, open, anchor, close, toggle } = useMenuTrigger();
  const current = 'orgSlug' in params ? params.orgSlug : undefined;
  const currentOrganization = organizations?.find((organization) => organization.slug === current);
  const tip = useTooltip({
    content: currentOrganization?.name,
    purpose: 'name-echo',
    disabled: open,
  });

  if (!organizations || organizations.length === 0) {
    return null;
  }

  if (organizations.length === 1 && currentOrganization) {
    // **Plain text, with no glyph and no button metrics** (M6 review U7): the building beside it and the
    // identical padding made it read as a button that had gone dead. One tooltip mechanism — the
    // design-system one, which also opens on touch — carries the full name for the truncated case;
    // the native `title` it had was a second mechanism, hover-only, on the same text.
    //
    // **It is deliberately not a tab stop**, so a keyboard reader is not asked to stop on something
    // that does nothing (ADR-0104). Nothing is lost to them: the name is real text in the tree, and
    // CSS truncation shortens what is painted, not what is read, so a screen reader announces
    // "Active organisation: ‹the whole name›" in reading order. A sighted keyboard-only reader gets
    // the cut text — the one reader the tooltip does not reach — and that is accepted over a
    // do-nothing tab stop.
    return (
      <span
        {...tip.triggerProps}
        className={cn(
          'text-foreground inline-flex h-(--control-h) items-center px-2 text-sm font-medium',
          ORG_SWITCHER_MAX,
        )}
      >
        <span className="sr-only">Active organisation: </span>
        <span className="min-w-0 truncate">{currentOrganization.name}</span>
        {tip.tooltip}
      </span>
    );
  }

  const visibleName = currentOrganization?.name ?? 'Select organisation';

  return (
    <>
      <Button
        {...tip.triggerProps}
        ref={(el) => {
          tip.triggerProps.ref(el);
          triggerRef.current = el;
        }}
        variant="ghost"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={
          currentOrganization
            ? `Active organisation: ${currentOrganization.name}`
            : 'Select organisation (active organisation: none)'
        }
        onClick={toggle}
        className={cn('gap-1.5 px-2', ORG_SWITCHER_MAX)}
      >
        <Building aria-hidden="true" className="size-4 shrink-0" />
        <span className="min-w-0 truncate">{visibleName}</span>
        <ChevronDown aria-hidden="true" className="size-3.5 shrink-0 opacity-70" />
        {tip.tooltip}
      </Button>
      <Menu
        open={open}
        onClose={close}
        anchor={anchor}
        label="Organisations"
        restoreFocusRef={triggerRef}
      >
        {organizations.map((organization) => {
          const isCurrent = organization.slug === current;
          return (
            <MenuItem
              key={organization.id}
              selected={isCurrent}
              onSelect={() =>
                void navigate({ to: '/orgs/$orgSlug', params: { orgSlug: organization.slug } })
              }
            >
              <Check aria-hidden="true" className={cn('size-4', isCurrent ? '' : 'opacity-0')} />
              {organization.name}
            </MenuItem>
          );
        })}
      </Menu>
    </>
  );
}
