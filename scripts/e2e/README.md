# End-to-end harness

`npm run e2e:smoke` drives a test Obsidian of its own (never `~/Obsidian`, never another session's) with the e2e build of the plugin over a copy of Max's tasks file, on the desktop and in the phone view, dark and light, and judges every step frame by frame (spec `docs/superpowers/specs/2026-11-15-ui-refactor.md`, §Tests 6). Not part of `npm test`.

- `npm run e2e -- smoke --update` records the baselines; `npm run e2e:smoke` compares with them, and a missing baseline fails.
- `npm run e2e -- budget`: 300 tasks, the CPU 4× slower, script per frame and long tasks.
- `npm run e2e -- open`, then `try <desktop|phone> <dark|light>`, `eval "<js>"`, `shot <file>`, `quit`: a look by hand.
- `E2E_WORK`: the profile and scratch vault (default `.e2e/work`); `E2E_HOME`: the build, fixture, baselines and runs (default `.e2e`). Everything there is private and gitignored. Neither may be inside `~/Obsidian`, nor inside the repository outside `.e2e/`, however spelled (another case, a link): paths are compared as the disk compares them.
- Each run builds the e2e plugin into `E2E_HOME/build/` and checks the copy in the scratch vault is that build (`// task-calendar <version> e2e`, written by this run).
- Nothing leaves the test Obsidian: the e2e build records every link to another app, Google's login and the Mac's scripts (`app.plugins.plugins["task-calendar"].e2e.opened`).

Files: `obsidian.ts` (launch, reset, quit), `fixture.ts`, `page.ts` (what runs in the page), `driver.ts` (input, steps, shots), `frames.ts` (the failure rules), `diff.ts` and `png.ts` (the shots), `smoke.ts` and `budget.ts` (the scenarios). The rules and the diff are unit-tested in `tests/e2e/`.
