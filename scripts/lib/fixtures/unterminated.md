# Fixture — an unterminated fence swallows the rest

The fence below is never closed. That is the point: the parser blanks from it to the end of the
document rather than guessing where the author meant it to stop, because guessing would make a
malformed document parse as a well-formed one and report green.

## Before the fence

**Status:** open

```
## Inside an unterminated fence

**Status:** open

## Also swallowed
