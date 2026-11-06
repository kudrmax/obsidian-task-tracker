# План S4+S5

1. Тесты `tests/application/menus.test.ts` на правила модели (уровни, метки, переносы, срок, разделы, прогресс) и `tests/application/TaskServiceImpl.test.ts` на `togglePriority`, `toggleLabel`, `removeDue`, `carried`, `menu`, `renameGroup → boolean`, новые `can`. Красные.
2. `src/application/menus.ts`, `taskItems.ts` (`can.stop/addDescription/fold`), `sections.ts` (`ListGroup.can`), `taskKeys.ts` (`isUnder`), контракт, `TaskServiceImpl`, `DemoTaskService`. Зелёные.
3. UI: `TaskMenu` и `BulkMenu` рисуют `TaskMenuModel`; `quickMoves.ts` даёт только слова и значки к `QuickMove`; `BulkController` пишет через `togglePriority/toggleLabel/removeDue` и спрашивает `carried`; вид — `can.fold`, `group.can`, `renameGroup`. UI-тесты переводятся на модель.
4. `tests/uiDecides.test.ts`: снизить счётчики.
5. `docs/plugin/tasks.md`: уровень в массовом меню.
6. `npm test`, `npm run build`, проверка в тестовом Obsidian (телефон и Mac, светлая и тёмная), merge `origin/master`, отчёт.
