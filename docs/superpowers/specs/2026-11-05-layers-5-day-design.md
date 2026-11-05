# Блок 5 «Сегодня, день колонки, размещение»

Обзор: `2026-11-05-layers-overview.md`. Пакет ревью P4.

## Цель

«Какой сегодня день», «что значит колонка дня» и всё, что из этого следует (куда ляжет задача, какой у неё день, можно ли перенести или снять дату), отвечает сервис. UI не строит `DayBoundary` из настроек и не запускает нормализацию при смене дня.

## Где сейчас

- `ui/dayColumn.ts`: сегодня — Now с секциями; будущий день — Soon с этой датой; прошлый — Now с датой без секций. Вызовы: `TaskCalendarView.ts`, `QuickEntryController.ts`.
- `ui/TaskCalendarView.ts` `today()`/`boundary()`: `new DayBoundary(settings.dayStartHour)`.
- `ui/TaskCalendarView.ts` `tick`: минутный тик замечает новый день и зовёт `tasks.normalize()`.
- `ui/settingsEffect.ts`: UI знает, какие настройки меняют разбор файла (`reload`) и что `dayStartHour` двигает «сегодня» (`newDay`).
- `ui/menu/quickMoves.ts`: день задачи (слот → Now = сегодня → срок), «выполненную не переносят», «сегодняшний срок не снять»; `BulkController.ts`, `menu/BulkMenu.ts` повторяют `canRemoveDue`.
- `ui/quick/QuickEntryController.ts` `placeOf`, `columnPlacement`, `moveTo`; `ui/quick/QuickBar.ts` `day === today ? now : date` и `samePlacement`.

## Что сделать

```ts
// contracts.ts
export interface DayColumn { readonly list: "now" | "soon"; readonly date: LocalDate | null; readonly sections: boolean }
export interface DayView { …; readonly column: DayColumn }
export type NewTaskPlace = … | { readonly kind: "day"; readonly date: LocalDate; readonly group: GroupName; readonly before: TaskKey | null };
export interface TaskItem {
  …;
  /** The day the task stands on: its slot's, today for Now, else its due date. */
  readonly day: LocalDate | null;
  readonly can: { readonly postpone: boolean; readonly removeDue: boolean };
}
interface TaskService {
  dayColumn(date: LocalDate): DayColumn;
  placementOfDay(date: LocalDate): Placement;
  dayOfPlacement(placement: Placement): LocalDate | null;
}
export interface DayService {
  today(): LocalDate;
  /** Where a day begins: the timeline places slots, events and now by it. */
  boundary(): DayBoundary;
  /** Fires when today changes: the clock passed the day's start, or the setting moved it. The tasks file is normalized first. */
  onDayChange(listener: () => void): () => void;
}
```

- `DayService` реализуется в `application` над `Clock` и `SettingsStore`; свой таймер раз в минуту (как сейчас тик вида). Нормализацию при смене дня делает он, потом зовёт слушателей. Вид остаётся с минутным тиком только для линии «сейчас».
- `TaskService` сам перечитывает и сообщает `onChange`, когда меняются настройки, влияющие на разбор (список из `settingsEffect.reload` переезжает в `application`). `settingsEffect` оставляет только `restack` и `frame`.
- Правила `dayColumn`, `day`, `can` — в домене, тесты `tests/ui/dayColumn.test.ts`, `quickMoves.test.ts` (их правило) переезжают туда же.
- `ViewDeps` получает `days: DayService`; демо — фиксированный день.

## Не меняется

Когда и что нормализуется, когда перерисовывается экран, плитки переноса в меню, групповое снятие даты, куда ложится задача из быстрого ввода. Полночь/`dayStartHour` срабатывают в ту же минуту.

## Готово, когда

- `ui/dayColumn.ts` и `canRemoveDue` удалены; в UI нет `new DayBoundary`, `dayStartHour`, `tasks.normalize()`.
- Тест смены дня на `DayService` с подменённым часом.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian: быстрый ввод в колонку сегодня и завтра, меню «Today/Tomorrow», смена `Day starts at` в настройках двигает сегодня.
