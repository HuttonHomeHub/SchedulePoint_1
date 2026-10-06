import { textLinkVariants } from '@/components/ui/text-link';
import { GROUPS } from '@/features/staff/model/panel-copy';

const LINKS = [GROUPS.conditions, GROUPS.installation, GROUPS.tools, GROUPS.record] as const;

/**
 * A list of links to the page's groups, placed after the status summary (spec D-1).
 *
 * **Not tabs, and not sticky.** Tabs would hide the conditions behind a click, which breaks
 * ADR-0143's rule that a console answers before it reports, and the summary's own links would need
 * tab-switching logic. A sticky bar costs 10-15 % of a short viewport and can sit on top of the very
 * element a link has just focused (WCAG 2.4.11, Focus Not Obscured). So it is a plain `<nav>` of real
 * anchors: each destination is a group heading that takes focus (`SectionGroup` gives its section
 * `tabIndex={-1}`), which is what makes the link move a keyboard reader as well as the viewport.
 */
export function OnThisPage(): React.ReactElement {
  return (
    <nav
      aria-labelledby="staff-on-this-page"
      className="flex flex-wrap items-baseline gap-x-4 gap-y-1"
    >
      <span id="staff-on-this-page" className="text-muted-foreground text-sm">
        On this page
      </span>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {LINKS.map((group) => (
          <li key={group.id}>
            <a href={`#${group.id}`} className={textLinkVariants({ size: 'sm' })}>
              {group.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
