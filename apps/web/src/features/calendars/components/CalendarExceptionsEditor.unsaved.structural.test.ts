import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * **Two defects the component and ux reviews found, pinned so they cannot come back.**
 *
 * 1. **The phantom registration.** `Dialog` renders its children unconditionally
 *    (`components/ui/dialog.tsx:133`) — it toggles the native `<dialog>`, it does not unmount the
 *    subtree — and `CalendarsTable` keeps the calendar dialog permanently mounted. So an editor that
 *    registers on its own dirtiness alone stays registered after the dialog closes, and every later
 *    navigation is blocked by a scope the reader can no longer see or resolve. Its three sibling
 *    registrants all gate on `open`; this one did not.
 *
 * 2. **The edit path had no guard at all.** `ExceptionEditForm` holds kind, rows, label and end date
 *    in `useState`, so no `formState.isDirty` can see any of it — the same blind spot as the
 *    calendar's working week, in a sibling of the file that fixes that one. A planner could extend a
 *    shutdown, add hour windows, and lose it all to a reload in silence.
 *
 * Asserted structurally because both are about WHEN the hook is called rather than what the DOM
 * shows, and the alternative is mounting an editor that needs a resolved calendar and a live query
 * client to render a single row.
 */
const source = readFileSync(join(__dirname, 'CalendarExceptionsEditor.tsx'), 'utf8');

describe('the calendar exceptions editor registers honestly', () => {
  it('gates registration on the hosting dialog being open', () => {
    expect(source).toMatch(/open && \(isDirty \|\| editDirty\)/);
  });

  it('accepts an open prop from its host rather than assuming it is visible', () => {
    expect(source).toContain('open?: boolean;');
  });

  it('counts the EDIT form as unsaved work, not only the add form', () => {
    expect(source).toContain('onDirtyChange={setEditDirty}');
    // Compared by value: there is no isDirty to ask, because none of it lives in react-hook-form.
    expect(source).toMatch(/const editDirty =/);
    expect(source).toContain('exceptionRowsOf(exception)');
  });

  it('releases the edit form’s claim when it unmounts', () => {
    // Without this, closing the inline editor leaves its scope registered — the phantom above,
    // one level in.
    expect(source).toMatch(
      /useEffect\(\(\) => \(\) => onDirtyChange\?\.\(false\), \[onDirtyChange\]\)/,
    );
  });
});
