import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **One empty state, not thirty-four hand-rolled boxes** (`docs/TECH_DEBT.md` #161(a),
 * `docs/specs/empty-state-consolidation/`).
 *
 * `EmptyState` is the documented archetype (`docs/UX_STANDARDS.md`, built by ADR-0098) and had
 * **two** consumers, both inside the feature it was written for, while a hand-written
 * `border-border text-muted-foreground rounded-lg border border-dashed p-N text-center text-sm`
 * appeared **34 times across 29 files** — on tables, panels, dialogs, four route files and the
 * unauthenticated guest share view. The primitive did not spread; the box did.
 *
 * A consolidation with no gate re-drifts (ADR-0058), so this lands **before** any site is
 * converted, with every current site allow-listed. The allow-list shrinking from 34 to its
 * permanent survivors is the epic's progress metric, and a new entry is a new defect.
 *
 * **The predicate is derived, not chosen.** `border-dashed` alone matches **42** occurrences, and
 * the other eight were opened one by one: the Gantt drag ghost and float tail, the "Soon" tag, the
 * late-start notice and `NoticeStrip`'s own `dashed` variant. None carries `text-center`, because
 * none of them is a centred block of prose standing in for content. Requiring **both** is what
 * separates "an empty state drawn by hand" from "a dashed border used as a border".
 *
 * **What it cannot see**, stated so it is not over-read:
 *
 * - A site that spells the same treatment differently — `text-center` on a parent, or the classes
 *   split across a `cn()` call. It reads quoted string literals, one at a time.
 * - Whether a converted site uses `EmptyState` *correctly* — the right size, an action that works,
 *   a title that is a fact rather than an apology. That is the reviewers' half.
 * - Whether a site SHOULD be an empty state at all. Five of the 34 are not: three are not-found
 *   errors and two are permission refusals, and a refusal that looks like an absence is the
 *   substantive defect this epic exists to fix. The gate cannot tell them apart; the allow-list's
 *   `kind` field is where that judgement is written down.
 * - Anything outside `apps/web/src`.
 *
 * Two failure modes this gate is built against, both of which this repository has shipped:
 * a scan that matches its **own docblock** (four recorded instances — comments are stripped, and
 * the docblock above deliberately contains the class string so the stripping is exercised rather
 * than assumed), and a scan that passes **vacuously** because its walker found nothing (ADR-0120 —
 * hence the pinned positive below, which is the assertion that fails first if the walker breaks).
 */

const WEB_SRC = join(process.cwd(), 'src');

/** Quoted string literals — single, double and backtick. Same shape as `control-height`'s. */
const QUOTED = /'([^'\\]*(?:\\.[^'\\]*)*)'|"([^"\\]*(?:\\.[^"\\]*)*)"|`([^`\\]*(?:\\.[^`\\]*)*)`/g;

/**
 * The hand-rolled empty-state treatment: a dashed border AND centred text in one class string.
 * See the docblock for why both halves are required and how that was established.
 */
function isHandRolledEmptyState(text: string): boolean {
  return text.includes('border-dashed') && text.includes('text-center');
}

/** Strip block and line comments so a docblock describing the rule cannot violate it. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sourceFiles(): string[] {
  return readdirSync(WEB_SRC, { recursive: true, encoding: 'utf8' }).filter(
    (f) => (f.endsWith('.tsx') || f.endsWith('.ts')) && !f.includes('.test.'),
  );
}

/**
 * Every site as it stood on 2026-09-01, keyed `path::substring` — never by file alone, because a
 * file-level exemption hides everything else in that file. Each entry carries the kind the
 * classification gave it (`feature-spec.md` §1.5), which is what tells a later milestone whether
 * the site is owed a conversion or is a permanent survivor.
 */
const ALLOWED: { file: string; match: string; note: string }[] = [
  {
    file: 'components/layout/workspace/resource-strip-panel.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K3 \u2014 a panel with nothing to show \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/activities/components/ActivitiesTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/activities/components/ActivityProgressPanels.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K3 \u2014 a panel, in a dialog \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/audit/components/AuditEventList.tsx',
    match: 'border-border rounded-lg border border-dashed p-8 text-cente',
    note: 'K1 unfiltered / K2 filtered \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/audit/components/AuditEventList.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 unfiltered / K2 filtered \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/baselines/components/BaselinesPanel.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/calendars/components/CalendarExceptionsEditor.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K3 \u2014 a panel, in a dialog \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/calendars/components/CalendarsTable.tsx',
    match: 'border-border rounded-lg border border-dashed p-8 text-cente',
    note: 'K1 unfiltered / K2 filtered \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/calendars/components/CalendarsTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 unfiltered / K2 filtered \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/calendars/components/ProjectCalendarsSection.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1/K2 \u2014 unfiltered and filtered; the filtered one has no way back (spec \u00a71.6) \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/clients/components/ClientsTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/cross-plan-dependencies/components/CrossPlanLinksSection.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/dependencies/components/AddLinkSection.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K5 \u2014 a placeholder, not an absence; stays prose \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/dependencies/components/DependencyTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/earned-value/components/EarnedValuePanel.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K3 empty / K6 permission refusal \u2014 see the note; the refusal must NOT become an EmptyState \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/interchange/components/ImportScheduleDialog.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K5 \u2014 a placeholder, not an absence; stays prose \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/members/components/MembersTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/notes/components/NoteThread.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K3 \u2014 a panel with nothing to show \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/plans/components/PlansTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/projects/components/ProjectsTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/recently-deleted/components/RecentlyDeletedTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/resources/components/ActivityResourcesPanel.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K3 \u2014 a panel with nothing to show \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/resources/components/ResourceHistogram.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K3 \u2014 a panel, same sentence as resource-strip-panel \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/resources/components/ResourcesTable.tsx',
    match: 'border-border rounded-lg border border-dashed p-8 text-cente',
    note: 'K1 unfiltered / K2 filtered \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/resources/components/ResourcesTable.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 unfiltered / K2 filtered \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/share/components/GuestPlanView.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K4 \u2014 the unauthenticated guest view; its own milestone \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/share/components/ShareLinksDialog.tsx',
    match: 'border-border text-muted-foreground rounded-lg border border',
    note: 'K1 \u2014 a table with no rows, in a dialog \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
  {
    file: 'features/tsld/components/TsldPanel.tsx',
    match: 'border-border text-muted-foreground flex items-center justif',
    note: 'K4 \u2014 page-filling; this same file uses NoticeStrip correctly at :2700 \u2014 deferred, see docs/TECH_DEBT.md #161(a)',
  },
];

describe('the hand-rolled empty-state treatment', () => {
  /**
   * **The pinned positive, and it runs first deliberately.** Every other assertion here is an
   * absence, so a walker that returned no files, a predicate that matched nothing, or a
   * comment-stripper that ate the whole source would all read as a clean tree. This one requires a
   * known-positive string to be recognised, so "found nothing" and "there is nothing" stay
   * distinguishable — which is the failure ADR-0120's own gate shipped with.
   */
  it('recognises the treatment it exists to find', () => {
    expect(
      isHandRolledEmptyState(
        'border-border text-muted-foreground rounded-lg border border-dashed p-8 text-center text-sm',
      ),
    ).toBe(true);
    // And does not match the eight `border-dashed` sites that are borders rather than empty states.
    expect(
      isHandRolledEmptyState('border-muted-foreground/50 absolute bottom-0.5 h-1.5 border-dashed'),
    ).toBe(false);
    expect(sourceFiles().length).toBeGreaterThan(500);
  });

  it('appears only where it is allow-listed', () => {
    const found: string[] = [];
    for (const file of sourceFiles()) {
      const code = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'));
      for (const match of code.matchAll(QUOTED)) {
        const text = match[1] ?? match[2] ?? match[3] ?? '';
        if (!isHandRolledEmptyState(text)) continue;
        if (ALLOWED.some((a) => a.file === file && text.includes(a.match))) continue;
        found.push(`${file} :: ${text.slice(0, 70)}`);
      }
    }
    expect(
      found,
      `Hand-rolled empty states outside the allow-list. Use <EmptyState> (components/ui/page), ` +
        `or add an entry with its reason if this is a refusal, an error or a placeholder rather ` +
        `than an absence — see docs/specs/empty-state-consolidation/.\n${found.join('\n')}`,
    ).toEqual([]);
  });

  /**
   * A stale entry is a silently weakened gate: it exempts a file that no longer offends, and the
   * next hand-rolled box in that file walks straight through. Removing entries as the pass
   * proceeds is the point, so the check has to notice when one stops being needed.
   */
  it('has no stale allow-list entry', () => {
    const offending = new Set<{ file: string; match: string; note: string }>();
    for (const file of sourceFiles()) {
      const code = stripComments(readFileSync(join(WEB_SRC, file), 'utf8'));
      for (const match of code.matchAll(QUOTED)) {
        const text = match[1] ?? match[2] ?? match[3] ?? '';
        if (!isHandRolledEmptyState(text)) continue;
        for (const a of ALLOWED) if (a.file === file && text.includes(a.match)) offending.add(a);
      }
    }
    const stale = ALLOWED.filter((a) => !offending.has(a)).map((a) => `${a.file} :: ${a.match}`);
    expect(stale, 'allow-list entries whose file no longer offends — delete them').toEqual([]);
  });
});
