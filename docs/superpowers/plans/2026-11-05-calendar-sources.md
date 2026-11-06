# Источники встреч, фаза 2 — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** приложение iPhone пишет все календари телефона в `calendar/iphone.json`; плагин и напоминания берут каждый календарь из одного файла по порядку источников и свежести, показывают календари по галочкам плагина; Refresh now на iPhone идёт через приложение.

**Architecture:** три файла-писателя (`google.json` — Google API, `iphone.json` — приложение, `work.json` — Scriptable) одного формата. Чистая логика выбора («какой файл для какого календаря на какой день», сопоставление календарей, отбор галочками) — в `src/application/calendarChoice.ts` плагина; её зовут и сервис календаря, и модуль телефона `src/phone`. Приложение iPhone только выгружает EventKit в файл и передаёт тексты файлов модулю.

**Tech Stack:** TypeScript (Obsidian plugin, vitest), Swift 6 (iOS 26, EventKit, swift-testing), JavaScriptCore.

**Spec:** `docs/superpowers/specs/2026-11-05-calendar-sources-design.md` (принят Максом 05.11).

**Репозитории:** плагин — `~/projects/obsidian-my-own-plugins/obsidian-task-tracker` (ветка `calendar-sources`, worktree в `.worktrees/`); приложение — `~/projects/obsidian-my-own-plugins/task-calendar-ios` (ветка `calendar-sources`, worktree в `.worktrees/`, сабмодуль `plugin` на ветку плагина). Сборка приложения для симулятора: `DEVELOPER_DIR=/Applications/Xcode-26.3.0.app/Contents/Developer`, симулятор iPhone 13 mini `D5C7DF79-0B25-47D1-B07B-C0E2D43DEC70`.

## Global Constraints

- Пути: `calendar/google.json`, `calendar/iphone.json`; Scriptable — настройка `workCalendarFile` (по умолчанию `calendar/work.json`).
- Порядок источников: календари Google-аккаунта — `google` → `iphone` → `work`; остальные — `iphone` → `work`.
- Свежий = `now − exportedAt ≤ staleAfterMinutes` (настройка, по умолчанию 180). Свежесть только по файлу, без ошибок устройства.
- Окно `google.json` и `iphone.json`: с 00:00 дня «сегодня − 30» до 00:00 дня «сегодня + 91» (как `GoogleCalendarFeed`, фаза 1). Scriptable: со вчера на 14 дней (как сейчас).
- Новый календарь виден по умолчанию; скрытые хранятся парами «аккаунт + название».
- `src/settings.ts`, `src/application/contracts.ts` меняются только так, как в этом плане (согласие Макса — принятие спека).
- Слои: `ui` импортирует только `application/contracts.ts`; `tests/architecture.test.ts` не ослаблять. Токены стилей — `tests/styles.test.ts`.
- Удалять только `trash`. Тексты UI плагина и приложения — английские; документация `docs/plugin/` — русская.

## Review Focus

1. Аккаунт Google в iOS назван не почтой (`EKSource.title` = «Gmail»): Google-календари из `iphone.json` должны сопоставиться с `google.json` через главный календарь, названный почтой, а не задвоиться. Тест в Task 2.
2. Scriptable-файл старого формата (без `calendars`, `from`/`to`, `calendarId`) — до того, как Scriptable перезапустится с новым телом: он должен читаться и покрывать дни своих встреч. Тест в Task 1 и Task 2.
3. Календарь без встреч в окне (пустой) не пропадает из галочек и не уводит выбор на файл, где он с встречами устаревшими. Тест в Task 2.
4. Дальний день (через 30 дней): Scriptable его не покрывает, выбор не должен брать «пустой свежий» Scriptable вместо устаревшего `iphone.json`. Тест в Task 2.
5. Отказ записи `iphone.json` (нет доступа к календарям) не мешает напоминаниям: напоминания ставятся, файл не трогается. Тест в Task 7.

---

### Task 1: формат файла календаря (плагин)

**Files:**
- Modify: `src/application/calendarFile.ts`
- Test: `tests/application/calendarFile.test.ts` (создать)

**Interfaces:**
- Produces:
  ```ts
  export const IPHONE_CALENDAR_FILE = "calendar/iphone.json";
  export interface FileCalendar { readonly title: string; readonly account: string | null; readonly calendarId: string | null; readonly color: string | null }
  export interface CalendarFile {
    readonly events: readonly CalendarEvent[];        // как в фазе 1; у события добавляются поля ниже
    readonly calendars: readonly FileCalendar[];       // из поля `calendars`, иначе выведены из событий
    readonly exportedAt: Date;
    readonly device: string | null;
    readonly from: Date | null; readonly to: Date | null;   // окно; null — нет в файле
    readonly validUntil: Date | null;
  }
  // В CalendarEvent (contracts.ts) — новые поля: readonly account: string | null; readonly calendarId: string | null.
  export function readCalendarFile(text: string, source: CalendarSource): CalendarFile;   // без фильтра календарей: отбор — Task 2
  export function calendarFileText(file: Omit<CalendarFile, "events"> & { events: readonly CalendarEvent[] }): string;
  ```
- `CalendarSource` в `contracts.ts` становится `"google" | "iphone" | "work"`.

- [ ] **Step 1: тесты** — `readCalendarFile`:
  - `reads the window, the calendars and validUntil`: файл с `from`, `to`, `validUntil`, `calendars: [{calendar:"Work", calendarId:"c1", account:"max@company.ru", color:"#0A84FF"}]` → поля равны `new Date(...)`, `calendars[0]` = `{ title: "Work", account: "max@company.ru", calendarId: "c1", color: "#0A84FF" }`.
  - `an old file without calendars lists the calendars of its events`: файл фазы 1 с событиями календарей «Work», «Work», «Home» → `calendars.map(c => c.title)` = `["Work", "Home"]`, `from`/`to`/`validUntil` = `null`, у событий `account`/`calendarId` = `null`.
  - `round-trips through calendarFileText`.
- [ ] **Step 2:** `npx vitest run tests/application/calendarFile.test.ts` — FAIL.
- [ ] **Step 3:** реализовать; убрать параметр фильтра из `readCalendarFile`; поправить вызовы (`CalendarFileSource`, `PhoneMeetingService`, `GoogleCalendarFeed`) так, чтобы всё компилировалось (поведение отбора временно переезжает в `CalendarFileSource` как было, до Task 2).
- [ ] **Step 4:** `npx tsc --noEmit && npm test` — PASS.
- [ ] **Step 5:** commit `calendarFile: the window, the calendars, validUntil; a third source, iphone`.

### Task 2: выбор файла для календаря (плагин, чистая логика)

**Files:**
- Create: `src/application/calendarChoice.ts`
- Test: `tests/application/calendarChoice.test.ts`

**Interfaces:**
- Consumes: `CalendarFile`, `FileCalendar` (Task 1).
- Produces:
  ```ts
  export interface CalendarKey { readonly account: string; readonly title: string }   // account "" — неизвестен
  export const keyText: (k: CalendarKey) => string;                                     // `${account}\n${title}`
  export interface KnownCalendar { readonly key: CalendarKey; readonly color: string | null; readonly google: boolean }
  export interface ChosenDay {
    readonly events: readonly CalendarEvent[];   // встречи видимых календарей дня, по началу
    readonly stale: boolean;                      // у какого-то видимого календаря выбранный файл не свежий
  }
  export class CalendarChoice {
    constructor(files: ReadonlyMap<CalendarSource, CalendarFile>, hidden: readonly CalendarKey[], staleAfterMs: number, now: Date);
    known(): readonly KnownCalendar[];            // все календари всех файлов, без повторов, Google-аккаунт первым
    day(start: Date, end: Date): ChosenDay;       // окно дня — как DayWindow сервиса
  }
  ```
- Правила сопоставления (спек, «Один календарь в разных файлах»):
  - Google-почта = `account` календарей `google.json`.
  - В `iphone.json` Google-аккаунт — тот `account`, у которого есть календарь с `title` = Google-почте; всем его календарям ключ `{account: googleEmail, title}`. Остальные — `{account, title}`.
  - `work.json`: `calendarId` найден в `iphone.json` → ключ того календаря; иначе ровно один известный календарь с таким `title` → его ключ; иначе `{account: "", title: "iPhone · " + title}`.
- Правило выбора на день (спек, «Выбор файла»): кандидаты — файлы, где календарь есть в `calendars` и окно покрывает день (`from ≤ start && end ≤ to`; без окна — от первой до последней встречи файла); первый свежий по порядку, иначе с наибольшим `exportedAt`.

- [ ] **Step 1: тесты** (`now` = 2026-11-05 12:00, `staleAfterMs` = 3 ч):
  - `a fresh Google API wins the Google calendars`: «Personal» в `google.json` (встреча 15:00, 2 мин назад) и `iphone.json` (14:00, 40 мин назад) → встреча 15:00.
  - `a stale Google API gives way to the app`: `google.json` 4 ч назад → 14:00, `stale` false.
  - `the app wins the rest, Scriptable takes over when the app is stale`.
  - `everything stale: the freshest, and the day is stale`.
  - `the Google account named Gmail on the iPhone is matched by its main calendar`: `iphone.json` аккаунт «Gmail» с календарями `max@gmail.com` и «Personal» → `known()` без повторов, «Personal» один, `google: true`.
  - `Scriptable's calendar takes the app's account by calendarId`; `an unknown Scriptable calendar matches a unique title`; `two with that title: its own calendar «iPhone · …»`.
  - `an old Scriptable file covers the days of its events`.
  - `a far day Scriptable does not cover is taken from the stale app file`: день через 30 дней, `iphone.json` 5 ч назад, `work.json` 1 мин назад → события из `iphone.json`, `stale` true.
  - `an empty calendar stays known and keeps its file`: «Holidays» в `calendars` у `iphone.json` без встреч → в `known()`; встречи «Holidays» из старого `work.json` не берутся, пока `iphone.json` свежий.
  - `a hidden calendar shows nothing and lights no dot`.
- [ ] **Step 2:** `npx vitest run tests/application/calendarChoice.test.ts` — FAIL.
- [ ] **Step 3:** реализовать `CalendarChoice` (без ввода-вывода).
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** commit `calendarChoice: each calendar from one file, by order and freshness`.

### Task 3: настройки и перенос выбора (плагин)

**Files:**
- Modify: `src/settings.ts` (новые поля, умолчания, `settingsFrom`)
- Create: `src/application/calendarMigration.ts`
- Test: `tests/application/calendarMigration.test.ts`, `tests/settings.test.ts`

**Interfaces:**
- Produces: в `TaskCalendarSettings`: `readonly hiddenCalendars: readonly { readonly account: string; readonly title: string }[]` (умолчание `[]`), `readonly calendarsMigrated: boolean` (умолчание `false`).
  `export function migratedHidden(settings: TaskCalendarSettings, known: readonly KnownCalendar[], googleCalendarIds: ReadonlyMap<string, string> /* id → title из google.json */): CalendarKey[]`.
- Правила (спек, «Галочки»): `google.calendarIds` не пуст → скрыть Google-календари, чьих id нет в списке; `workCalendarTitles` не пуст → скрыть не-Google календари, чьих названий нет в списке (без учёта регистра).

- [ ] **Step 1: тесты** — `hides the Google calendars left unchecked`, `hides the work calendars not named, never a Google one`, `nothing chosen hides nothing`; `settingsFrom` с данными без новых полей даёт `hiddenCalendars: []`, `calendarsMigrated: false`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. `google.json` пишет id календаря в `calendarId` (Task 4) — оттуда карта id → название. **Step 4:** PASS. **Step 5:** commit `settings: hidden calendars; the old choice carried over once`.

### Task 4: Google API пишет все календари с аккаунтом (плагин)

**Files:**
- Modify: `src/infrastructure/GoogleCalendarApi.ts`, `src/infrastructure/GoogleCalendarFeed.ts`
- Test: `tests/infrastructure/GoogleCalendarApi.test.ts`, `tests/infrastructure/GoogleCalendarFeed.test.ts`

**Interfaces:**
- Produces: `GoogleCalendarApi.export(start: Date, end: Date): Promise<{ account: string; calendars: FileCalendar[]; events: CalendarEvent[] }>` — все календари списка (не смотрит на `selected` и `calendarIds`); `account` — id календаря с `primary: true`; у событий `account`, `calendarId` = id календаря. Feed пишет `account`, `calendars`, `from`, `to`.
- `GoogleAccountService.listCalendars/isShown/setShown` остаются для старого экрана настроек до Task 6; ключ ответа (`key()` фида) больше не включает `calendarIds`.

- [ ] **Step 1: тесты** — `exports every calendar, the unselected too, under the primary calendar's account`; feed: `writes the window and the calendars, an empty one included`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS. **Step 5:** commit `Google feed: every calendar of the account, with its account and window`.

### Task 5: сервис календаря на выборе файлов (плагин)

**Files:**
- Modify: `src/application/CalendarServiceImpl.ts`, `src/application/contracts.ts`, `src/application/PhoneMeetingService.ts`, `src/phone/main.ts`, `src/compose.ts`, `src/infrastructure/CalendarFileSource.ts`, `src/ui/TaskCalendarView.ts` (точка), `src/ui/sources/sourceText.ts`, `src/ui/kit/icons.ts`, `src/ui/sources/SourcesPopover.ts` (только данные), `phone/task-calendar-phone.js` (сборка)
- Test: `tests/application/CalendarServiceImpl.test.ts`, `tests/application/PhoneMeetingService.test.ts`, `tests/ui/sourceText.test.ts`, `tests/phone/build.test.ts`

**Interfaces:**
- Consumes: `CalendarChoice` (Task 2), `migratedHidden` (Task 3).
- Produces:
  - `DayEvents` в `contracts.ts` получает `readonly stale: boolean` (точка: «на экране устарело»); `SourceStatus.stale` остаётся «файл этого писателя устарел» для окна источников.
  - `CalendarService` получает `known(): Promise<readonly { readonly account: string; readonly title: string; readonly color: string | null; readonly shown: boolean }[]>` и `setShown(account: string, title: string, shown: boolean): Promise<void>`.
  - `CalendarServiceImpl` constructor: `(files: readonly EventFile[] /* google, iphone, work */, feeds, clock, settings, timers, work, migration: { readonly canMigrate: () => boolean } /* true только на iPhone */)`; перенос (Task 3) — при первом чтении, когда `canMigrate()` и есть `google.json` и `iphone.json`, затем `calendarsMigrated: true`.
  - Модуль телефона: `calendarFiles(settingsJson)` → `["calendar/google.json", "calendar/iphone.json", <workCalendarFile>]`; `meetings(settingsJson, texts, fromMs, toMs, nowMs)` — встречи со временем через `CalendarChoice` по каждому дню диапазона (граница дня — `dayStartHour`), без повторов по `id`.
  - `sourceText`: имя `iphone` — «iPhone calendars» / короткое «iPhone»; иконка `iphone` (контур телефона, как `work`, в `icons.ts`).
  - Точка в `TaskCalendarView`: `dot: () => this.data.stale` (через `DayData`, поле `stale` из `DayEvents`; при отсутствии файла задач — false).
- [ ] **Step 1: тесты** — сервис: `the dot follows the shown calendars, not every writer` (приложение устарело, Scriptable свежий → `stale` false, статус `iphone` stale true); `hidden calendars stay out`; `known lists every calendar with shown`; `the migration runs once, on the phone, with both files`. Модуль телефона: `meetings follow the choice and the hidden calendars` (тот же «Personal» в двух файлах — одна встреча). `sourceText`: `iphone reads Exported from <device>`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать; `node phone/build.mjs`. **Step 4:** `npx tsc --noEmit && npm test` — PASS (в т.ч. architecture, styles, build). **Step 5:** commit `calendars: each calendar from one file; the dot when the screen is stale; iphone.json`.

### Task 6: доски и экраны — галочки календарей, окно источников (плагин)

Экранов нет в дизайне: сначала доски, потом код.

**Files:**
- Create: доски в Claude Design (канвас проекта, страница «Источники встреч»): настройки — список календарей по аккаунтам с переключателями, телефон и Mac, тёмная и светлая; окно источников с тремя строками, телефон и Mac.
- Modify: `src/ui/SettingsTab.ts` (вместо галочек Google и поля Work calendar → Calendars), `src/ui/sources/SourcesPopover.ts`, `styles.css` (только токены), `src/ui/design.ts`
- Test: `tests/ui/…` по образцу соседних тестов настроек и окна источников

- [ ] **Step 1:** доски (правила памяти: только существующие токены и формы, рамки как в проде, варианты в контексте экрана, два кадра тёмный/светлый). Показать Максу, дождаться выбора. **Стоп до ответа.**
- [ ] **Step 2:** тесты UI: `the settings list every known calendar under its account with a toggle that hides it`; `the sources window shows three rows`.
- [ ] **Step 3:** реализовать по выбранной доске; согласовать с веткой `layers-10-settings` (если влита — поверх неё).
- [ ] **Step 4:** `npm test`; проверка в тестовом Obsidian: телефон (390×844, `app.emulateMobile(true)`) и Mac, тёмная и светлая, скриншоты через CDP.
- [ ] **Step 5:** commit `settings: the calendars shown, by account; the sources window with the iPhone`.

### Task 7: приложение пишет `iphone.json` (iOS)

**Files:**
- Create: `Core/Sources/Core/CalendarExport.swift`, `App/Calendar/PhoneCalendarExport.swift`
- Modify: `Core/Sources/Core/Vault.swift` (`write(path:text:)`), `Core/Sources/Core/Reminder.swift` (`calendarFiles`/`meetings` с `now`), `Core/Sources/Core/PhoneCore.swift`, `Core/Sources/Core/ReminderSync.swift`, `App/AppServices.swift`, `App/Settings/SettingsModel.swift`, `App/Settings/SettingsView.swift`, `project.yml`, сабмодуль `plugin`
- Test: `Core/Tests/CoreTests/CalendarExportTests.swift`, `Core/Tests/CoreTests/AfterEventTests.swift`, `Core/Tests/CoreTests/ReminderSyncTests.swift`

**Interfaces:**
- Consumes: формат файла (Task 1), модуль телефона `meetings(..., nowMs)` (Task 5).
- Produces:
  ```swift
  public struct ExportedCalendar: Sendable { public let title, calendarId, account: String; public let color: String? }
  public struct ExportedEvent: Sendable { public let id, title: String; public let start, end: Date; public let allDay: Bool; public let calendarId: String }
  public enum CalendarExport { public static func text(calendars: [ExportedCalendar], events: [ExportedEvent], from: Date, to: Date, exportedAt: Date, device: String, validUntil: Date?) -> String }
  public protocol CalendarExporting: Sendable { func export(now: Date) async throws -> String? }   // nil — нет доступа
  // TasksVault: func write(path: String, text: String) throws
  // ReminderSync.init(..., calendar: CalendarExporting) ; bringUpToDate: сперва export → vault.write("calendar/iphone.json"), ошибки только в лог, затем как раньше.
  ```
- `PhoneCalendarExport`: EventKit, полный доступ; все календари событий; встречи окна (Global Constraints), без отменённых и отклонённых; `account` = `EKSource.title`, `calendarId` = `calendarIdentifier`, `color` = hex `cgColor`; `device` = `UIDevice.current.name`; `validUntil` = `AppSignature.expiration`.
- Настройки приложения: строка Calendar в Permissions (как в коммите `10e9fdc` этого репозитория), футер: «Lets the plugin take your work calendar from this iPhone.»; `NSCalendarsFullAccessUsageDescription`: «Writes this iPhone's calendars to your vault for Task Calendar».
- [ ] **Step 1: тесты** — `CalendarExport` даёт файл, который модуль плагина читает (`PhoneCore.meetings` по тексту возвращает встречу); `a sync writes iphone.json before it reads the meetings`; `no calendar access leaves the file alone and sets the reminders all the same` (Review Focus 5).
- [ ] **Step 2:** `swift test --package-path Core` — FAIL. **Step 3:** реализовать; сабмодуль на ветку плагина с Task 5. **Step 4:** PASS; сборка для симулятора — BUILD SUCCEEDED. **Step 5:** commit `The app writes the phone's calendars to calendar/iphone.json`.
- [ ] **Step 6: проверка аккаунта Google на телефоне Макса** (первым делом после Task 7, до Task 8): поставить сборку ветки установщиком нельзя (он берёт только `origin/master`) — поставить из Xcode/`xcodebuild` + `devicectl device install app` на iPhone Макса с его согласия; приложение пишет файл в волт; прочитать `account`/`calendar` Google-календарей через `devicectl device copy from` контейнера приложения (приложение кладёт копию последней выгрузки в `Library/Caches/iphone.json`). Если главный календарь Google назван не почтой — остановиться и вернуться к спеку.

### Task 8: Refresh now через приложение (iOS + плагин)

**Files:**
- iOS: `App/TaskCalendarApp.swift` (`onOpenURL`), `project.yml` (`CFBundleURLTypes`, схема `taskcalendar`)
- Плагин: Create `src/infrastructure/PhoneCalendarRefresh.ts`; Modify `src/compose.ts`, `src/infrastructure/WorkCalendarShortcut.ts` (остаётся запасным)
- Test: `tests/infrastructure/PhoneCalendarRefresh.test.ts`

**Interfaces:**
- Приложение: `taskcalendar://refresh?vault=<имя>` → `await AppServices.shared.refresh()` (пишет `iphone.json` и ставит напоминания) → открыть `obsidian://open?vault=<имя>`.
- Плагин: `class PhoneCalendarRefresh implements Pick<WorkCalendarSetup, "export">` с deps `{ host: WorkCalendarShortcutHost; readIphone: () => Promise<CalendarFile | null>; shortcut: WorkCalendarShortcut; clock: Clock; timers: Timers }`. `export()`: не телефон — ничего; `validUntil` в будущем → открыть ссылку приложения и через 20 с (таймер тикает после возврата в Obsidian) перечитать `iphone.json`: `exportedAt` раньше момента нажатия → `shortcut.run()`; иначе (нет файла, подпись истекла) → сразу `shortcut.run()`.
- [ ] **Step 1: тесты** — `opens the app while it is signed`; `runs Scriptable when the app's signature ran out`; `runs Scriptable when the app came back without writing`; `does nothing on the Mac`.
- [ ] **Step 2:** FAIL. **Step 3:** реализовать. **Step 4:** PASS; на симуляторе: ссылка открывает приложение, файл обновлён, возврат в Obsidian (Obsidian на симуляторе нет — проверяется, что открывается `obsidian://`-ссылка, по логу). **Step 5:** commit в обоих репозиториях.

### Task 9: Scriptable пишет календари и окно (плагин)

**Files:**
- Modify: `scriptable/work-calendar-export.js`
- Test: `tests/infrastructure/WorkCalendarExportScript.test.ts`

- [ ] **Step 1: тест** — тело скрипта содержит поля `calendarId`, `calendars`, `from`, `to` (по образцу существующих проверок тела).
- [ ] **Step 2–4:** выгрузка пишет `calendarId: e.calendar.identifier`, `calendars` из `Calendar.forEvents()`, `from`/`to` окна; PASS. **Step 5:** commit `Scriptable: the calendars, their ids and the window`.

### Task 10: документация и проверка целиком

**Files:**
- Modify: `docs/plugin/calendars.md`, `docs/plugin/work-calendar.md`, `docs/plugin/notifications.md`, `docs/plugin/settings.md`, `docs/plugin/agents.md`; README приложения, если меняется настройка

- [ ] **Step 1:** обновить страницы по спеку: три файла и схема; Scriptable — запасной; доступ к календарям в приложении; автоматизация «при открытии Obsidian» → Update Reminders; Refresh now; галочки календарей.
- [ ] **Step 2:** проверка целиком: тестовый Obsidian (телефон и Mac, тёмная и светлая) с тремя файлами; симулятор: уведомление с «After …» из выбранного файла; `npm test`, `swift test --package-path Core`.
- [ ] **Step 3:** commit; показать Максу; вливание и релиз — только после его «да» (CLAUDE.md, «Branches»/«Releasing»).
