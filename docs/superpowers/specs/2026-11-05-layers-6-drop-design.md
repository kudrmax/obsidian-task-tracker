# Блок 6 «Смысл drop'а»

Обзор: `2026-11-05-layers-overview.md`. Пакет ревью P5. Опирается на блоки 4 и 5.

## Цель

Таблица «откуда → куда → какая операция» (spec §5.1) и правила вложенности подзадач — в `application`/домене, один путь для одной карточки и для нескольких. UI описывает жест; сервис решает, что он значит.

## Где сейчас

- `ui/TaskCalendarView.ts` `applyDrop`: выбор `setSlot`, `clearSlot`, `moveToGroup`, `nest`, `moveBefore`, `moveToList`, `moveToSoon`, `moveToEnd` по колонке-источнику.
- `ui/BulkController.ts` `dropChange`: та же таблица ещё раз, в `TaskChange`.
- `ui/drag/listPlace.ts` `levelRange`/выбор родителя: уровень не глубже карточки выше плюс один; заголовок секции рвёт вложенность; `before` — следующая карточка того же уровня.
- `ui/drag/ListDrop.ts` `placesAnywhere`: список без секций берёт чужую карточку только в конец.
- `ui/drag/DropTarget.ts` `carriesMany`: несколько задач не кладутся на таймлайн.
- `ui/BulkController.ts`: подзадача выбранной задачи выкидывается из переноса (контракт `applyAll` это уже обещает).

## Что сделать

```ts
// contracts.ts
export type DropFrom = "left" | "soon" | "inbox" | "backlog" | "timeline";
export type DropTo =
  | { readonly kind: "slot"; readonly slot: Slot }
  | { readonly kind: "clearSlot" }
  | { readonly kind: "list"; readonly column: "left" | EndList; readonly before: TaskKey | null }
  | { readonly kind: "group"; readonly list: GroupedList; readonly group: GroupName; readonly before: TaskKey | null; readonly date: LocalDate | null }
  | { readonly kind: "nest"; readonly parent: TaskKey; readonly before: TaskKey | null };
export type TaskChange = … | { readonly kind: "drop"; readonly from: DropFrom; readonly to: DropTo; readonly day: LocalDate };
interface TaskService {
  /** A drop of one task or several: what spec §5.1 makes of it, one write. */
  drop(keys: readonly TaskKey[], from: DropFrom, to: DropTo, day: LocalDate): Promise<void>;
}
/** Where a card may go in a list of cards with levels: the nesting rules of the file. */
export function levelsAt(above: CardLevel | null, below: CardLevel | null): { readonly min: number; readonly max: number };
export function placeAt(cards: readonly CardLevel[], index: number, level: number): { kind: "task"; before: TaskKey | null } | { kind: "subtask"; parent: TaskKey; before: TaskKey | null };
```

Точная форма `DropTo` и функций вложенности — по коду при планировании; смысл: геометрия зазоров, hit-testing, пиксели остаются в UI, перевод «зазор и уровень → операция» и таблица §5.1 уходят. Политика «чужая карточка в список без секций — в конец» и «несколько не на таймлайн» — тоже в сервис (`drop` решает), UI только спрашивает, принимает ли цель (`accepts(from, to, count)` в контрактах), чтобы подсветка зон не изменилась.

## Не меняется

Каждый drop, групповой и одиночный, пишет в файл то же, что сейчас; подсветка зон и линия места те же. Перетаскивание плюса (новая задача) — своя ветка в быстром вводе, её смысл тоже через `placeAt`, как сейчас (одна механика с перетаскиванием карточки).

## Готово, когда

- `applyDrop` и `dropChange` — один вызов `tasks.drop` / шаг `{ kind: "drop" }`.
- Тесты таблицы §5.1 (все пары «откуда/куда») — в `tests/application`, по одному и группой.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian на телефоне и Mac: перенос из Soon в день, со дня на таймлайн и обратно, вложение подзадачей, перенос нескольких на Mac.
