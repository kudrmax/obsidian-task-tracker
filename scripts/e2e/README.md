# End-to-end harness

`npm run e2e:smoke` drives a test Obsidian of its own (never `~/Obsidian`, never another session's) with the e2e build of the plugin over a copy of Max's tasks file, on the desktop and in the phone view, dark and light, and judges every step frame by frame (spec `docs/superpowers/specs/2026-11-15-ui-refactor.md`, §Tests 6). Not part of `npm test`.

- `npm run e2e -- smoke --update` records the baselines; `npm run e2e:smoke` compares with them.
- `npm run e2e -- budget`: 300 tasks, the CPU 4× slower, script per frame and long tasks.
- `npm run e2e -- open`, then `try <desktop|phone> <dark|light>`, `eval "<js>"`, `shot <file>`, `quit`: a look by hand.
- `E2E_WORK`: the profile and scratch vault (default `.e2e/work`); `E2E_HOME`: the build, fixture, baselines and runs (default `.e2e`). Everything there is private and gitignored.

Files: `obsidian.ts` (launch, reset, quit), `fixture.ts`, `page.ts` (what runs in the page), `driver.ts` (input, steps, shots), `frames.ts` (the failure rules), `diff.ts` and `png.ts` (the shots), `smoke.ts` and `budget.ts` (the scenarios). The rules and the diff are unit-tested in `tests/e2e/`.
