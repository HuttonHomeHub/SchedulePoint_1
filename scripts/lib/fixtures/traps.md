# Fixture — every trap the parser must survive

Each block below pins a defect this repository has actually shipped. The expectations live in
`doc-register.test.mjs`; this file is the input.

## Row one — a real status

**Status:** open

Body text.

## Row two — discusses the field without declaring one

The proposal is **(a)** a `**Status:**` line on every row. This sentence is why an unanchored grep
returns 14 where the truth is 13 (`docs/TECH_DEBT.md` #219, live at the time this was written).

## Row three — the field indented, which is not a declaration

  **Status:** open

## Row four — a heading inside a fence is not a heading

```md
## Not a row

**Status:** open
```

## Row five — a tilde fence, and a longer-than-three fence

~~~
## Also not a row

**Status:** open
~~~

`````md
## Still not a row

**Status:** open
`````

## Row seven — a nested fence closes only at its own length

`````md
Documenting a fenced block requires an outer fence longer than the inner one:

```
## Not a row, and the ``` above does not end the outer fence
```

**Status:** open
`````

## Row six — a table whose prose column contains a date

| when       | what                                                             |
| ---------- | ---------------------------------------------------------------- |
| 2026-08-25 | The 2026-08-30 pass found this. Reading by text would take both. |
| 2026-08-20 | Eleven epics.                                                    |
