<!--
Fixture for `sections()`' depth boundary (`docs/TECH_DEBT.md` #231).

Every heading here exists to pin one case, and the file is `.prettierignore`d because two of this
suite's cases once shipped vacuous after Prettier normalised a fixture out from under them.

Do not "tidy" the shell comment inside the fenced block: it is the case proving that `sections()`
depends on `stripFences` running first, which is the one dependency in this module that a
well-meaning refactor would remove without any test going red.
-->

## Alpha

alpha body

### Row one

row one body

## Beta

beta body

### Row two

row two body

#### Sub-heading

sub body

### Row three

row three body

```sh
# a shell comment, not a heading
echo hello
```

still row three

# A level-one title

after the title
