<!--
Keep the title short and conventional (`fix:`, `feat:`, `docs:`, `refactor:`,
`test:`, `chore:`), one logical change per pull request. Delete this comment
before submitting.
-->

## What changes

<!-- One paragraph: what does this PR change, and what is the user-visible
effect? Link the issue it closes with `Closes #NNN`. -->

## Why it is correct

<!-- Evidence beats intent. For a parser / layout / metric change, show the input
that exercises the changed path and the output it produces (a small recPhyloXML
excerpt is ideal). For a UI change, attach a screenshot of the canvas or panel. -->

## Developer checklist

- [ ] `npm run typecheck` passes (`tsc -b`, strict)
- [ ] `npm run lint` passes with **zero warnings** (`--max-warnings 0`)
- [ ] `npm test` passes; new behaviour comes with a test
- [ ] `npm run build` produces a working bundle (`npm run preview` to eyeball it)
- [ ] `npm run check:tracked` passes — no tracked file imports an untracked file
- [ ] `npm run coverage` was run and the new code is covered
- [ ] Desktop shell touched? `cd src-tauri && cargo fmt --all -- --check && cargo test --all-targets && cargo clippy --all-targets -- -D warnings`
- [ ] UI strings go through `src/i18n.ts` in **both** `zh` and `en` (the `Dict` type makes a missing key a compile error)
- [ ] New layout / render option is added to `sanitizeLayoutOptions` / `sanitizeRenderOptions` in `src/session.ts`, and the session schema version was bumped if the shape changed
- [ ] `docs/USER_MANUAL.md` **and** `docs/USER_MANUAL.zh-CN.md` updated in parallel — numbers, ranges and feature lists must match the code, not the other way round
- [ ] Every prose change to `README.md`, `CONTRIBUTING.md`, `SECURITY.md` or `CODE_OF_CONDUCT.md` lands in its `.zh-CN.md` twin in the same pull request (English stays the primary document)
- [ ] No `console.log`, commented-out code, or generated artifacts (`dist/`, `coverage/`, `_build/`) committed
- [ ] No secret, token, or signing key added; `package-lock.json` / `Cargo.lock` changes come from `npm install` / `cargo`, never hand-edited

## Reviewer notes

<!-- Known risks, follow-up work deliberately left out, things you would like
looked at specifically. Write "None" if empty. -->
