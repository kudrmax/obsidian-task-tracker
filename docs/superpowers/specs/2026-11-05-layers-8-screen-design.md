# Блок 8 «Чтение экрана и календари»

Обзор: `2026-11-05-layers-overview.md`. Пакет ревью P7.

## Цель

Когда ходить в сеть за событиями, когда хватит кэша, когда грузить соседние дни — одно правило в `CalendarService`. Что составляет экран задач — один вызов сервиса.

## Где сейчас

- `ui/CalendarPolling.ts`: интервал опроса, «при пробуждении пропустить, если прошло меньше половины интервала», догоняющий тик. Интервал — `settings.google.refreshSeconds`, читается в `TaskCalendarView.ts`.
- `ui/DayData.ts`, `ui/DayPeek.ts`: выбор `eventsOn`/`eventsAround`, показ кэша до сети.
- `ui/TaskCalendarView.ts` `refreshNow`: «обновить сейчас» = экспорт рабочего календаря, затем опрос.
- `ui/DayData.ts`: экран = `tasks.normalize()` и четыре чтения; «нет файла задач — нет событий».
- `ui/sources/sourceText.ts`: UI знает, что «work» — экспортированный файл, а `detail` — устройство.

## Что сделать

```ts
// contracts.ts
export interface ScreenView { readonly day: DayView; readonly soon: readonly TaskItem[]; readonly inbox: readonly TaskItem[]; readonly backlog: readonly TaskItem[] }
interface TaskService {
  /** Everything the screen shows of the tasks for `date`, the file normalized first. Rejects with TasksFileMissingError. */
  screen(date: LocalDate): Promise<ScreenView>;
}
interface CalendarService {
  /** The day's events: the last ones at once when there are any, and fresh ones as the policy allows (neighbours on open). */
  events(date: LocalDate, reason: "open" | "refresh"): { readonly cached: DayEvents | null; readonly fresh: Promise<DayEvents> };
  /** Polls while the screen is shown; `refreshNow` asks the phone for work events first. */
  keepFresh(day: () => LocalDate): CalendarPoll;
}
export interface CalendarPoll { shown(visible: boolean): void; refreshNow(): Promise<void>; stop(): void }
export interface SourceStatus { …; readonly kind: "synced" | "exported" }
```

- `CalendarPolling` переезжает в `application` (как реализация `keepFresh`), его тесты — в `tests/application`. Интервал читается из настроек там.
- `refreshNow` делает то, что сейчас делает вид: экспорт рабочего (через `WorkCalendarSetup` из блока 2), затем опрос.
- `DayData` берёт `screen(date)` и `events(date, …)`; правило «нет файла — нет событий» остаётся в UI как представление (это то, что показать), если план не найдёт ему места в `ScreenView` естественнее.
- `sourceText` ветвится по `kind`, а не по `source`.

## Не меняется

Частота и момент каждого сетевого запроса, кэш на устройстве, порядок «кэш, потом сеть», соседние дни, «обновить сейчас», тексты статусов источников. Тест-счётчики запросов из блока скорости 5 (`tests/application/CalendarServiceImpl.test.ts`, `tests/ui/CalendarPolling.test.ts`) проходят с теми же числами.

## Готово, когда

- UI не читает `settings.google`; `CalendarPolling` вне `src/ui`.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian: события дня, листание дней, всплывашка источников и «обновить сейчас».
