# Блок 1 «Страж слоёв и зависимости домена»

Обзор: `2026-11-05-layers-overview.md`. Пакеты ревью P0 и часть P1.

## Цель

Правило слоёв проверяет тест, а не только `CLAUDE.md`. Домен больше не импортирует ничего вне `src/domain`. Прокладки `application/placements.ts` и `application/taskText.ts` уходят: UI берёт то же из контрактов.

## Что сделать

### 1. Страж `tests/architecture.test.ts`

Читает импорты (`import … from "…"`, `export … from "…"`, `import("…")`) всех `src/**/*.ts`, разрешает относительные пути и проверяет:

| Слой | Может импортировать |
|------|---------------------|
| `src/domain/**` | только `src/domain/**` |
| `src/application/**` | `src/domain/**`, `src/application/**`, `src/settings.ts` |
| `src/infrastructure/**` | всё, кроме `src/ui/**` |
| `src/ui/**` | `src/ui/**`, `src/application/contracts.ts`, пакет `obsidian` |
| `src/phone/**` | `src/phone/**`, `src/application/**`, `src/settings.ts` |
| `src/settings.ts` | `src/domain/**` |

`src/main.ts`, `src/demo.ts` и корень сборки (`src/compose.ts`, появится в блоке 2) могут всё.

Текущие нарушения — явный список в самом тесте (`ALLOWED`, пары «файл → импорт»). Тест падает и на новое нарушение, и на строку списка, которой больше нет (так список только сокращается). Пакеты `obsidian`, `?raw` и npm-модули — по таблице выше (`obsidian` вне `ui`/`infrastructure`/корня — нарушение).

### 2. Домен не смотрит наверх

- `domain/operations.ts` импортирует из контрактов `EndList`, `GroupedList`, `GroupPlace`, `Placement`, `TaskDraft`, из настроек `GroupSettings`. Эти типы переезжают в домен: `domain/Placement.ts` (`Placement`, `TaskDraft`), `domain/Lists.ts` (`GroupedList`, `EndList`, `GroupPlace`). `GroupSettings` → домен (`domain/Groups.ts`), `settings.ts` его реэкспортирует. Контракты реэкспортируют их под теми же именами; для UI ничего не меняется.
- `domain/queries.ts` импортирует `TaskItem`, `SubtaskProgress`, `PriorityLevel`. `toItem` и `progressOf` (сборка DTO для UI) переезжают в `application/taskItems.ts`. `PriorityLevel`/`PriorityColor`/`PRIORITY_COLORS`/`usablePrefix`/`usableLevels`/`sameLevels` → `domain/Priority.ts`; `settings.ts` реэкспортирует их, чтобы остальной код не трогать в этом блоке.
- «Открытая задача» (`todo` или `inProgress`) записана в `domain/queries.ts:45`, `domain/normalize.ts:6`, `ui/Timeline.ts:102`. Одна функция `isOpen(status)` в `domain/Task.ts`. UI получает `TaskItem.open: boolean` (считает `toItem`), `Timeline.ts` читает его.

### 3. Прокладки

- `application/placements.ts` (реэкспорт `samePlacement`) и `application/taskText.ts` (реэкспорт `plainText`, `textParts`, `TextPart`) удаляются через `trash`. Контракты реэкспортируют `samePlacement`, `plainText`, `textParts`, `TextPart`. Импорты в `ui/quick/QuickBar.ts`, `ui/menu/TaskMenu.ts`, `ui/TaskTitle.ts` идут на контракты. (Блоки 5 и 9 потом решат, нужны ли они UI вообще.)
- `application/zoomLevelsText.ts` — форматирование поля вкладки настроек, это UI. Переезжает в `ui/zoomLevelsText.ts` (с тестом).

## Не меняется

Поведение, вид, формат файла, публичные имена контрактов. Оставшиеся нарушения (настройки в UI, `ports` в UI, корень сборки, телефон) — в списке стража, их убирают блоки 2–10.

## Готово, когда

- `tests/architecture.test.ts` зелёный; в `ALLOWED` нет строк для `src/domain/**` и для прокладок.
- `grep -rn "\.\./application\|\.\./settings" src/domain` пусто.
- `npm test`, `npm run build`, `npm run build:demo` зелёные.
