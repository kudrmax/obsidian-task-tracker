# Блок 7 «Секции списка»

Обзор: `2026-11-05-layers-overview.md`. Пакет ревью P6. Опирается на блок 5 (день колонки).

## Цель

Какие секции у задачи можно выбрать, какие показывает колонка и что значит «в секцию X» — отвечает сервис. UI не собирает имена секций из всех загруженных списков.

## Где сейчас

- `ui/TaskCalendarView.ts` `sectionsOf` (чьи секции показывает колонка), `sectionsHome` (у подзадачи и выполненной нет секций; Soon хранит срок), `bulkSections`, `sectionChoice` (имена из всех загруженных списков плюс пресеты, без пустых и «No section»), `toSection` в `showMenu` («No section» → `moveToGroup(null)`, иначе `createGroup`).
- `ui/listGroups.ts`: заголовки видны, как только есть хоть одна секция; зазор над первым заголовком — «No section».
- `ui/TaskList.ts`: список без заголовков пишет `group: null`.
- `ui/menu/TaskMenu.ts`: та же секция — ничего; `ui/GroupNameField.ts`: обрезка имени.

## Что сделать

```ts
// contracts.ts
export interface ListView {
  readonly showsHeaders: boolean;
  readonly groups: readonly { readonly name: GroupName; readonly items: readonly TaskItem[] }[];
}
export interface SectionChoice { readonly names: readonly string[]; readonly current: GroupName; readonly ungrouped: string }
interface TaskService {
  /** The sections a task may go to from its menu: its list's, then the presets it lacks; null for a subtask or a done task. */
  sectionChoices(keys: readonly TaskKey[]): Promise<SectionChoice | null>;
  /** Into section `name` of the tasks' list (No section included); the current one changes nothing. Soon keeps the due date. */
  toSection(keys: readonly TaskKey[], name: GroupName): Promise<void>;
}
```

- Списки (`dayView.list`, `soonWithoutDateView`, `inboxView`, `backlogView`) получают и группировку `ListView` (поле рядом с плоским списком или вместо — по коду при планировании; плоский список остаётся, если на нём держится раскладка).
- `sectionChoice` в сервисе считает имена по файлу, а не по тому, что UI загрузил. Это то же множество: UI загружает все четыре списка целиком. План проверяет это тестом на документе с секциями во всех списках.
- Какая колонка показывает секции — `DayColumn.sections` (блок 5) и `ListView.showsHeaders`.
- UI: `sectionsHome` оставляет только «в какой колонке стоит карточка» (это DOM), остальное — сервис.

## Не меняется

Меню секций, групповое меню, новая секция из меню, переименование и удаление секции, заголовки, зазоры.

## Готово, когда

- `sectionChoice`, `bulkSections`, правило дат Soon ушли из вида; `listGroups.ts` раскладывает готовые группы.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian: меню задачи → секция, новая секция, групповое «в секцию» на Mac.
