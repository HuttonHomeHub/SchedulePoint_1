/**
 * Enumerate every surface that can hold unsaved work (unsaved-work guard, M0-T3).
 *
 * **Why this is a script and not a grep.** A `useForm` search cannot see state held OUTSIDE
 * react-hook-form, and the surface that matters most is exactly that case: `CalendarFormDialog`
 * holds its seven-day working week in `useState` beside an RHF form, deliberately
 * (`CalendarFormDialog.tsx:152-156` explains why), so `formState.isDirty` can never observe a
 * planner editing the hours.
 *
 * **The first version of this script missed it**, and the miss is instructive enough to keep: it
 * classified each component by whether it had RHF and stopped there, so a component with BOTH an
 * RHF form and out-of-band state was counted as covered and its invisible half was hidden. The
 * dangerous shape is not "no RHF" — it is **MIXED**. That is now its own category, reported first.
 *
 * **MIXED is a CANDIDATE list, not a verdict, and the difference is most of the value.** This
 * cannot tell user-authored input from transient UI state, because both are `useState` seeded
 * around an open dialog. Run 2026-08-23 reported five candidates and a hand read reduced them to
 * **one**: `ActivityCreateDialog`'s `hiddenProblem`, `ResourceFormDialog`'s two combobox query
 * strings, `NoteItem`'s `deleteError`/`conflict` and `ShareLinksDialog`'s `created`/`revoking` are
 * all status, none of it work a planner would mourn. Only `CalendarFormDialog`'s `week` is real.
 * So the useful output is a short list to read, and reporting it as a classification would be the
 * same overclaim the first version made in the opposite direction.
 *
 * Usage: node apps/web/scripts/dirty-surface-inventory.mjs
 */
import { readFileSync, globSync } from 'node:fs';

const files = globSync('apps/web/src/**/*.tsx').filter(
  (f) => !/\.(test|spec)\.tsx$/.test(f) && !f.includes('__tests__'),
);

/** State seeded when a dialog opens — the shape an `isDirty` check structurally cannot see. */
const seedsStateOnOpen = (s) =>
  /const \[[a-zA-Z]+, set[A-Z][a-zA-Z]*\] = useState/.test(s) &&
  /\bopen\b/.test(s) &&
  (/useEffect\(/.test(s) || /seededFor/.test(s));

const rows = [];
for (const file of files) {
  const s = readFileSync(file, 'utf8');
  const rhf =
    (s.match(/\buseForm[<(]/g) ?? []).length + (s.match(/\buseScopeForm[<(]/g) ?? []).length;
  const outOfBand = seedsStateOnOpen(s);
  const isDialog = /<Dialog\b|modalShell|DialogContent/.test(s);
  if (!rhf && !(isDialog && outOfBand)) continue;
  rows.push({
    file: file.replace('apps/web/src/', ''),
    rhf,
    outOfBand,
    isDialog,
    kind: rhf && outOfBand ? 'MIXED' : rhf ? 'rhf' : 'state-only',
  });
}

const order = { MIXED: 0, 'state-only': 1, rhf: 2 };
rows.sort((a, b) => order[a.kind] - order[b.kind] || b.rhf - a.rhf || a.file.localeCompare(b.file));

for (const r of rows) {
  const note =
    r.kind === 'MIXED'
      ? 'RHF **plus** out-of-band state — isDirty cannot see part of it'
      : r.kind === 'state-only'
        ? 'no RHF at all — no isDirty exists'
        : `${r.rhf} RHF instance${r.rhf === 1 ? '' : 's'}`;
  console.log(`  [${r.kind.padEnd(10)}] ${r.file}  — ${note}`);
}

const rhfTotal = rows.reduce((n, r) => n + r.rhf, 0);
const mixed = rows.filter((r) => r.kind === 'MIXED');
const stateOnly = rows.filter((r) => r.kind === 'state-only');
console.log(
  `\n${rows.length} components, ${rhfTotal} RHF instances, ${rows.filter((r) => r.isDialog).length} dialogs`,
);
console.log(
  `MIXED candidates (READ THESE — the script cannot tell input from UI state): ${mixed.length} — ` +
    `${mixed.map((r) => r.file.split('/').pop()).join(', ') || 'none'}`,
);
console.log(
  `state-only: ${stateOnly.length} — ${stateOnly.map((r) => r.file.split('/').pop()).join(', ') || 'none'}`,
);
