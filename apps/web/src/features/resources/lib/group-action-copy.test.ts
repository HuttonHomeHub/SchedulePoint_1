import { describe, expect, it } from 'vitest';

import {
  deleteResourceDescription,
  deleteResourceTitle,
  dissolveGroupDescription,
} from './group-action-copy';

const row = (id: string, name: string, parentId: string | null = null) => ({ id, name, parentId });
const group = (id: string, name: string, parentId: string | null = null) => ({
  ...row(id, name, parentId),
  kind: 'GROUP' as const,
});

describe('dissolveGroupDescription', () => {
  it('names the count, the top level, and that there is no recycle-bin restore', () => {
    const g = group('g', 'Groundworks');
    const text = dissolveGroupDescription(g, [g, row('a', 'A', 'g'), row('b', 'B', 'g')]);
    expect(text).toContain('Dissolve the group “Groundworks”?');
    expect(text).toContain('keeps its 2 resources');
    expect(text).toContain('the top level');
    expect(text).toContain('can’t be undone from a recycle bin');
    expect(text).toContain('create the group again and move them back');
  });

  it('names the parent group when there is one, and counts one resource in the singular', () => {
    const p = group('p', 'Site');
    const g = group('g', 'Groundworks', 'p');
    const text = dissolveGroupDescription(g, [p, g, row('a', 'A', 'g')]);
    expect(text).toContain('its 1 resource —');
    expect(text).toContain('move up to “Site”');
  });

  it('counts direct children only', () => {
    const g = group('g', 'G');
    const inner = group('i', 'Inner', 'g');
    const text = dissolveGroupDescription(g, [g, inner, row('a', 'A', 'i'), row('b', 'B', 'i')]);
    expect(text).toContain('its 1 resource');
  });

  it('counts archived children, which the caller loads with archived: include', () => {
    const g = group('g', 'G');
    const archived = { ...row('a', 'A', 'g'), archivedAt: '2026-01-01T00:00:00.000Z' };
    expect(dissolveGroupDescription(g, [g, archived])).toContain('its 1 resource');
  });

  it('says an empty group is empty only when the group is in the loaded library', () => {
    const g = group('g', 'G');
    expect(dissolveGroupDescription(g, [g])).toContain('It has nothing in it');
  });

  it('degrades to a sentence without a number while the library has not arrived', () => {
    const g = group('g', 'G');
    const text = dissolveGroupDescription(g, []);
    expect(text).toContain('keeps the resources in it');
    expect(text).not.toMatch(/\d/);
    expect(text).not.toContain('nothing in it');
  });

  it('does not invent a parent name it cannot resolve', () => {
    const g = group('g', 'G', 'missing');
    expect(dissolveGroupDescription(g, [g, row('a', 'A', 'g')])).toContain('the group above it');
  });
});

describe('deleteResourceDescription', () => {
  it('keeps a leaf resource’s wording and title unchanged', () => {
    const leaf = { id: 'x', name: 'Crane', kind: 'EQUIPMENT' as const };
    expect(deleteResourceDescription(leaf, [])).toBe('Delete “Crane”?');
    expect(deleteResourceTitle(leaf)).toBe('Delete resource');
  });

  it('says a group delete includes its contents and points at Dissolve', () => {
    const g = group('g', 'Groundworks');
    expect(deleteResourceTitle(g)).toBe('Delete group');
    const text = deleteResourceDescription(g, [g, row('a', 'A', 'g'), row('b', 'B', 'g')]);
    expect(text).toContain('Delete the group “Groundworks” and the 2 resources in it?');
    expect(text).toContain('deletes everything in it');
    expect(text).toContain('can’t be restored');
    expect(text).toContain('dissolve the group instead');
  });

  it('counts the whole nested branch, not only direct children', () => {
    const g = group('g', 'G');
    const inner = group('i', 'Inner', 'g');
    const text = deleteResourceDescription(g, [g, inner, row('a', 'A', 'i'), row('b', 'B', 'i')]);
    expect(text).toContain('the 3 resources in it');
  });

  it('uses the singular for one resource', () => {
    const g = group('g', 'G');
    expect(deleteResourceDescription(g, [g, row('a', 'A', 'g')])).toContain('the 1 resource in it');
  });

  it('says an empty group is empty', () => {
    const g = group('g', 'G');
    expect(deleteResourceDescription(g, [g])).toBe('Delete the group “G”? It has nothing in it.');
  });

  it('warns without a number while the library has not arrived', () => {
    const g = group('g', 'G');
    const text = deleteResourceDescription(g, []);
    expect(text).toContain('deletes everything in it');
    expect(text).not.toContain('nothing in it');
    expect(text).not.toMatch(/\d/);
  });

  it('terminates on a malformed cycle', () => {
    const a = group('a', 'A', 'b');
    const b = group('b', 'B', 'a');
    expect(deleteResourceDescription(a, [a, b])).toContain('the 1 resource in it');
  });
});
