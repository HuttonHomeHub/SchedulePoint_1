---
'@repo/interchange': minor
'@repo/api': minor
---

feat(interchange): import calendars into the target project instead of the shared library (ADR-0053, M5)

Importing a P6 or MS Project file used to create every one of its calendars in the shared
**organisation** library, so importing three files could silently add a dozen `Standard 5 Day`
calendars that every other project then had to scroll past. An import now creates its calendars **in
the project you imported into**, where they belong — and where they are deleted with it.

- A fresh import adds **zero rows** to the organisation calendar library.
- A calendar an imported **resource** uses is still created organisation-wide (a resource can only
  hold an organisation calendar), and the report says so.
- A file's **global** calendars land in the project with a "promote it to the library if other
  projects need it" note — or in the shared library outright if you send the new optional
  `globalCalendarScope=ORG` field with the upload.
- P6's calendar type (`clndr_type`) is now **read on import and written on export**, so exporting a
  plan and importing it again preserves each calendar's tier. MS Project's format has no equivalent
  field, so an MSPDI export reports the tier as dropped rather than losing it silently.
- A calendar name the project (or library) already holds is imported as
  `"Site 6-Day (imported 2026-07-26)"` and reported — never silently merged into the existing one,
  because two calendars sharing a name can have completely different working weeks. This also fixes
  importing two files that share a calendar name into the same project, which previously failed.

Every decision above appears in the interchange report you review on the dry-run, so nothing about
where a calendar went is a surprise. The CPM engine is untouched and recalculation output is
unchanged.
