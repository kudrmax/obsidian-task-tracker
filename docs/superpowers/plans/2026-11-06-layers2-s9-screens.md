# План S9 «Экраны, поиск, даты» + остаток S7

Спек: `docs/superpowers/specs/2026-11-06-layers2-s9-screens-design.md`. Каждый шаг: падающий тест в `tests/application` или `tests/domain`, затем код, затем UI-тест на то, что интерфейс следует ответу.

1. `domain/Days.ts`: `taskScreen(list, day)`, `dayRelation(date, today)`; контракт: `TaskScreen`, `DayRelation`, `ColumnSections`, `SearchGroup`.
2. `TaskService`: `screenOf`, `columnSections`, `findIn`; `search` отдаёт группы; `screen` на отсутствующем файле — пустой экран `missing/calendars`.
3. `DayService`: `relation`, `step`. `CalendarService.isPast`.
4. `application/nesting.ts`: `sameGap`, `gapAt`, `placeOfDrop`, `groupPlaceOf`; в `CONTRACT_RUNTIME`.
5. `RepeatDraft.removable`; `RepeatPanel` по нему; меню и быстрая строка передают `onRemove` всегда.
6. UI: `TaskCalendarView` (reveal, sectionsOf, findTask, шаг стрелок, заголовок), `DayPeek`, `screens.ts`, `dayTitle.ts`, `dates.ts` (`monthAfter`), `DayData`, `searchRows`/`SearchWindow`, `AllDayRow`/`Timeline`, `listPlace`/`ListDrop`/`GroupDrag`, `TaskMenu` (peek, repeat).
7. `tests/uiDecides.test.ts`: в BASELINE только `TaskCard.ts`.
8. `npm test`, `npm run build`; проверка в тестовом Obsidian (порт 9571): поиск и переход к найденным всех видов, стрелки дня и заголовки, перетаскивание в списке и между разделами, прошедшие события, нет файла задач — телефон и десктоп, светлая и тёмная.
9. Слить `origin/master`, прогнать всё снова, отчёт.
