# Плагин: основа напоминаний на телефоне — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** плагин понимает вид напоминания (`⏰` / `🚨` / `🔕`), отдаёт iOS-приложению собранный JS-модуль «напоминания из файла / Done / отложить», открывается по ссылке из уведомления; Scriptable-уведомления убраны.

**Architecture:** вид напоминания — поле задачи в `src/domain`, читается и пишется тем же разбором строки. Новый «фронтенд» `src/phone` (как `src/scriptable`) поверх `src/application`/`src/domain`, собирается esbuild в `phone/task-calendar-phone.js` (IIFE, глобал `TaskCalendarPhone`), файл коммитится, тест проверяет, что он свежий. iOS-приложение берёт этот файл из submodule.

**Tech Stack:** TypeScript, vitest, esbuild, Obsidian API.

**Spec:** `task-calendar-ios/docs/superpowers/specs/2026-11-04-reminders-design.md`

**Репозиторий и ветка:** `obsidian-task-tracker`, worktree от `master` на ветке `phone-reminders` (правила `~/.claude/CLAUDE.md`, memory «Task Calendar merge flow»). Вливание и релиз — только после явного «да» Макса.

## Global Constraints

- Маркеры по умолчанию: `⏰` — уведомление, `🚨` — будильник, `🔕` — без напоминания. Существующие строки с `⏰` не меняются.
- Напоминают только незакрытые задачи со слотом — те, что отдаёт `openSlotted`.
- Отложить = `setSlot` на `now + N минут` с прежней длительностью, через тот же `normalize`-конвейер, что `TaskServiceImpl.mutate`.
- Done = `setStatus(…, "done")`, через тот же конвейер.
- Конец повторов — начало следующего дня плагина (`dayStartHour`) после дня слота.
- `ui` импортирует только `application`; `src/phone` — тоже фронтенд: импортирует `application` и `domain`, не `infrastructure` и не `obsidian`.
- `src/settings.ts` — общий контракт: только добавление двух полей с умолчаниями.
- Модуль выполняется в JavaScriptCore: без `obsidian`, DOM, `window`, Node API, top-level await; target es2022.
- Тесты не скипать; `npm test` и `npm run build` зелёные перед каждым коммитом.

## Review Focus

1. Задача с `🚨` после перетаскивания, ресайза, Отложить и Done сохраняет `🚨` (все операции через `patch` не должны терять поле). Тест в Task 1.
2. Слот через полночь (`23:30-00:30`) и Отложить в 23:50 на час: дата и время новой строки верные. Тест в Task 3.
3. Две одинаковые строки задачи в файле: Done закрывает одну, вторая остаётся с напоминанием. Тест в Task 3.
4. Пользовательские маркеры и секции из `data.json` (не по умолчанию) работают в телефонном модуле. Тест в Task 3.
5. `data.json` отсутствует или пустой — модуль берёт умолчания, а не падает. Тест в Task 3.

---

### Task 1: Вид напоминания в домене и настройках

**Files:**
- Modify: `src/domain/Task.ts`, `src/domain/TaskLine.ts`, `src/domain/operations.ts:9-11` (`newTask`), `src/settings.ts` (интерфейс, `DEFAULT_SETTINGS`), `src/application/TaskServiceImpl.ts:376-390` (маркеры и ключ чтения), `src/ui/SettingsTab.ts:69`, `src/ui/settingsEffect.ts:24`
- Test: `tests/domain/TaskLine.test.ts` (дописать), `tests/settings.test.ts` (дописать)

**Interfaces:**
- Produces: `export type ReminderKind = "notification" | "alarm" | "none"` в `Task.ts`; `Task.reminder: ReminderKind`; `Markers.alarmSlot?: string`, `Markers.silentSlot?: string`; `TaskCalendarSettings.alarmSlotMarker: string` (`"🚨"`), `silentSlotMarker: string` (`"🔕"`).

- [ ] **Step 1: Failing tests** в `tests/domain/TaskLine.test.ts`, маркеры `{ dueDate: "📅", slot: "⏰", alarmSlot: "🚨", silentSlot: "🔕" }`:
  - `parses the reminder kind from the slot marker`: `- [ ] Call 🚨 2026-11-04 10:00-11:00` → `task.reminder === "alarm"`, `slot` `{date:"2026-11-04",start:600,end:660}`; с `🔕` → `"none"`; с `⏰` → `"notification"`.
  - `writes the slot with its kind's marker`: `formatTaskLine` от разобранной строки с `🚨` возвращает исходную строку.
  - `a task without a slot reads as notification`.
  - `markers without alarm and silent read only the slot marker`: при `{dueDate, slot}` строка с `🚨` не даёт слота.
  - `keeps the kind through setSlot and setStatus`: документ с задачей `🚨`, `ops.setSlot(...)` на другое время, затем `ops.setStatus(..., "done")` → в `serialize()` строка с `🚨`.
- [ ] **Step 2:** `npx vitest run tests/domain/TaskLine.test.ts` → FAIL.
- [ ] **Step 3: Implement.** `FieldSlicer` строит одно регулярное выражение с альтернативой экранированных маркеров (пустые и отсутствующие пропускаются), по группе определяет вид; `slice` возвращает `reminder`. `formatTaskLine` пишет маркер вида (`notification` → `markers.slot`; если маркера вида нет — `markers.slot`). Ключ кеша `fieldSlicerFor` включает все маркеры. `newTask` ставит `reminder: "notification"`. В `settings.ts` два поля с умолчаниями; `TaskServiceImpl` передаёт их в `Markers` и в строку `readingOf`; `settingsEffect` перечитывает при их смене; в `SettingsTab` два поля текста рядом с «Slot marker»: «Alarm marker», «No-reminder marker».
- [ ] **Step 4:** `npm test` → PASS (включая `tests/styles.test.ts` и весь набор).
- [ ] **Step 5: Commit** `Reminder kind: ⏰ notification, 🚨 alarm, 🔕 none, read and written with the slot`.

### Task 2: Один конвейер «текст → документ» для сервиса и телефона

**Files:**
- Create: `src/application/documentText.ts`
- Modify: `src/application/TaskServiceImpl.ts` (`parse`, маркеры, `mutate` используют новый модуль)
- Test: `tests/application/documentText.test.ts`

**Interfaces:**
- Produces:
  - `markersOf(settings: TaskCalendarSettings): Markers`
  - `boundaryOf(settings: TaskCalendarSettings): DayBoundary`
  - `readDocument(text: string, settings: TaskCalendarSettings, today: LocalDate): TaskDocument` — разбор + `ensureSections` + `normalize`, как первая строка `mutate`.
  - `applyOperation(text: string, settings: TaskCalendarSettings, now: Date, op: (doc: TaskDocument, today: LocalDate, boundary: DayBoundary) => TaskDocument): string` — весь конвейер `mutate` без записи и истории, возвращает новый текст.

- [ ] **Step 1: Failing tests:** `applyOperation` с операцией-тождеством возвращает тот же текст, что `TaskServiceImpl` записал бы (сравнить с прогоном `mutate` на фейковом сторе из `tests/fakes`); `readDocument` для пустого текста создаёт секции.
- [ ] **Step 2:** `npx vitest run tests/application/documentText.test.ts` → FAIL.
- [ ] **Step 3:** вынести код из `TaskServiceImpl`, сервис вызывает новые функции; поведение сервиса не меняется.
- [ ] **Step 4:** `npm test` → PASS.
- [ ] **Step 5: Commit** `One text-to-document pipeline for the service and the phone`.

### Task 3: Телефонный модуль `src/phone`

**Files:**
- Create: `src/phone/PhoneReminders.ts`, `src/phone/main.ts`, `phone/build.mjs`, `phone/task-calendar-phone.js` (результат сборки)
- Modify: `package.json` (`build` добавляет `node phone/build.mjs`)
- Test: `tests/phone/PhoneReminders.test.ts`, `tests/phone/build.test.ts`

**Interfaces:**
- Consumes: Task 2 (`applyOperation`, `readDocument`, `boundaryOf`), Task 1 (`Task.reminder`), `settingsFrom`, `openSlotted`, `plainText`, `ops.setSlot`, `ops.setStatus`.
- Produces (глобал `TaskCalendarPhone` в собранном файле; все аргументы и результаты — JSON-совместимые, время — миллисекунды эпохи):
  ```ts
  interface PhoneReminder { id: string; title: string; body: string; kind: "notification" | "alarm"; date: string /* YYYY-MM-DD слота */; startMs: number; dayEndMs: number }
  type PhoneAction = { changed: true; text: string } | { changed: false; reason: "stale" };
  reminders(text: string, settingsJson: string, nowMs: number): PhoneReminder[]
  complete(text: string, settingsJson: string, id: string, nowMs: number): PhoneAction
  snooze(text: string, settingsJson: string, id: string, minutes: number, nowMs: number): PhoneAction
  ```
  - `id` = `entry.raw` (сырая строка задачи). Действие ищет первую запись `openSlotted` с этим `raw`; нет — `stale`.
  - `reminders` отдаёт все открытые задачи со слотом и видом не `none`, у которых `dayEndMs > nowMs` (прошедшие сегодня — тоже: повторы идут до конца дня), по `startMs`. Без лимита 50 — бюджет считает приложение.
  - `body`: `10:00` или `10:00–11:00` (как `SlotReminders.reminder`).
  - `dayEndMs`: начало дня плагина, следующего за `boundary.dayOfSlot(slot)`, в `dayStartHour`.
  - `settingsJson` — содержимое `data.json` плагина или `""`; через `settingsFrom`.

- [ ] **Step 1: Failing tests** (`tests/phone/PhoneReminders.test.ts`, время фиксировано, TZ теста как в остальных тестах проекта):
  - `lists open slotted tasks with their kind`: `⏰` и `🚨` задачи → два напоминания, `🔕` и `[x]` — нет; title без приоритета и ссылок.
  - `keeps a passed reminder until the end of its day`: задача 10:00, now 15:00 того же дня → есть; now следующего дня после `dayStartHour` → нет.
  - `dayEndMs follows dayStartHour`: `dayStartHour: 4`, слот 2026-11-04 23:00 → `dayEndMs` = 2026-11-05 04:00.
  - `complete marks the task done`: строка становится `[x]` (и уходит, куда плагин уводит закрытые).
  - `complete of a changed line is stale`.
  - `two identical lines: complete closes one` (Review Focus 3).
  - `snooze moves the slot from now keeping the duration`: 10:00-11:00, now 10:07, 30 → `10:37-11:37`, маркер вида сохранён.
  - `snooze across midnight` (Review Focus 2): 23:30-00:30, now 23:50, 60 → слот с датой следующего дня `00:50-01:50`.
  - `reads custom markers and sections from settings json` (Review Focus 4).
  - `empty settings json means defaults` (Review Focus 5).
- [ ] **Step 2:** `npx vitest run tests/phone` → FAIL.
- [ ] **Step 3: Implement** `PhoneReminders` (класс над `settingsFrom(JSON.parse(settingsJson || "{}"))`) и `main.ts`, который кладёт три функции в `globalThis.TaskCalendarPhone`. `phone/build.mjs` по образцу `scriptable/build.mjs`: `format: "iife"`, `target: "es2022"`, `--stdout` для теста. `tests/phone/build.test.ts`: закоммиченный файл равен `node phone/build.mjs --stdout`, и в нём нет `require(`, `import ` и `obsidian`.
- [ ] **Step 4:** `npm run build && npm test` → PASS.
- [ ] **Step 5: Commit** `Phone module: reminders, done and snooze over the plugin's own pipeline`.

### Task 4: Ссылка из уведомления открывает плагин

**Files:**
- Modify: `src/main.ts` (второй `registerObsidianProtocolHandler`), `src/infrastructure/GoogleRedirectLogin.ts` не трогать
- Test: ручная проверка в тестовом Obsidian (UI-обвязка; логики нет)

**Interfaces:**
- Produces: `obsidian://task-calendar-open?date=YYYY-MM-DD` — открывает вид плагина (`openView`) и, если вид умеет показать день, показывает `date`; без `date` или с кривой датой — просто открывает вид.

- [ ] **Step 1:** в `main.ts` константа `OPEN_ACTION = "task-calendar-open"` и обработчик. Если у `TaskCalendarView` есть публичный способ перейти к дню — вызвать его; если нет — только `openView` (новый метод вида не добавлять в этой задаче).
- [ ] **Step 2:** `npm run build`; в тестовом Obsidian (порт 9333, см. CLAUDE.md проекта) выполнить через CDP `window.open("obsidian://task-calendar-open?date=2026-11-05")` → вид открыт. Телефонный вид (`app.emulateMobile(true)`) — то же.
- [ ] **Step 3: Commit** `obsidian://task-calendar-open opens the calendar`.

### Task 5: Убрать Scriptable-уведомления, новая страница документации

**Files:**
- Delete (через `trash`): `src/scriptable/SlotReminders.ts`, `src/scriptable/TaskNotifications.ts`, `src/scriptable/main.ts`, `scriptable/build.mjs`, `scriptable/Task Notifications.js`, `tests/scriptable/SlotReminders.test.ts`, `tests/scriptable/TaskNotifications.test.ts`, `tests/scriptable/build.test.ts`. Перед удалением — `grep`: всё, что нужно рабочему календарю (`Export Work Calendar.js`, `work-calendar-export.js`, части `Scriptable.ts`), остаётся.
- Modify: `package.json` (убрать `node scriptable/build.mjs`), `docs/plugin/notifications.md` (переписать), `docs/plugin/README.md` (строка про уведомления), `README.md` (раздел Notifications, если есть)

- [ ] **Step 1:** удалить файлы, `npm run build && npm test` → PASS.
- [ ] **Step 2:** переписать `docs/plugin/notifications.md` по-русски — что Макс делает руками и как проверить (раздел «Документация» спеки): установка из Xcode и переподпись раз в 7 дней; выбор папки vault в приложении; разрешения на уведомления и будильники; стиль баннера «Постоянно»; приложение в Allowed Apps каждого Focus; автоматизация «Команды» → Automation → App → Obsidian → Is Closed → Run Immediately → действие приложения «Обновить напоминания» (iOS 27: выключить Confirm Before Run, включить Allow Running When Locked); маркеры `⏰ 🚨 🔕`; проверка: поставить задачу на +2 минуты, выйти из Obsidian, дождаться уведомления, нажать `15 min`, открыть Obsidian — время сдвинулось.
- [ ] **Step 3: Commit** `Notifications move to the iOS app: the Scriptable script goes, the setup page is rewritten`.
