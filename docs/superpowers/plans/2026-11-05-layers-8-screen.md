# Блок 8 «Чтение экрана и календари» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Когда ходить в сеть за событиями, когда хватит кэша, когда грузить соседние дни, как часто опрашивать и что значит «обновить сейчас» — отвечает `CalendarService`. Что составляет экран задач — один вызов `TaskService.screen(date)`. Вид не читает `settings.google`, `CalendarPolling` живёт в `application`. Поведение то же: каждый сетевой запрос, чтение и запись файла, запись кэша устройства — в том же числе, порядке и в тот же момент.

**Architecture:** `CalendarPolling` переезжает в `src/application` без изменений логики; `CalendarServiceImpl.keepFresh(screen)` создаёт его с интервалом из настроек, часами сервиса и таймерами из нового порта `Timers`, `refreshNow` — экспорт рабочего (`WorkCalendarSetup.export`), затем опрос. `CalendarService.events(date, reason)` выбирает между `eventsOn` и `eventsAround` и решает, нужен ли запрос вообще (`peek`); `eventsOn`/`eventsAround`/`cached` остаются публичными методами реализации (их тесты-счётчики не трогаются), но уходят из контракта. `SourceStatus.kind` выставляет сервис на выходе; кэш устройства хранит статусы без него, как сейчас. `TaskService.screen(date)` — `normalize()` и те же семь чтений.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-8-screen-design.md`, обзор `2026-11-05-layers-overview.md`, правила календарей — `2026-11-03-perf-5-settings-calendars-design.md`.

## Что в спеке уже не так (сверено с master c72329a, после блока 7)

- **Экран — не четыре чтения, а семь.** После поиска, пустых секций, Done и блока 7 `DayData.readTasks` делает `normalize()` и `dayView`, `soonWithoutDateView`, `inboxView`, `backlogView`, `doneView`, `listSections`, `sectionOffer(date)` в одном `Promise.all`. `ScreenView` — все семь: `day`, `soon`, `inbox`, `backlog`, `done`, `sections`, `offer`. `screen(date)` зовёт их так же (каждое чтение — своё `store.read`, как сейчас): число и порядок чтений файла те же. Правило «нет файла — нет событий» остаётся в `DayData` как представление: `screen` отклоняется `TasksFileMissingError`, вид не показывает события и статусы.
- **`events(...).fresh` не может быть промисом.** Промис начал бы запрос сразу. А `DayData` ставит запросы событий в очередь (`Reload`: запрос во время запроса — один после него, «соседи» берутся в момент старта), кэш дня показывает в момент выбора, а запрос стартует, когда очередь свободна. `DayPeek` при кэше в сеть не ходит вовсе. Поэтому `fresh` — функция, которая начинает запрос, когда её зовут, и `null`, когда кэша хватает. Причин три: `open` (день открывается: кэш сразу, свежие с соседями — `eventsAround`), `peek` (день под пальцем: кэш, если есть, иначе с соседями), `refresh` (опрос, «обновить сейчас», источник изменился: только этот день — `eventsOn`).
- **`keepFresh(day)` и `shown(visible)` поменяли бы опрос.** Запрос опроса сейчас идёт через ту же очередь `DayData` (`data.calendars()`): опрос во время открытия дня ждёт его и потом спрашивает день один (тест `DayData`). Сервис, сам зовущий `eventsOn(day())`, обошёл бы очередь и показ. Поэтому `keepFresh` получает от экрана `refresh()` (запросить и показать) и `hidden()`. Видимость читается в момент тика, как сейчас (`contentEl.isShown()` меняется без события), а «окно вернулось» (`wake`: запрос, если прошлому больше половины интервала) и «вид снова на экране» (`catchUp`: только пропущенный тик) — разные правила, одним `shown(visible)` их не выразить. `CalendarPoll` — `wake`, `catchUp`, `refreshNow`, `stop`. Подписки на `focus`, `visibilitychange`, `active-leaf-change`, `onResize` — дело вида (это DOM и Obsidian), они зовут `wake`/`catchUp`, как сейчас.
- **`kind` в кэше устройства поменял бы его формат** и на первом запросе после обновления дал бы лишнюю запись (`newsIn` сравнивает статусы). Поэтому сервис хранит статусы без `kind` (`KeptStatus`, `KeptDay` в `ports.ts`, ими работает `EventCache`) и добавляет `kind` на выходе `events()`: `google` — `synced`, `work` — `exported`. Имена источников («Google Calendar», «Work calendar») `sourceText` по-прежнему берёт по `source`: это название, не правило.
- **Опрос стартует в `onOpen`** там же, где был `polling.start()`; до этого `poll` нет (до `onOpen` вид подписок не держит; `onResize` до `onOpen` зовёт `catchUp`, который без пропущенного тика ничего не делает — то же, что `poll?.catchUp()`). Часы опроса — `Clock` сервиса (`systemClock` — тот же `Date.now()`).
- **Демо.** `DemoCalendarService.events` — как сейчас `eventsOn`/`eventsAround`/`cached`; `keepFresh` без таймера: `refreshNow` — запрос, остальное ничего (события демо не меняются, экспорта у демо не было). `DemoTaskService.screen` — `normalize()` и те же чтения.
- **Страж.** Строк про календари в `ALLOWED` нет: `TaskCalendarView → ports.ts` и `→ settings.ts` держат `Clock`, `SettingsStore` и другие настройки. Вычёркивать, вероятно, нечего — проверяется тестом стража.

## Global Constraints

- Рефакторинг: ни вида, ни запросов, ни записи в файл, ни кэша устройства, ни `data.json` не меняется. `docs/plugin/` не меняется.
- Тесты-счётчики запросов (`CalendarServiceImpl`, `CalendarPolling`, `DayData`) проходят с теми же числами; `CalendarPolling.test.ts` переезжает в `tests/application` как есть.
- Контракты только добавляют и переносят: `ScreenView`, `TaskService.screen`, `EventsReason`, `DayEventsAsk`, `CalendarService.events`, `PolledScreen`, `CalendarPoll`, `CalendarService.keepFresh`, `SourceStatus.kind`; `eventsOn`, `eventsAround`, `cached` уходят из контракта (их заменяет `events`). Все новые методы — и в `tests/fakes/Demo*`.
- `ViewDeps.exportWorkCalendar` уходит: экспорт перед «обновить сейчас» делает сервис.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build:demo`, `npm run build` (последней) зелёные; `phone/task-calendar-phone.js` — только если его требуют `tests/phone`.

---

### Task 1: Опрос в `application`

**Files:**
- Move: `src/ui/CalendarPolling.ts` → `src/application/CalendarPolling.ts`, `tests/ui/CalendarPolling.test.ts` → `tests/application/CalendarPolling.test.ts`
- Modify: `src/application/ports.ts`, `src/application/contracts.ts`, `src/application/CalendarServiceImpl.ts`, `src/compose.ts`, `src/main.ts`, `src/demo.ts`, `src/ui/TaskCalendarView.ts`, `tests/fakes/DemoCalendarService.ts`, `tests/application/CalendarServiceImpl.test.ts`

```ts
// ports.ts
/** One-shot timers: the window's in the plugin, fakes in tests. */
export interface Timers { set(fn: () => void, ms: number): number; clear(id: number): void }
// contracts.ts
/** What the polling asks of the screen. */
export interface PolledScreen {
	/** Fetches the shown day's events afresh and shows them. */
	refresh(): Promise<void>;
	/** The screen is not on view: the document hidden or its tab behind another. Read at every tick. */
	hidden(): boolean;
}
export interface CalendarPoll { wake(): void; catchUp(): void; refreshNow(): Promise<void>; stop(): void }
interface CalendarService {
	/** Polls every refresh interval from the settings while the screen is on view; starts at once. */
	keepFresh(screen: PolledScreen): CalendarPoll;
}
```

- [x] `CalendarPolling` — тот же код, `PollingTimers` → порт `Timers`; тесты переезжают без изменений, кроме пути.
- [x] `CalendarServiceImpl(sources, clock, settings, cache, timers, work)`: `keepFresh` — `CalendarPolling` с `refreshSeconds * 1000` (читается на каждом тике), `clock.now().getTime()`, `start()`; `refreshNow` — `work.export()`, затем `refresh()`.
- [x] Тесты `keepFresh`: интервал из настроек и его смена, запрос на тике и `refresh` экрана, `refreshNow` — экспорт до запроса, `stop` — нет таймера, скрытый экран — ноль запросов.
- [x] Вид: `poll = calendars.keepFresh({ refresh: () => data.calendars(), hidden: … })` там, где был `start()`; `wake`/`catchUp`/`stop`/`refreshNow` — через `poll`. `ViewDeps.exportWorkCalendar`, `SECOND_MS` и чтение `settings.google` уходят.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 2: Какие события и когда — `events(date, reason)`

**Files:**
- Modify: `src/application/contracts.ts`, `src/application/CalendarServiceImpl.ts`, `src/ui/DayData.ts`, `src/ui/DayPeek.ts`, `tests/fakes/DemoCalendarService.ts`, `tests/ui/DayData.test.ts`, `tests/application/CalendarServiceImpl.test.ts`

```ts
export type EventsReason = "open" | "peek" | "refresh";
export interface DayEventsAsk {
	/** The events last fetched for the day, at once; null when none were. */
	readonly cached: DayEvents | null;
	/** Starts the fetch the reason calls for when called; null when the cached events are enough. */
	readonly fresh: (() => Promise<DayEvents>) | null;
}
interface CalendarService { events(date: LocalDate, reason: EventsReason): DayEventsAsk }
```

- [x] `open` — `eventsAround`, `refresh` — `eventsOn`, `peek` — при кэше `fresh: null`, иначе `eventsAround`. `eventsOn`/`eventsAround`/`cached` уходят из контракта, остаются в реализации.
- [x] Тесты `events`: какой запрос за какой причиной, `fresh` не стартует до вызова, `peek` с кэшем — ноль запросов.
- [x] `DayData`: кэш в момент выбора — `events(date, "open").cached`; запрос очереди — `events(date, around ? "open" : "refresh").fresh`. `DayPeek` — `events(date, "peek")`. Фейк `SlowCalendars` в `DayData.test.ts` отвечает через `events`, числа те же.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 3: Вид источника — `SourceStatus.kind`

**Files:**
- Modify: `src/application/contracts.ts`, `src/application/ports.ts`, `src/application/CalendarServiceImpl.ts`, `src/infrastructure/DeviceEventCache.ts`, `src/ui/sources/sourceText.ts`, `tests/fakes/MemoryEventCache.ts`, `tests/fakes/DemoCalendarService.ts`, `tests/ui/sourceText.test.ts`, `tests/application/CalendarServiceImpl.test.ts`

- [ ] `SourceStatus.kind: "synced" | "exported"`; `KeptStatus`/`KeptDay` — без него, ими работают кэш и внутренности сервиса.
- [ ] `events()` добавляет `kind` к статусам и кэша, и свежих; тест: Google — `synced`, рабочий — `exported`, в кэш устройства `kind` не пишется.
- [ ] `sourceText`: «Exported from …» — по `kind`; тесты с `kind`.
- [ ] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 4: Экран задач — `TaskService.screen(date)`

**Files:**
- Modify: `src/application/contracts.ts`, `src/application/TaskServiceImpl.ts`, `src/ui/DayData.ts`, `tests/fakes/DemoTaskService.ts`, `tests/ui/DayData.test.ts`, `tests/application/TaskServiceImpl.test.ts`

```ts
export interface ScreenView {
	readonly day: DayView; readonly soon: readonly TaskItem[]; readonly inbox: readonly TaskItem[]; readonly backlog: readonly TaskItem[];
	readonly done: readonly TaskItem[]; readonly sections: Readonly<Record<GroupedList, readonly ListSection[]>>; readonly offer: SectionOffer;
}
/** Everything the screen shows of the tasks for `date`, the file normalized first. Rejects with TasksFileMissingError. */
screen(date: LocalDate): Promise<ScreenView>;
```

- [ ] Тест сервиса: нормализует до чтения (запись правила видна в `day`), то же, что семь чтений по отдельности, тот же счёт `store.read`; без файла — `TasksFileMissingError`.
- [ ] `DayData.readTasks` — `screen(date)`; тесты `DayData` подменяют `screen` вместо `normalize`/`sectionOffer`.
- [ ] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 5: Сборки, проверка в тестовом Obsidian, ход работы

- [ ] `grep -n "google\|CalendarPolling" src/ui` — пусто (кроме иконки и имени источника); страж — `ALLOWED` по факту.
- [ ] `npm test`, `npm run build:demo`, `npm run build` — PASS.
- [ ] Тестовый Obsidian (порт 9371, свой профиль и vault в scratchpad; `basePath` — свой vault): сборка ветки, плагин перезагружен, `setBackgroundThrottling(false)`; файл рабочего календаря с событиями сегодня и завтра. Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная: события на таймлайне, дни туда и обратно, окно источников и Refresh now, правка рабочего файла доходит до экрана. Ошибок плагина в консоли нет; рабочий файл убран, файл задач восстановлен.
- [ ] Строка 8 в «Ход работы» обзора. Commit.
