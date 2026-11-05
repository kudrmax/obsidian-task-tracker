# Блок 1 «Страж слоёв и зависимости домена» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** правило слоёв проверяет тест `tests/architecture.test.ts` с явным списком текущих нарушений. Домен не импортирует ничего вне `src/domain`. Прокладки `application/placements.ts` и `application/taskText.ts` уходят, `zoomLevelsText` переезжает в UI. Поведение, вид и формат файла — те же.

**Architecture:** страж читает импорты всех `src/**/*.ts` (кроме `.d.ts`), разрешает относительные пути до файла в репозитории и сверяет с таблицей «слой → что можно импортировать». Типы, которые домен брал из контрактов и настроек, переезжают в домен (`Placement.ts`, `Lists.ts`, `Groups.ts`, `Priority.ts`); контракты и `settings.ts` реэкспортируют их под теми же именами. Сборка DTO для UI (`toItem`, `progressOf`) уходит из домена в `application/taskItems.ts`. Правило «открытая задача» — одна функция `isOpen` в `domain/Task.ts`; UI получает готовое `TaskItem.open`.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-1-guard-design.md`, обзор `2026-11-05-layers-overview.md`.

## Что в спеке уже не так (сверено с master 1bf5dc7, после «повторяющихся задач»)

- **`isOpen` теперь в двух местах домена под разными сигнатурами:** `domain/queries.ts:45` (от `TaskEntry`, им пользуется новая `repeatable`) и `domain/normalize.ts:7` (от `Task`); в UI — `ui/Timeline.ts:102`. Одна `isOpen(status: TaskStatus)` в `domain/Task.ts`, обе доменные копии и UI переходят на неё. `openSlotted` (`queries.ts:29`) пишет то же правило как «не `done` и не `cancelled`» — для четырёх статусов это одно и то же, переходит на `isOpen`.
- **`TaskItem` вырос:** `repeat` и `repeatable` (от повторяющихся задач). `repeatable(entry)` — правило домена, остаётся в `domain/queries.ts`; `toItem` в `application/taskItems.ts` его вызывает. Новое поле `open` встаёт рядом.
- **Демо-сервис** (`tests/fakes/DemoTaskService.ts:101`) сам считает «открыта» для `repeatable`; новое `open` он считает так же.
- **`@codemirror/state`, `@codemirror/view`** импортирует UI (`ui/markdown/EmbeddedEditor.ts`, `ui/quick/MarkdownTitleField.ts`). В таблице спеки их нет, но это пакеты самого Obsidian (`external` в `esbuild.config.mjs:21`, как `obsidian`): страж считает их частью «пакета `obsidian`». Иначе их пришлось бы держать в списке, а ни один блок их убирать не собирается.
- **`zoomLevelsText` в UI** импортировал бы `ZoomLevel` из `settings.ts` — новое нарушение, а добавлять строки в список нельзя. Контракты реэкспортируют `type ZoomLevel` (блок 10 всё равно кладёт его туда), `ui/zoomLevelsText.ts` берёт его оттуда.
- **Тест `samePlacement`** (`tests/application/placements.test.ts`) — тест правила домена: переезжает в `tests/domain/placements.test.ts` и импортирует из `domain/operations.ts`.
- **Тесты `toItem`** живут в трёх файлах домена: `tests/domain/queries.test.ts` (`describe("toItem")`, `describe("toItem with priority levels")`), `tests/domain/subtasks.test.ts` («shows the open subtasks…», это `progressOf`), `tests/domain/description.test.ts` («reaches the item the view gets»). Все переезжают в `tests/application/taskItems.test.ts` без изменения ожиданий (плюс `open` в ожидании полного объекта).
- **Нарушения сейчас** (48 строк, все — вне домена, кроме четырёх): `application/services.ts` → инфраструктура и `obsidian` (блок 2), `phone/PhoneReminders.ts` → домен (блок 2), UI → `settings.ts` и `application/ports.ts` (блоки 2, 10), UI → прокладки и `zoomLevelsText` (этот блок), домен → контракты и настройки (этот блок).

## Global Constraints

- Чистый рефакторинг: ни поведения, ни вида, ни записи в файл, ни `data.json` не меняется.
- Перенос правила = перенос его тестов; ни одно ожидание не ослабляется и не пропускается.
- Публичные имена контрактов те же; контракты только реэкспортируют и добавляют (`open`, `ZoomLevel`, `samePlacement`, `plainText`, `textParts`, `TextPart`).
- `settings.ts` реэкспортирует всё, что из него уходит в домен, — остальной код в этом блоке не трогается.
- Удаление файлов — только `trash` (переезд — `git mv`).
- `ALLOWED` в страже — ровно оставшиеся нарушения; тест падает и на новое нарушение, и на строку, которой больше нет.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build`, `npm run build:demo` зелёные; проверка в тестовом Obsidian (телефон и Mac, светлая и тёмная).

---

### Task 1: Страж слоёв со списком текущих нарушений

**Files:**
- Create: `tests/architecture.test.ts`

- [ ] Таблица `MAY_IMPORT` по спеке; `src/main.ts`, `src/demo.ts`, `src/compose.ts` — корень, могут всё. Пакеты `obsidian`, `@codemirror/*` разрешены UI; инфраструктуре разрешено всё, кроме `src/ui/**`.
- [ ] Разбор импортов: `import … from`, `export … from`, `import "…"`, `import("…")` (в том числе `typeof import(…)`), без блочных и строчных комментариев; относительный путь → файл в репозитории (`.ts` или `/index.ts`), `?raw` отрезается.
- [ ] Тесты: у каждого файла есть слой; разбор видит все формы импорта (известные импорты `contracts.ts`, `main.ts`, `WorkCalendarExportScript.ts`); нет нарушений вне `ALLOWED`; каждая строка `ALLOWED` ещё встречается.
- [ ] `ALLOWED` — все 48 текущих строк, по алфавиту.
- [ ] `npm test` — PASS. Commit `Layer guard: a test reads every import and holds the list of those that still cross a layer`.

### Task 2: Типы домена — в домен

**Files:**
- Create: `src/domain/Placement.ts` (`Placement`, `TaskDraft`), `src/domain/Lists.ts` (`GroupedList`, `EndList`, `GroupPlace`), `src/domain/Groups.ts` (`GroupSettings`), `src/domain/Priority.ts` (`PRIORITY_COLORS`, `PriorityColor`, `PriorityLevel`, `usablePrefix`, `sameLevels`, `usableLevels`)
- Modify: `src/domain/operations.ts`, `src/application/contracts.ts`, `src/settings.ts`, `tests/architecture.test.ts`

- [ ] Перенести объявления дословно, с их комментариями. Контракты: `export type { … } from "../domain/…"`, `PriorityLevel` — из домена. `settings.ts`: `import type` для своих полей и реэкспорт того же набора имён (значения — `export { … } from`).
- [ ] `operations.ts` импортирует из `./Placement`, `./Lists`, `./Groups`.
- [ ] Вычеркнуть `src/domain/operations.ts → …` (2 строки) из `ALLOWED`.
- [ ] `npm test`, `npx tsc --noEmit` — PASS. Commit `Domain owns its types: placement, lists, sections and priority levels; contracts and settings re-export them`.

### Task 3: `isOpen` в домене, `toItem` в application, `TaskItem.open`

**Files:**
- Create: `src/application/taskItems.ts` (`toItem`, `progressOf`), `tests/application/taskItems.test.ts`
- Modify: `src/domain/Task.ts` (`isOpen(status)`), `src/domain/queries.ts`, `src/domain/normalize.ts`, `src/application/contracts.ts` (`TaskItem.open`), `src/application/TaskServiceImpl.ts`, `src/ui/Timeline.ts`, `tests/fakes/DemoTaskService.ts`, литералы `TaskItem` в `tests/ui/*`, `tests/domain/{queries,subtasks,description}.test.ts`, `tests/domain/Task*.test.ts` (тест `isOpen`), `tests/architecture.test.ts`

**Interfaces:**
- `export function isOpen(status: TaskStatus): boolean` — `todo` или `inProgress`.
- `TaskItem.open: boolean` — «Not done and not given up: todo or in progress.»; `toItem` ставит `isOpen(entry.task.status)`.
- `Timeline.ts`: своя `isOpen` удаляется, читается `item.open`.

- [ ] Тест `isOpen` в домене (четыре статуса). Тесты `toItem` переезжают в `tests/application/taskItems.test.ts`; в полном ожидании добавлено `open: true`; новый тест «tells whether the task is open» на `[ ]`, `[/]`, `[x]`, `[-]`.
- [ ] Литералы `TaskItem` в тестах UI получают `open`; где статус — параметр (`Timeline.test.ts`), `open` следует статусу.
- [ ] Вычеркнуть `src/domain/queries.ts → …` (2 строки).
- [ ] `npm test` — PASS. Commit `One rule of an open task in the domain; the item for the view is built in application and carries it`.

### Task 4: Прокладки и текст уровней масштаба

**Files:**
- Delete (`trash`): `src/application/placements.ts`, `src/application/taskText.ts`
- Move (`git mv`): `src/application/zoomLevelsText.ts` → `src/ui/zoomLevelsText.ts`, `tests/application/zoomLevelsText.test.ts` → `tests/ui/zoomLevelsText.test.ts`, `tests/application/placements.test.ts` → `tests/domain/placements.test.ts`
- Modify: `src/application/contracts.ts` (реэкспорт `samePlacement`, `plainText`, `textParts`, `TextPart`, `ZoomLevel`), `src/ui/quick/QuickBar.ts`, `src/ui/menu/TaskMenu.ts`, `src/ui/TaskTitle.ts`, `src/ui/SettingsTab.ts`, `tests/architecture.test.ts`

- [ ] Импорты UI — на контракты; `ui/zoomLevelsText.ts` берёт `ZoomLevel` из контрактов.
- [ ] Вычеркнуть 4 строки (прокладки и `zoomLevelsText`).
- [ ] `grep -rn "\.\./application\|\.\./settings" src/domain` — пусто.
- [ ] `npm test`, `npm run build`, `npm run build:demo` — PASS. Commit `Contracts give the UI the placement and text rules; the shims go, the zoom levels' text is the settings tab's`.

### Task 5: Проверка в тестовом Obsidian и ход работы

- [ ] Свой тестовый Obsidian (свободный порт, свой профиль и vault в scratchpad), сборка ветки, файл задач с секциями Inbox/Now/Soon/Backlog/Done, датой 📅 и слотом ⏰. По CDP: `basePath` — свой vault; вид открыт; снимки Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная; в консоли нет ошибок плагина; задачи и таймлайн на месте (в том числе карточка со слотом — она читает `open`).
- [ ] Строка 1 в «Ход работы» обзора: план, реализация, проверка — готово. Commit `Layers overview: block 1 planned, done and checked in Obsidian`.
