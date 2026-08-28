---
'@repo/web': patch
---

The native-dialog close guard exists once (`useNativeDialogClose`), and `Sheet` gains the
`confirmBeforeClose` clause `Dialog` already had — latent until a drawer hosts unsaved work, but
now a property of the primitive rather than a convention.
