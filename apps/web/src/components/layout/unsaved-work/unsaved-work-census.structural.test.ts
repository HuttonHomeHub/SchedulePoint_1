import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

/**
 * **Every surface that can hold unsaved work is classified once, one way** (CQ-3).
 *
 * The product owner chose four registrants and asked for a census rather than a hand-kept list, and
 * the reason is in this repository's own register: `docs/TECH_DEBT.md` #178, #181 and #183 are three
 * holes in one gate, every one of them a rule that went **quiet** rather than wrong. A list of four
 * names in a comment is that shape exactly — it stays green while the fifth form dialog ships
 * unguarded.
 *
 * So each candidate is either REGISTERED or carries a written reason for not being. A new form
 * dialog fails this test until somebody decides which it is, which is the whole mechanism.
 *
 * **The positive case is pinned first and deliberately.** An assertion that "every unclassified
 * surface is a failure" passes perfectly against a census that finds nothing at all — the ADR-0093
 * lesson, where a green suite could not distinguish "the duplicate is gone" from "the capability is
 * gone". If the count of registrants ever drops to zero this fails loudly.
 */
const HOOK = 'useRegisterUnsavedWork';

/**
 * Not registered, with the reason. Each is a decision somebody made, not a queue — ADR-0073 C3.4
 * deleted its one "pending" reason precisely because a queue is how a census stops being one.
 */
const EXCLUDED: Record<string, string> = {
  'SignInForm.tsx': 'Public auth form — a half-typed sign-in is not work worth guarding.',
  'SignUpForm.tsx': 'Public auth form — see SignInForm.',
  'ResetPasswordForm.tsx': 'Public auth form — see SignInForm.',
  'RequestPasswordResetForm.tsx': 'Public auth form — see SignInForm.',
  'ChangePasswordForm.tsx': 'Credential form; a discarded half-typed password is not lost work.',
  'CreateOrganizationForm.tsx':
    'Onboarding, outside the authenticated shell where the guard lives.',
  'NoteComposer.tsx': 'Short free text, saved in one action; guarding it would over-warn.',
  'NoteItem.tsx': 'Inline edit of one field, same reasoning as NoteComposer.',
  'AddLinkSection.tsx':
    'Two selects inside the editor, whose own registration already covers the visit.',
  'ActivityResourcesPanel.tsx':
    'Assign form inside the editor; covered by the editor’s registration.',
  'CreateBaselineDialog.tsx': 'One name field.',
  'ClientFormDialog.tsx': 'Two fields, one save.',
  'ProjectFormDialog.tsx': 'Two fields, one save.',
  'PlanFormDialog.tsx': 'Small form, one save.',
  'ResourceFormDialog.tsx': 'Small form, one save.',
  'InviteMemberDialog.tsx': 'One address and a role.',
  'EditDependencyDialog.tsx': 'Two fields on an existing link.',
  'AddCrossPlanLinkDialog.tsx': 'Small form, one save.',
  'ShareLinksDialog.tsx': 'Creates a link in one action; holds no draft.',
  'ActivityProgressPanels.tsx':
    'Reports dirtiness UP to the editor, which registers for all six scopes.',
  'useScopeForm.ts': 'The hook itself, not a surface.',
};

// Relative to the vitest cwd (`apps/web`), and two patterns rather than a brace expansion —
// `globSync` returned an empty list for the braced form, and an empty census silently passes every
// negative assertion. The positive case above is what caught it.
const files = [...globSync('src/**/*.tsx'), ...globSync('src/**/*.ts')].filter(
  (f) => !/\.(test|spec)\.(tsx|ts)$/.test(f) && !f.includes('unsaved-work'),
);

const holdsForm = (s: string): boolean => /\buseForm[<(]|\buseScopeForm[<(]/.test(s);

describe('the unsaved-work census', () => {
  const registered: string[] = [];
  const unclassified: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    if (!holdsForm(source)) continue;
    const base = file.split('/').pop() ?? file;
    if (source.includes(HOOK)) registered.push(base);
    else if (!(base in EXCLUDED)) unclassified.push(base);
  }

  it('registers the surfaces the product owner chose', () => {
    // Pinned positive case: this fails if the registrations are removed, which is what stops the
    // assertion below from passing against an empty census.
    expect(registered).toEqual(
      expect.arrayContaining([
        'ActivityEditorDialog.tsx',
        'ActivityCreateDialog.tsx',
        'CalendarFormDialog.tsx',
        'CalendarExceptionsEditor.tsx',
      ]),
    );
  });

  it('leaves nothing unclassified', () => {
    expect(
      unclassified,
      'A form surface is neither registered nor excluded. Decide which, and if excluded, say why.',
    ).toEqual([]);
  });

  it('excludes nothing that no longer exists', () => {
    // An exclusion for a deleted file is a reason nobody will ever re-read — the register's
    // "a rule that goes quiet" shape, pointing the other way.
    const present = new Set(files.map((f) => f.split('/').pop()));
    expect(Object.keys(EXCLUDED).filter((name) => !present.has(name))).toEqual([]);
  });
});
