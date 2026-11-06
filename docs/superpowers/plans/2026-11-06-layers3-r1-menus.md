# Plan: layers3 R1, menus

1. Contracts: the new types and service members (spec table).
2. `menus.ts`: `MenuOf`, `menuOffer`, `tileStatus`, statuses, edits, section options, remove; tests in `tests/application/menus.test.ts`.
3. `TaskServiceImpl` and the demo service: `menu`, `bulkMenu`, `pickStatus`, `postponeAll`, `removeAll`; `TaskRules` `stop` step; tests in `tests/application/TaskServiceImpl.menus.test.ts`.
4. UI: `TaskMenu` and `BulkMenu` draw `statuses`, `edits`, `remove`, `sections.options`; `SectionChooser` takes `MenuSections`; `BulkController` calls the bulk service members; the view passes `MenuFrom` and `MenuScreen`.
5. UI tests follow the model; bulk move group only with moves.
6. Docs: `docs/plugin/tasks.md` bulk menu line.
7. Full suite, build, test Obsidian (phone and desktop, light and dark).
