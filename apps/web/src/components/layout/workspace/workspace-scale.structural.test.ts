import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Inside the scaled workspace, a layout question is answered by the workspace and a pointer by the
 * helper** (ADR-0222 D5 and D6). Three scans, each with a list a new entry has to be argued onto, in the
 * pattern of `app-shell.structural.test.ts`: jsdom has no layout, so nothing else notices a window media
 * query, a window variant or a raw screen-px read that answers the wrong box under a transform.
 *
 * Comments are stripped first, because the docblocks around each rule name it in prose. Each scan also
 * asserts that every file it allows still has the thing it is allowed (a list of exceptions that stopped
 * being true is the drift ADR-0131 records), and that it found files at all.
 */
const SRC = join(import.meta.dirname, '..', '..', '..');

/** The directories the scaled subtree is made of: the workspace, its toolbar, both views, their panels. */
const ROOTS = [
  'components/layout/workspace',
  'components/ui',
  'features/tsld',
  'features/gantt',
  'features/activities',
  'features/plan-actions',
  'features/plan-lock',
  'features/float-paths',
  'features/revision-compare',
  'features/schedule-health',
];

function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return files(path);
    return /\.tsx?$/.test(entry.name) && !/\.(?:test|spec)\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const strip = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s\/\/.*$/gm, '');

const scanned = ROOTS.flatMap((root) => files(join(SRC, root))).map((path) => ({
  name: relative(SRC, path).split('\\').join('/'),
  code: strip(readFileSync(path, 'utf8')),
}));

function withMatch(pattern: RegExp): string[] {
  return scanned
    .filter(({ code }) => pattern.test(code))
    .map(({ name }) => name)
    .sort();
}

describe('the scan', () => {
  it('reads the scaled subtree', () => {
    expect(scanned.length).toBeGreaterThan(300);
  });
});

describe('window media queries inside the workspace', () => {
  /**
   * `useMediaQuery` and `matchMedia` ask the real window. The workspace's own answer is
   * `useWorkspaceMedia` (`workspace-media.ts`), which falls back to the window itself, so that file is the
   * one place in the subtree that may reach `matchMedia`, and `useMediaQuery` stays a leaf the
   * input-device hooks use.
   */
  const ALLOWED: Record<string, string> = {
    'components/ui/use-media-query.ts':
      'the primitive `useWorkspaceMedia` and the input hooks build on',
    'components/ui/use-coarse-pointer.ts':
      'asks which input the reader has (`pointer: coarse`), which is not a size question',
    'components/layout/workspace/workspace-media.ts':
      'the workspace’s own hook, which falls back to the window outside a workspace',
    'features/activities/components/ActivityEditorSession.tsx':
      'the activity editor is a modal dialog in the top layer: real size, answered by the real window',
  };

  it('is confined to the files that have a reason', () => {
    expect(withMatch(/useMediaQuery\(|\bmatchMedia\(/)).toEqual(Object.keys(ALLOWED).sort());
  });
});

describe('window size variants inside the workspace', () => {
  /**
   * A window variant (`sm:`, `md:`, `lg:`, `short:`, `wide:`, `xs:`, `max-lg:`…) in a scaled subtree asks the
   * window. The converted ones are `ws-*` and `band-*` (container queries, `globals.css`); a file here is
   * one that deliberately still asks the window, with the reason.
   */
  const ALLOWED: Record<string, string> = {
    'components/layout/workspace/activity-bottom-panel.tsx':
      '`lg:contents` shows the code-columns menu with the table’s own `lg` columns, which are window-asked below',
    'features/activities/components/ActivitiesTable.tsx':
      'a table shared with dialogs and pages that are not scaled: its `md`/`lg` columns ask the window, and a window that scales is at least 1024 wide',
    'features/plan-lock/components/CompactPenStatus.tsx':
      'rendered in the app header, which is not scaled',
    'features/tsld/toolbar/tsld-toolbar-items.tsx':
      'the grids inside toolbar popovers, which are portalled to the body at real size',
    'components/ui/data-table.tsx':
      'the table’s pinned first column from `lg`, with the same table’s window-asked columns',
  };

  /** A variant on a utility (`md:w-px`), not an object key (`md: 'max-w-md'`). */
  const WINDOW_VARIANT = /(?:^|[\s"'`:(])(?:max-)?(?:sm|md|lg|xl|2xl|xs|short|wide):[a-z[!-]/;

  /** The primitives the workspace is made of; the rest of `components/ui` is the design system at large. */
  const inScope = (name: string): boolean =>
    !name.startsWith('components/ui/') ||
    name.startsWith('components/ui/toolbar/') ||
    name === 'components/ui/data-table.tsx';

  it('is confined to the files that have a reason', () => {
    const found = withMatch(WINDOW_VARIANT).filter(inScope);
    expect(found).toEqual(Object.keys(ALLOWED).sort());
  });

  it('has no window variant in the deck or the band, which are asked of the band', () => {
    for (const name of [
      'components/ui/toolbar/Deck.tsx',
      'components/ui/toolbar/ClusterTrack.tsx',
      'components/layout/workspace/plan-workspace-toolbar.tsx',
      'components/layout/workspace/canvas-dock.tsx',
    ]) {
      const file = scanned.find((candidate) => candidate.name === name);
      expect(file, name).toBeDefined();
      expect(WINDOW_VARIANT.test(file?.code ?? ''), name).toBe(false);
    }
  });
});

describe('raw pointer and rect reads inside the workspace', () => {
  /**
   * Under a transform `getBoundingClientRect` and `clientX/Y` are screen px and the workspace is laid
   * out in layout px, so a read that feeds layout, hit-testing or a size goes through
   * `workspace-scale.ts`. What may still read them directly is: an overlay positioned in screen px
   * (portalled to the body, so never scaled), a read compared only with another screen read, and the
   * helper itself.
   */
  const ALLOWED: Record<string, string> = {
    'components/layout/workspace/workspace-scale.ts': 'the helper',
    'features/tsld/components/TsldCanvas.tsx':
      'a drag’s start and last client position, compared only with each other; the delta goes through `deltaInLayout`',
    'components/layout/workspace/plan-workspace-toolbar.tsx':
      'the fallback when the body is not mounted; the dock sizes go through `distanceFromEdgeInLayout`',
    'components/ui/data-table-windowed-body.tsx':
      'a scroller width compared with itself to notice a change, never used as a length',
    'features/gantt/components/GanttPanel.tsx':
      'the row-menu anchor and a scroll region, both in screen px against pointer positions; the divider goes through `pointInLayout`',
    'features/gantt/components/GanttRowMenu.tsx':
      'a menu anchor: the menu is portalled at real size',
    'features/gantt/model/use-bar-pointer-drag.ts':
      'client positions compared with each other and divided by the scale at the press',
    'features/tsld/components/SwimlaneGutter.tsx':
      'a menu anchor: the menu is portalled at real size',
    'features/tsld/components/TsldMinimap.tsx':
      'the surface rect and the pointer are both screen px and are divided by the scale together',
    'features/tsld/components/TsldLegendPanel.tsx':
      'the pointer’s start and the pointer, compared with each other; the delta goes through `deltaInLayout`',
    'features/activities/components/ActivitiesTable.tsx':
      'a row-menu anchor: the menu is portalled',
    'features/gantt/components/GanttColumnEdge.tsx':
      'the press position, compared with the pointer; the delta goes through `deltaInLayout`',
    'components/ui/menu.tsx': 'positions the portalled menu from its trigger’s screen rect',
    'components/ui/tooltip.tsx': 'positions the portalled tip from its trigger’s screen rect',
    'components/ui/overlay-position.ts': 'the portalled overlays’ own measurement and clamp',
    'components/ui/row-actions-menu.tsx': 'a menu anchor: the menu is portalled',
    'components/ui/toolbar/use-popover-panel.tsx':
      'positions the portalled panel from its trigger’s screen rect',
    'components/ui/panel-resizer.tsx':
      'anchors the portalled size box at the pointer, in screen px',
    'components/ui/use-pointer-drag.ts':
      'the press slop, in screen px; every caller converts the position it turns into a size',
  };

  it('is confined to the files that have a reason', () => {
    expect(withMatch(/getBoundingClientRect|\bclientX\b|\bclientY\b/)).toEqual(
      Object.keys(ALLOWED).sort(),
    );
  });

  it('has the canvas and the Gantt reading the layout through the helper', () => {
    for (const name of [
      'features/tsld/components/TsldCanvas.tsx',
      'features/tsld/components/TsldMinimap.tsx',
      'features/tsld/components/TsldLegendPanel.tsx',
      'features/gantt/components/GanttPanel.tsx',
      'features/gantt/components/GanttColumnEdge.tsx',
      'features/gantt/model/use-bar-pointer-drag.ts',
      'features/gantt/model/use-gantt-opening.ts',
      'components/ui/data-table.tsx',
    ]) {
      const file = scanned.find((candidate) => candidate.name === name);
      expect(file?.code, name).toMatch(/workspace-scale/);
    }
  });
});

describe('the canvas backing store', () => {
  it('is sized by the workspace scale as well as the display’s ratio (SC-7)', () => {
    const canvas = scanned.find(({ name }) => name === 'features/tsld/components/TsldCanvas.tsx');
    expect(canvas?.code).toMatch(/function getDpr\(scale = 1\)/);
    expect(canvas?.code).toMatch(/getDpr\(scale\)/);
    expect(canvas?.code).toMatch(/getDpr\(scaleRef\.current\)/);
  });
});
