# iOS-приложение: напоминания — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** приложение Task Calendar для iPhone держит напоминания (тихие липкие уведомления и будильники AlarmKit) равными задачам со временем в файле Obsidian и выполняет Done / Отложить из уведомления и будильника.

**Architecture:** Swift-пакет `Core` (Foundation + JavaScriptCore, тестируется `swift test` на Mac) — вся логика: мост к `TaskCalendarPhone` из плагина, план повторов, синхронизация через протоколы. Таргет `TaskCalendar` (iOS) — только адаптеры: файлы по bookmark, `UNUserNotificationCenter`, AlarmKit, App Intents, фоновое обновление, экран настроек. Плагин — submodule `plugin/`, приложение берёт из него только `plugin/phone/task-calendar-phone.js`.

**Tech Stack:** Swift 6, SwiftUI, UserNotifications, AlarmKit, AppIntents, BackgroundTasks, JavaScriptCore, XcodeGen, Swift Testing.

**Spec:** `docs/superpowers/specs/2026-11-04-reminders-design.md`. Зависит от плана `2026-11-04-plugin-phone-reminders.md` (файл `phone/task-calendar-phone.js`).

## Global Constraints

- **Нужен Xcode 26 или новее** (AlarmKit, `supportedModes`, iOS 26 SDK). На Mac сейчас Xcode 16.4 — это блокер Task 1; ставит Макс (App Store / developer.apple.com, нужен его Apple ID). Если iPhone Макса на iOS 27 — Xcode с поддержкой iOS 27.
- Deployment target iOS 26.0. Bundle id `com.kudrmax.taskcalendar`. Подпись — personal team Макса (бесплатная).
- Только локальные уведомления. Без push, без Time Sensitive, без сервера, без keep-alive хаков, без widget extension (будильник без countdown, см. Task 6).
- Уведомление: `sound = nil`, `interruptionLevel = .active`, `threadIdentifier` = id напоминания; заголовок — `title`, текст — `body`.
- Кнопки уведомления, ровно эти, по порядку: `Done` (`checkmark`), `15 min`, `30 min`, `1 hour` (`clock.arrow.circlepath`), все без `.foreground`. Категория с `.customDismissAction`.
- Тап по уведомлению открывает `obsidian://task-calendar-open?date=<дата слота>`.
- Повторы: смещения от начала слота 0…14 мин каждую минуту, 15…55 каждые 5, дальше каждые 15 — до `dayEnd`. Для будильника цепочка та же, но без смещения 0. Всего запланированных уведомлений ≤ 60 (запас до лимита iOS 64), ближайшие раньше.
- Задачу меняют только `Done` и Отложить. Стоп будильника, смахивание, боковая кнопка файл не трогают.
- Будильник: заголовок — `title`; своя кнопка `Snooze` (SF `zzz`) — Отложить на интервал из настроек (15 / 30 / 60, по умолчанию 30). Звук — `alarm.caf` из бандла (любой короткий звук-заглушка).
- Иконка приложения — заглушка.
- Удаление файлов — только `trash`. Тесты не скипать.

## Review Focus

1. Файл задач ещё дописывается Obsidian в момент синхронизации: прочитали, через 1 с mtime другой — перечитать. Тест в Task 4.
2. Bookmark устарел (`bookmarkDataIsStale`) или папку переименовали: синхронизация не падает молча — статус «Нет доступа к папке» на экране и в логе. Тест в Task 4.
3. Кнопка нажата по задаче, которую с тех пор изменили на Mac: `stale` → пересинхронизация, уведомление по старой строке исчезает. Тест в Task 5.
4. 70 будущих повторов при лимите 60: берутся ближайшие, дальние добавятся при следующей синхронизации. Тест в Task 3.
5. Синхронизация дважды подряд ничего не меняет (не пересоздаёт уже стоящие уведомления и будильники). Тест в Task 5.

---

### Task 1: Каркас репозитория и проекта

**Files:**
- Create: `project.yml`, `App/Info.plist` (через XcodeGen), `App/TaskCalendarApp.swift`, `App/Resources/alarm.caf`, `App/Assets.xcassets` (иконка-заглушка), `Core/Package.swift`, `Core/Sources/Core/Core.swift`, `Core/Tests/CoreTests/SmokeTests.swift`, `.gitignore` (`*.xcodeproj`, `.build`, `DerivedData`), `README.md` (как собрать)
- Submodule: `plugin` → `https://github.com/kudrmax/obsidian-task-tracker.git`, на коммите ветки `phone-reminders` (после вливания плагина — на `master`)

- [ ] **Step 1:** проверить `xcodebuild -version` ≥ 26. Меньше — остановиться и сказать Максу (Global Constraints).
- [ ] **Step 2:** `brew install xcodegen`; `git submodule add … plugin`.
- [ ] **Step 3:** `project.yml`: таргет `TaskCalendar` (iOS 26, SwiftUI app), зависимость от локального пакета `Core`, ресурс `plugin/phone/task-calendar-phone.js` и `App/Resources/alarm.caf`; Info.plist: `NSAlarmKitUsageDescription` («Будильники для задач со временем»), `BGTaskSchedulerPermittedIdentifiers` = `["com.kudrmax.taskcalendar.refresh"]`, `UIBackgroundModes` = `["fetch"]`, URL scheme не нужна. `Core/Package.swift`: платформы iOS 26, macOS 15; таргет теста.
- [ ] **Step 4:** `xcodegen generate && xcodebuild -scheme TaskCalendar -destination 'platform=iOS Simulator,name=iPhone 16 Pro' build` → BUILD SUCCEEDED; `swift test --package-path Core` → PASS.
- [ ] **Step 5: Commit** `Scaffold: app target, Core package, plugin submodule`.

### Task 2: Мост к модулю плагина

**Files:**
- Create: `Core/Sources/Core/Reminder.swift`, `Core/Sources/Core/PhoneCore.swift`
- Test: `Core/Tests/CoreTests/PhoneCoreTests.swift` (скрипт читается из `../../../plugin/phone/task-calendar-phone.js` относительно `#filePath`)

**Interfaces:**
- Produces:
  ```swift
  public enum ReminderKind: String, Sendable { case notification, alarm }
  public struct Reminder: Equatable, Sendable { public let id: String; title: String; body: String; kind: ReminderKind; start: Date; dayEnd: Date; date: String /* YYYY-MM-DD слота */ }
  public enum ActionResult: Equatable, Sendable { case changed(text: String), stale }
  public protocol TaskRules: Sendable {
      func reminders(text: String, settingsJSON: String, now: Date) throws -> [Reminder]
      func complete(id: String, text: String, settingsJSON: String, now: Date) throws -> ActionResult
      func snooze(id: String, minutes: Int, text: String, settingsJSON: String, now: Date) throws -> ActionResult
  }
  public final class PhoneCore: TaskRules { public init(script: String) throws }
  public enum PhoneCoreError: Error { case scriptFailed(String) }
  ```
  `date` берётся из поля `date` модуля плагина (`PhoneReminder.date`).

- [ ] **Step 1: Failing tests:** `reminders` по тексту с `⏰` и `🚨` задачами возвращает два `Reminder` с верными `kind`, `start`; `complete` возвращает `.changed` с `[x]`; `snooze(minutes: 30)` сдвигает слот; кривой id → `.stale`; исключение JS → `PhoneCoreError.scriptFailed` с текстом.
- [ ] **Step 2:** `swift test --package-path Core --filter PhoneCoreTests` → FAIL.
- [ ] **Step 3:** `JSContext`, `evaluateScript(script)`, вызов функций `TaskCalendarPhone` с аргументами-строками/числами, `exceptionHandler` → ошибка. Один `JSContext` на экземпляр; класс не потокобезопасен — вызывать с одного актора (`@MainActor` в приложении).
- [ ] **Step 4:** `swift test --package-path Core` → PASS.
- [ ] **Step 5: Commit** `Core: bridge to the plugin's phone module`.

### Task 3: План повторов

**Files:**
- Create: `Core/Sources/Core/RepeatPlan.swift`
- Test: `Core/Tests/CoreTests/RepeatPlanTests.swift`

**Interfaces:**
- Produces:
  ```swift
  public struct PlannedNotification: Equatable, Hashable, Sendable { public let identifier: String /* "\(reminder.id)#\(offsetMinutes)" */; reminderID: String; fire: Date }
  public struct RepeatPlan { public static let budget = 60
      public static func offsets(for kind: ReminderKind) -> [Int]   // минуты от start, без верхней границы до 24 ч
      public static func plan(_ reminders: [Reminder], now: Date) -> [PlannedNotification] }
  ```

- [ ] **Step 1: Failing tests:** `offsets(.notification)` начинается `[0,1,…,14,15,20,…,55,60,75,…]`; `.alarm` — то же без `0`; повторы после `dayEnd` не попадают; прошедшие (`fire <= now`) не попадают; задача 10:00, now 10:20 → первый `fire` 10:25; три задачи по 30 повторов → ровно 60, все раньше любого отброшенного (Review Focus 4); идентификаторы стабильны между вызовами.
- [ ] **Step 2:** `swift test --package-path Core --filter RepeatPlanTests` → FAIL.
- [ ] **Step 3:** слить повторы всех напоминаний, отсортировать по `fire`, взять первые `budget`.
- [ ] **Step 4:** PASS.
- [ ] **Step 5: Commit** `Core: repeat plan within the notification budget`.

### Task 4: Vault: доступ, чтение, запись

**Files:**
- Create: `Core/Sources/Core/Vault.swift`
- Test: `Core/Tests/CoreTests/VaultTests.swift` (временная папка)

**Interfaces:**
- Produces:
  ```swift
  public protocol BookmarkStore: Sendable { func load() -> Data?; func save(_ data: Data) }
  public enum VaultError: Error, Equatable { case noAccess, tasksFileMissing(String) }
  public final class Vault {
      public init(bookmarks: BookmarkStore)
      public func choose(folder: URL) throws            // создаёт bookmark (на iOS после startAccessing…)
      public func read() throws -> (tasks: String, settingsJSON: String)  // путь к файлу задач — из data.json (`tasksFile`), иначе "TODOs Tasks.md"
      public func write(tasks: String, expecting old: String) throws -> Bool  // false, если файл успел измениться
  }
  ```
  `settingsJSON` = содержимое `.obsidian/plugins/task-calendar/data.json` или `""`. Чтение и запись — `NSFileCoordinator`, внутри `startAccessingSecurityScopedResource`/`stop…`. `read` перечитывает, если mtime сменился за 1 с после первого чтения (Review Focus 1). Устаревший bookmark пересоздаётся, если резолвится; не резолвится — `noAccess` (Review Focus 2).

- [ ] **Step 1: Failing tests:** чтение файла по `tasksFile` из `data.json`; без `data.json` — умолчание и `settingsJSON == ""`; нет файла задач → `tasksFileMissing`; нет bookmark → `noAccess`; `write(expecting:)` с устаревшим `old` → `false` и файл не тронут; файл, изменённый в течение 1 с после чтения, перечитывается.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** `swift test --package-path Core` PASS.
- [ ] **Step 5: Commit** `Core: vault access by bookmark, coordinated read and write`.

### Task 5: Синхронизация и действия

**Files:**
- Create: `Core/Sources/Core/ReminderSync.swift`
- Test: `Core/Tests/CoreTests/ReminderSyncTests.swift` (фейки трёх протоколов)

**Interfaces:**
- Consumes: Task 2 `TaskRules`, Task 3 `RepeatPlan`, Task 4 `Vault`.
- Produces:
  ```swift
  public protocol NotificationScheduling: Sendable {
      func pending() async -> Set<String>
      func delivered() async -> [(identifier: String, reminderID: String, at: Date)]
      func schedule(_ n: PlannedNotification, reminder: Reminder) async throws
      func removePending(_ ids: [String]) async
      func removeDelivered(_ ids: [String]) async }
  public protocol AlarmScheduling: Sendable {
      func scheduled() async -> [String: Date]          // reminder id → время
      func schedule(_ reminder: Reminder) async throws
      func cancel(_ reminderIDs: [String]) async }
  public enum SyncStatus: Equatable, Sendable { case ok(reminders: Int, at: Date), failed(String) }
  public actor ReminderSync {
      public init(vault: Vault, rules: TaskRules, notifications: NotificationScheduling, alarms: AlarmScheduling, now: @Sendable () -> Date)
      public func sync() async -> SyncStatus
      public func complete(reminderID: String) async -> SyncStatus
      public func snooze(reminderID: String, minutes: Int) async -> SyncStatus }
  ```
  `sync`: прочитать → `reminders` → план → убрать pending, которых нет в плане; добавить недостающие; будильники: `kind == .alarm` и `start > now` — поставить, если нет или время другое; лишние снять; из delivered оставить по одному (последнему) на напоминание, уведомления уже не существующих напоминаний убрать. `complete`/`snooze`: прочитать → правило → `.changed` → `write(expecting:)` (вернул `false` — один повтор с перечитыванием) → `sync`; `.stale` → `sync` (Review Focus 3). Ошибка записи → `.failed("Не получилось — открой Obsidian")`, напоминание остаётся.

- [ ] **Step 1: Failing tests:** первая синхронизация ставит план и будильник; вторая подряд не вызывает `schedule`/`remove` (Review Focus 5); закрытая в файле задача снимает свои pending, delivered и будильник; перенесённая — старые сняты, новые поставлены; `complete` пишет `[x]` и снимает всё по задаче; `snooze(30)` пишет новое время и ставит новую цепочку; `stale` → пересинхронизация; ошибка записи → `.failed`, pending не тронуты.
- [ ] **Step 2:** FAIL → **Step 3:** implement → **Step 4:** PASS.
- [ ] **Step 5: Commit** `Core: reminder sync, done and snooze`.

### Task 6: iOS-адаптеры: уведомления и будильники

**Files:**
- Create: `App/Notifications/UserNotifications.swift` (`NotificationScheduling` над `UNUserNotificationCenter`, категория `task-reminder`), `App/Notifications/NotificationDelegate.swift`, `App/Alarms/Alarms.swift` (`AlarmScheduling` над `AlarmManager`), `App/Alarms/SnoozeAlarmIntent.swift`, `App/Alarms/TaskAlarmMetadata.swift`

**Interfaces:**
- Consumes: Task 5 протоколы и `ReminderSync`.
- Produces: `AppServices.shared.sync: ReminderSync` (создаётся в `App/AppServices.swift` один раз, `@MainActor`), используется Task 7.

- [ ] **Step 1:** уведомления: `userInfo` = `["reminderID", "date"]`; кнопки по Global Constraints, `identifier`: `done`, `snooze15`, `snooze30`, `snooze60`. Делегат ставится в `init` приложения (до конца запуска): action → `complete`/`snooze`; `UNNotificationDismissActionIdentifier` → `sync` (покажет следующий повтор); default → `UIApplication.shared.open(obsidian://task-calendar-open?date=…)`; `willPresent` → `[.banner, .list]`.
- [ ] **Step 2:** будильники: `AlarmManager.AlarmConfiguration.alarm(schedule: .fixed(start), attributes: AlarmAttributes(presentation: AlarmPresentation(alert: .init(title: title, secondaryButton: AlarmButton(text: "Snooze", textColor: .white, systemImageName: "zzz"), secondaryButtonBehavior: .custom)), metadata: TaskAlarmMetadata(reminderID:), tintColor: .orange), stopIntent: nil, secondaryIntent: SnoozeAlarmIntent(reminderID:), sound: .named("alarm.caf"))`. Соответствие reminder id ↔ `Alarm.ID` хранить в `UserDefaults` (id детерминированный UUID от reminder id). `SnoozeAlarmIntent: LiveActivityIntent` → `snooze(minutes: Settings.alarmSnooze)`. Запрос разрешения — при первом будильнике.
- [ ] **Step 3:** `xcodebuild … build` → SUCCEEDED; в симуляторе iPhone 16 Pro (не создавать новые) с тестовым vault: задача на +1 мин → уведомление без звука с четырьмя кнопками; `🚨` на +1 мин → будильник, `Snooze` сдвигает задачу в файле.
- [ ] **Step 4: Commit** `App: notifications with Done and snooze, alarms with Snooze`.

### Task 7: Пробуждения и экран настроек

**Files:**
- Create: `App/Intents/SyncRemindersIntent.swift`, `App/Intents/Shortcuts.swift`, `App/Background/Refresh.swift`, `App/Settings/SettingsView.swift`, `App/Settings/AppSettings.swift`
- Modify: `App/TaskCalendarApp.swift`

**Interfaces:**
- Consumes: Task 6 `AppServices.shared.sync`.

- [ ] **Step 1:** `SyncRemindersIntent` (title «Обновить напоминания», `supportedModes = .background`, в основном таргете) → `sync()`; `AppShortcutsProvider` с ним. `Refresh`: регистрация `com.kudrmax.taskcalendar.refresh` в запуске, задача → `sync()` и перепланирование через 15 мин (`earliestBeginDate`). `sync()` ещё на `scenePhase == .active`.
- [ ] **Step 2:** `SettingsView` (системный `Form`, без дизайна — дизайн потом): «Папка vault» (`fileImporter` с `.folder` → `Vault.choose`), статус последней синхронизации (`SyncStatus` по-человечески: «12 напоминаний, 10:42» / текст ошибки), разрешения (уведомления, будильники; кнопка «Разрешить»), «Отложить будильник на» — 15 / 30 / 60 мин, по умолчанию 30, `UserDefaults`.
- [ ] **Step 3:** симулятор: Shortcuts → своё действие «Обновить напоминания» запускается без открытия приложения; статус обновился.
- [ ] **Step 4: Commit** `App: background sync intent, refresh, settings`.

### Task 8: Приёмка на iPhone Макса

- [ ] **Step 1:** Макс подключает iPhone, в Xcode выбирает свою personal team; агент: `xcodebuild -destination 'platform=iOS,name=<iPhone Макса>' …` или Run из Xcode.
- [ ] **Step 2:** пройти страницу `plugin/docs/plugin/notifications.md` по шагам; поправить её, если шаг не совпал (в ветке плагина).
- [ ] **Step 3:** проверки из спеки «Проверка готового приложения на телефоне», 1–4: тихий intent из «Is Closed»; Done и `15 min` на заблокированном телефоне (не пишет — включить `.authenticationRequired` у кнопок, коммит); повторы заменяют, а не копятся (копятся — `removeDelivered` при каждом пробуждении уже есть; описать Максу, что видно); будильник: звонок, Стоп, Snooze, след-уведомление.
- [ ] **Step 4:** сообщить Максу итог каждой проверки; после его «да» — вливание плана плагина, релиз плагина, submodule на `master`.
