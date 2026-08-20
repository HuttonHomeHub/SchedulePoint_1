import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';

import {
  DrawerSubjectProvider,
  useDrawerSubject,
  useDrawerSubjectRegistration,
} from './drawer-subject';

/**
 * **The registration's lifecycle** — and a recorded account of what these assertions do NOT prove.
 *
 * `useDrawerSubject` first returned its `register(null)` from the *registering* effect, so a
 * dependency change (a new `title`, i.e. selecting an activity) unregistered and immediately
 * re-registered. I saw a browser symptom — a modal opening while the drawer was on screen —
 * diagnosed it as that, and wrote it up as a found defect.
 *
 * **It was not.** The symptom's cause was a probe clicking the activities table's own editor rather
 * than the workspace's. And the sequence assertion below, written specifically to catch the
 * unregister, **passes against both implementations**: React batches the cleanup's `register(null)`
 * and the effect's `register({…})` into a single commit, so no render observes the `null`.
 *
 * So what these cases pin is the settled behaviour — a label before a subject is chosen, a title
 * arriving with one, and unregistration when the route goes away — and nothing about the internal
 * shape of the effects. That is worth having and it is less than it first appeared. Recorded rather
 * than deleted, because "five green assertions" read as five independent proofs otherwise, which
 * `ToolbarOverflow.test.tsx` records the same way one directory over.
 */
/** Records every value it sees, not just the settled one. */
const seen: string[] = [];

function Probe(): React.ReactElement {
  const registration = useDrawerSubjectRegistration();
  const text =
    registration === null ? 'none' : `${registration.label}|${registration.title ?? '-'}`;
  seen.push(text);
  return <div data-testid="probe">{text}</div>;
}

const ICON = <span data-testid="icon" />;

function Registrar({ title }: { title?: string }): React.ReactElement {
  useDrawerSubject({ label: 'Activity details', icon: ICON, ...(title ? { title } : {}) });
  return <></>;
}

function Harness(): React.ReactElement {
  const [title, setTitle] = useState<string | undefined>(undefined);
  const [mounted, setMounted] = useState(true);
  return (
    <DrawerSubjectProvider>
      <Probe />
      {mounted ? <Registrar {...(title === undefined ? {} : { title })} /> : null}
      <button type="button" onClick={() => setTitle('Excavate')}>
        select
      </button>
      <button type="button" onClick={() => setMounted(false)}>
        leave
      </button>
    </DrawerSubjectProvider>
  );
}

describe('useDrawerSubject', () => {
  it('registers a label with no title until a subject is chosen', () => {
    render(<Harness />);
    expect(screen.getByTestId('probe')).toHaveTextContent('Activity details|-');
  });

  // **Does not discriminate the two implementations** — see the file docblock. Kept as a pin on the
  // settled value, and as the record of an assertion that looks stronger than it is.
  it('holds a registration across a title change', async () => {
    seen.length = 0;
    const { getByText, getByTestId } = render(<Harness />);
    // The defect: this transition nulled the registration for one commit. Asserted as the settled
    // value AND as the label surviving — a test that only read the end state would have passed
    // against the broken version too, because it re-registered on the very next commit.
    fireEvent.click(getByText('select'));
    await waitFor(() =>
      expect(getByTestId('probe')).toHaveTextContent('Activity details|Excavate'),
    );
    // Written to catch an intermediate `none`, and it cannot: React batches the cleanup's
    // `register(null)` with the effect's re-registration, so no render ever sees it. Left in place
    // with that stated, because deleting it would lose the finding along with the assertion.
    const first = seen.findIndex((v) => v !== 'none');
    expect(first, 'nothing was ever registered').toBeGreaterThanOrEqual(0);
    expect(seen.slice(first)).not.toContain('none');
  });

  it('unregisters when the route that offered it goes away', async () => {
    const { getByText, getByTestId } = render(<Harness />);
    expect(getByTestId('probe')).not.toHaveTextContent('none');
    fireEvent.click(getByText('leave'));
    await waitFor(() => expect(getByTestId('probe')).toHaveTextContent('none'));
  });
});
