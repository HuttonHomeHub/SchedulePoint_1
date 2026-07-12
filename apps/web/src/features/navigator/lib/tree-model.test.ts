import { describe, expect, it } from 'vitest';

import {
  flattenVisible,
  selectionFromParams,
  treeKeydown,
  type ChildGroup,
  type TreeNodeData,
} from './tree-model';

const client = (id: string, name = id): TreeNodeData => ({
  kind: 'client',
  id,
  name,
  parentId: null,
});
const project = (id: string, parentId: string): TreeNodeData => ({
  kind: 'project',
  id,
  name: id,
  parentId,
});
const plan = (id: string, parentId: string): TreeNodeData => ({
  kind: 'plan',
  id,
  name: id,
  parentId,
});

const loaded = (nodes: TreeNodeData[]): ChildGroup => ({ status: 'loaded', nodes });

describe('flattenVisible', () => {
  it('lists collapsed roots with correct ARIA geometry and no children', () => {
    const rows = flattenVisible(loaded([client('c1'), client('c2')]), new Map(), new Set());
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      type: 'node',
      level: 1,
      setSize: 2,
      posInSet: 1,
      expandable: true,
      expanded: false,
    });
    expect(rows[1]).toMatchObject({ level: 1, posInSet: 2 });
  });

  it('reveals children of expanded nodes at the next level', () => {
    const children = new Map<string, ChildGroup>([['c1', loaded([project('p1', 'c1')])]]);
    const rows = flattenVisible(loaded([client('c1')]), children, new Set(['c1']));
    expect(rows.map((r) => r.node?.id)).toEqual(['c1', 'p1']);
    expect(rows[0]).toMatchObject({ expanded: true });
    expect(rows[1]).toMatchObject({ level: 2, expandable: true, expanded: false });
  });

  it('marks plans as non-expandable leaves', () => {
    const children = new Map<string, ChildGroup>([
      ['c1', loaded([project('p1', 'c1')])],
      ['p1', loaded([plan('pl1', 'p1')])],
    ]);
    const rows = flattenVisible(loaded([client('c1')]), children, new Set(['c1', 'p1']));
    const planRow = rows.find((r) => r.node?.id === 'pl1');
    expect(planRow).toMatchObject({ level: 3, expandable: false });
  });

  it('emits a loading row for an expanded parent whose children are still loading', () => {
    const children = new Map<string, ChildGroup>([['c1', { status: 'loading', nodes: [] }]]);
    const rows = flattenVisible(loaded([client('c1')]), children, new Set(['c1']));
    expect(rows[1]).toMatchObject({ type: 'loading', level: 2, parentId: 'c1' });
  });

  it('emits an empty row for an expanded parent with no children', () => {
    const children = new Map<string, ChildGroup>([['c1', loaded([])]]);
    const rows = flattenVisible(loaded([client('c1')]), children, new Set(['c1']));
    expect(rows[1]).toMatchObject({ type: 'empty', level: 2 });
  });

  it('emits an error row for an expanded parent whose children failed', () => {
    const children = new Map<string, ChildGroup>([['c1', { status: 'error', nodes: [] }]]);
    const rows = flattenVisible(loaded([client('c1')]), children, new Set(['c1']));
    expect(rows[1]).toMatchObject({ type: 'error', level: 2 });
  });

  it('shows a root-level empty state when the org has no clients', () => {
    const rows = flattenVisible(loaded([]), new Map(), new Set());
    expect(rows).toEqual([expect.objectContaining({ type: 'empty', level: 1, parentId: null })]);
  });
});

describe('selectionFromParams', () => {
  it('picks the most specific id present', () => {
    expect(selectionFromParams({ planId: 'pl1' })).toEqual({ kind: 'plan', id: 'pl1' });
    expect(selectionFromParams({ projectId: 'p1' })).toEqual({ kind: 'project', id: 'p1' });
    expect(selectionFromParams({ clientId: 'c1' })).toEqual({ kind: 'client', id: 'c1' });
    expect(selectionFromParams({ planId: 'pl1', clientId: 'c1' })).toEqual({
      kind: 'plan',
      id: 'pl1',
    });
    expect(selectionFromParams({})).toBeNull();
  });
});

describe('treeKeydown', () => {
  it('maps vertical + boundary keys to move intents', () => {
    const leaf = { expandable: false, expanded: false };
    expect(treeKeydown('ArrowDown', leaf)).toBe('next');
    expect(treeKeydown('ArrowUp', leaf)).toBe('prev');
    expect(treeKeydown('Home', leaf)).toBe('first');
    expect(treeKeydown('End', leaf)).toBe('last');
    expect(treeKeydown('Enter', leaf)).toBe('activate');
    expect(treeKeydown(' ', leaf)).toBe('activate');
  });

  it('expands, enters, collapses, and moves to parent per the APG keymap', () => {
    expect(treeKeydown('ArrowRight', { expandable: true, expanded: false })).toBe('expand');
    expect(treeKeydown('ArrowRight', { expandable: true, expanded: true })).toBe('firstChild');
    expect(treeKeydown('ArrowRight', { expandable: false, expanded: false })).toBeNull();
    expect(treeKeydown('ArrowLeft', { expandable: true, expanded: true })).toBe('collapse');
    expect(treeKeydown('ArrowLeft', { expandable: false, expanded: false })).toBe('toParent');
    expect(treeKeydown('x', { expandable: true, expanded: true })).toBeNull();
  });
});
