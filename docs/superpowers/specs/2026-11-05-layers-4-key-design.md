# Блок 4 «Непрозрачный TaskKey»

Обзор: `2026-11-05-layers-overview.md`. Пакет ревью P2.

## Цель

UI не разбирает ключ задачи на поля. Какие поля составляют личность задачи, решает одна функция в контрактах.

## Где сейчас

- `ui/drag/listPlace.ts` `sameTask`: сравнивает `section`, `index`, `path` без `raw`. Используется в `listGroups.ts`, `TaskList.ts`, `TaskCalendarView.ts` (`findTask`), `listPlace.ts` (`gapOf`). Сервис (`TaskServiceImpl` `sameKey`) сравнивает ещё и `raw`.
- `ui/TaskSelection.ts` `idOf`: склеивает строку из полей ключа.
- `ui/quick/QuickEntry.ts`: фальшивый ключ `UNWRITTEN = { section: "now", index: -1, path: [], raw: "" }`; поиск задачи заново по `key.raw`.
- `ui/quick/QuickEntryController.ts`: подзадача = `key.path.length > 0`.
- `ui/TaskCalendarView.ts` `unnamed`: сравнение по `key.section` и `key.index`.

## Что сделать

```ts
// contracts.ts
/** The same place in the file: section, index and path. Two reads of one place match even when its line changed. */
export function samePlace(a: TaskKey, b: TaskKey): boolean;
/** A string that names the task as read: equal for equal keys, raw line included. */
export function keyId(key: TaskKey): string;
export interface TaskItem { …; readonly isSubtask: boolean }
interface TaskService {
  /** The task at `key`'s place when its line still reads as `key.raw`, re-read: a fresh key; null when it changed or went. */
  refresh(key: TaskKey): Promise<TaskKey | null>;  // только если QuickEntry нужен поиск по raw асинхронно
}
```

- Обе существующие семантики сохраняются, но получают имена: UI-шное `sameTask` (без `raw`) → `samePlace`; сервисное `sameKey` (с `raw`) остаётся внутри сервиса. `samePlace` реализуется в `application` и реэкспортируется контрактами.
- `TaskSelection` использует `keyId` (та же строка, что и сейчас: поведение выбора не меняется).
- Строка, которая ещё не записана: тип UI `ListCard.key: TaskKey | null` вместо `UNWRITTEN`.
- Поиск по `raw` в `QuickEntry` (переименование после перечитывания): функция контрактов `sameLine(a, b): boolean` (сравнение `raw`), если план покажет, что этого достаточно; иначе `refresh`.
- Подзадача: `item.isSubtask` (или уже существующее `parentText !== null`, если в месте вызова есть `TaskItem`).
- `TaskItem.list: SectionKey` — явное имя для «в каком списке задача» вместо `key.section` в UI. Чтения `item.key.section` в UI переходят на `item.list`.

## Не меняется

Сравнения дают ровно те же ответы, что сейчас, в каждом месте вызова. Выбор нескольких карточек, перетаскивание, быстрый ввод, переименование.

## Готово, когда

- `grep -rnE "key\.(index|path|raw|section)" src/ui` пусто (кроме передачи ключа целиком).
- Тесты `samePlace`/`keyId` в `tests/application`; тесты UI, которые проверяли `sameTask`, проверяют вызов контракта.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian: перетаскивание в списке, выбор нескольких на Mac, переименование задачи.
