# Блок 2 «Корень сборки, учётки, телефон» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** в `src/application` нет `obsidian` и `../infrastructure`. Сборка сервисов — в корне `src/compose.ts` рядом с `main.ts`; наружу из корня выходят интерфейсы контрактов (`GoogleAccount`, `WorkCalendarSetup`), а не классы инфраструктуры. Вкладка настроек не читает токен и список календарей из настроек сама. Лог быстрого ввода пишется через зависимость вида. Телефонный модуль — тонкий адаптер над `application/PhoneReminderService.ts`. Поведение, вид, `data.json` и формат файла задач — те же.

**Architecture:** `application/services.ts` переезжает в `src/compose.ts` (корень; страж уже считает его корнем вместе с `main.ts` и `demo.ts`). `application/ports.ts` получает порты `GoogleLogin` (вход, выход, «вошёл ли» — реализует `GoogleAuth`) и `GoogleCalendarList` (список календарей — реализует `GoogleCalendarSource`); `application/GoogleAccountService.ts` реализует `GoogleAccount` над ними и `SettingsStore` (показанные календари: пустой список — все). `WorkCalendarSetup` и лог ввода — тонкие обёртки в корне. Телефон: класс `PhoneReminders` переезжает в `application/PhoneReminderService.ts`, сдвиг слота при snooze — `snoozedSlot` в `domain/operations.ts`.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-2-compose-design.md`, обзор `2026-11-05-layers-overview.md`.

## Что в спеке уже не так (сверено с master 7406d09, после блока 1)

- **Строки `SettingsTab.ts`** сдвинулись: «вошёл ли» — `:204, 208`, показанные календари — `:235–251` (`isShown`, `calendarIdsWith`). Смысл тот же.
- **`compose.ts` уже корень в страже:** блок 1 заранее внёс его в `layerOf` вместе с `main.ts` и `demo.ts`. Менять таблицу слоёв не нужно, только вычеркнуть строки.
- **Корню нужно больше, чем `GoogleAccount` и `WorkCalendarSetup`:** `main.ts` ещё вешает обработчик `obsidian://task-calendar` (`login.receive`) и держит скрипт экспорта в папке плагина (`workExport.keepInstalled()`). `Services` в корне отдаёт для этого функции (`receiveLogin(params)`, `keepWorkExportInstalled()`), а не `GoogleRedirectLogin` и `WorkCalendarExportScript`.
- **`ViewDeps.exportWorkCalendar`** остаётся как есть (вид его уже получает функцией); в корне он идёт через тот же `WorkCalendarSetup.export`.
- **Лог ввода в демо-сборке:** `DemoTaskCalendarPlugin` строит `ViewDeps` сам, а лог сейчас пишется и в демо (на телефоне). Чтобы поведение не менялось, демо берёт тот же лог из корня (`vaultEntryLog(app.vault.adapter)` в `compose.ts`).
- **Тесты правила «показанные календари»** в UI нет: правило покрывается новыми тестами `tests/application/GoogleAccountService.test.ts` (ожидания — как считает вкладка сейчас).
- **Тесты телефона:** `tests/phone/PhoneReminders.test.ts` — тесты правила, они переезжают вместе с классом в `tests/application/PhoneReminderService.test.ts` (меняются только импорт и имя класса, ожидания те же). `tests/phone/build.test.ts` остаётся и требует свежего `phone/task-calendar-phone.js`: бандл пересобирается и коммитится (меняются порядок модулей и имя класса внутри, `TaskCalendarPhone` и его ответы — нет). Для `snoozedSlot` — свой тест в `tests/domain`.
- **Нарушения сейчас** — 40 строк. Блок вычёркивает 19: `application/services.ts` → `obsidian` и 11 модулей инфраструктуры (12 строк), `phone/PhoneReminders.ts` → домен (7 строк). Остаётся 21: UI → `settings.ts` и UI → `application/ports.ts` (блок 10).

## Global Constraints

- Чистый рефакторинг: ни поведения, ни вида, ни записи в файл, ни `data.json` не меняется. `docs/plugin/` не трогается.
- Перенос правила = перенос его тестов; ни одно ожидание не ослабляется и не пропускается.
- Контракты только добавляют: `CalendarOption`, `GoogleAccount`, `WorkCalendarSetup`.
- Удаление файлов — только `trash` (переезд — `git mv`).
- `ALLOWED` в страже — ровно оставшиеся нарушения.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build:demo`, `npm run build` (последней — `main.js` продакшн) зелёные; проверка в тестовом Obsidian (телефон и Mac, светлая и тёмная; вкладка настроек, раздел Google и рабочего календаря).

---

### Task 1: Учётка Google за контрактом

**Files:**
- Create: `src/application/GoogleAccountService.ts`, `tests/application/GoogleAccountService.test.ts`
- Modify: `src/application/contracts.ts` (`CalendarOption`, `GoogleAccount`, `WorkCalendarSetup`), `src/application/ports.ts` (`GoogleLogin`, `GoogleCalendarList`)

**Interfaces:** как в спеке. `GoogleAccountService(login: GoogleLogin, calendars: GoogleCalendarList, settings: SettingsStore)`; `isShown(id)` — `calendarIds` пуст или содержит `id`; `setShown(all, id, shown)` пишет `google.calendarIds` (все показаны — пустой список) через `settings.update({ google: { ...google, calendarIds } })`.

- [ ] Тесты: «вошёл ли» и вход/выход идут в порт; пустой список — показаны все; снять галку — остальные в списке; вернуть последнюю — снова пустой; календарь не из списка не показан, пока список не пуст; список календарей — из порта.
- [ ] `npm test` — PASS. Commit `Google account behind a contract: logged in, the calendars and which are shown, over two ports`.

### Task 2: Корень сборки `src/compose.ts`, вкладка настроек на контрактах

**Files:**
- Move (`git mv`): `src/application/services.ts` → `src/compose.ts`
- Modify: `src/compose.ts`, `src/main.ts`, `src/ui/SettingsTab.ts`, `tests/architecture.test.ts`

- [ ] `Services`: `tasks`, `undo`, `calendars`, `google: GoogleAccount`, `work: WorkCalendarSetup`, `receiveLogin(params)`, `keepWorkExportInstalled()`. `WorkCalendarSetup` — `{ scriptableLoader: () => workExport.loader, export: () => workShortcut.run() }`.
- [ ] `SettingsTabDeps` → `{ google: GoogleAccount; work: WorkCalendarSetup }`; `GoogleCalendarOption`, `isShown`, `calendarIdsWith` уходят из UI; «вошёл ли» — `google.isLoggedIn()`.
- [ ] `main.ts`: `createServices` из `./compose`; обработчик протокола — `services.receiveLogin`; `exportWorkCalendar` — `services.work.export()`.
- [ ] Вычеркнуть 12 строк `src/application/services.ts → …`.
- [ ] `grep -rn "obsidian\"\|infrastructure" src/application` — пусто. `npm test`, `npx tsc --noEmit` — PASS. Commit `Composition root next to main: application knows no Obsidian and no infrastructure; the settings tab asks the Google account`.

### Task 3: Лог быстрого ввода через зависимость вида

**Files:**
- Modify: `src/ui/TaskCalendarView.ts` (`ViewDeps.entryLog`), `src/compose.ts` (`vaultEntryLog`), `src/main.ts`, `src/demo.ts`

- [ ] `ViewDeps.entryLog: { append(text: string): void }`; `traceEntry` пишет в него, условие (`Platform.isMobile`) и текст — те же.
- [ ] `vaultEntryLog(adapter)` в корне: тот же путь «Task Calendar entry log.md», `exists` → `append`/`write`, ошибка — в консоль. Его берут `main.ts` и `demo.ts`.
- [ ] `npm test`, `npm run build:demo` — PASS. Commit `The quick entry log goes through the view's deps, written by the root over the vault`.

### Task 4: Телефон над сервисом из application

**Files:**
- Move (`git mv`): `src/phone/PhoneReminders.ts` → `src/application/PhoneReminderService.ts`, `tests/phone/PhoneReminders.test.ts` → `tests/application/PhoneReminderService.test.ts`
- Create: `tests/domain/snoozedSlot.test.ts`
- Modify: `src/domain/operations.ts` (`snoozedSlot`), `src/phone/main.ts`, `phone/task-calendar-phone.js`, `tests/architecture.test.ts`

**Interfaces:** `export function snoozedSlot(slot: Slot, now: Date, minutes: number): Slot` — слот начинается через `minutes` от `now` (дата — день этого момента), длина та же, открытый остаётся открытым.

- [ ] Тест `snoozedSlot`: длина сохраняется; через полночь — следующий день; открытый слот.
- [ ] Класс `PhoneReminderService`, логика та же, `from` → `ops.snoozedSlot`. `phone/main.ts` импортирует только его.
- [ ] Вычеркнуть 7 строк `src/phone/PhoneReminders.ts → …`.
- [ ] `node phone/build.mjs`; `npm test` — PASS. Commit `Phone reminders are an application service; the snoozed slot is the domain's; the phone module only wires it`.

### Task 5: Сборки, проверка в тестовом Obsidian, ход работы

- [ ] `npm test`, `npm run build:demo`, `npm run build` — PASS.
- [ ] Тестовый Obsidian (порт 9352, свой профиль и vault в scratchpad): `basePath` — свой vault; сборка ветки в `.obsidian/plugins/task-calendar/`, плагин перезагружен; вид открыт; снимки Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная; в консоли нет ошибок плагина; вкладка настроек — раздел Google и рабочего календаря как раньше (не вошёл).
- [ ] Строка 2 в «Ход работы» обзора: план, реализация, проверка — готово. Commit `Layers overview: block 2 planned, done and checked in Obsidian`.
