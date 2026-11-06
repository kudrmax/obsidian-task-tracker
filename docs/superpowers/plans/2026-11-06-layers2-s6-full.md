# S6 план

1. domain: `rename` по сырому тексту (`typed` с приоритетом и метками задачи; тот же документ, если ничего не меняется), `toggleDone`. Тесты в `tests/domain/operations.test.ts`.
2. application: `toItem(entry, today, levels, parent)` даёт `parentKey`; `fullTree.ts`; `TaskServiceImpl.toggleDone`, `fullTree`, `rename` → `TaskItem | null`; общий `itemAt` для `find`, `setLabelsAll`, `rename`. Тесты в `tests/application`.
3. contracts: новые члены; `DemoTaskService` и фикстуры (`onDay` с `parentKey: null`).
4. ui: `FullScreen` берёт дерево из `fullTree`, кружок — `toggleDone`, родитель — `parentKey`, переименование и новая подзадача шлют сырой текст; оттенок поля из `draftMarks`. `tests/ui/FullScreen.test.ts` проверяет, что экран следует ответу.
5. `tests/uiDecides.test.ts`: строка FullScreen уходит (2 → 0).
6. `npm test`, `npm run build`; тестовый Obsidian на порту 9522: открыть, кружок, переименовать, новая подзадача, к родителю — телефон и десктоп, светлая и тёмная.
7. merge origin/master, прогон, коммит.
