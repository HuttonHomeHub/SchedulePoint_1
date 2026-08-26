---
'@repo/web': patch
---

Fix a regression in the plan command deck's keyboard handling that shipped in `web-v0.106.0`.

Narrowing the deck's navigation-key veto to "a single-line input claims its caret keys" was right
for a text field and wrong for every other kind: the shipped `Go to date` control renders
`<input type="date">` inside the deck, and a date input steps its focused segment with the vertical
arrows. Pressing ArrowUp there changed no date and threw focus onto an unrelated command.

The rule now discriminates by input type, and lives in one `toolbar-keyboard.ts` shared by `Deck`
and `Toolbar` — the latter had been carrying a byte-for-byte copy that the previous fix missed. Both
containers also now stand down when a descendant has already handled the key, which restores the
keyboard route to a disabled split-button caret's reason.
