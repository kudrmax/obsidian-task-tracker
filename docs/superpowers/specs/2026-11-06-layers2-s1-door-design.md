# S1 «Один вход для двух фронтендов»

Ревью: `layers-review-2`, пакет S1. Ветка `layers2-s1-door`.

## Что

1. **`composeCore(ports)`** в `src/application/composeCore.ts` собирает `TaskServiceImpl`, `DayServiceImpl`, `CalendarServiceImpl` и `UndoHistory` над портами хоста: файл задач, настройки, часы, тикер, таймеры, файлы календарей (по имени источника), фиды, экспорт рабочего календаря, «это телефон». Порядок источников (`google`, `iphone`, `work`) и флаг `canMigrate` решаются только там. `src/compose.ts` — порты Obsidian + `composeCore` + Google и рабочий календарь.
2. **Синхронное сердце сервисов.** `TaskRules` (`application/TaskRules.ts`) — правила файла задач над текстом: как он читается (разбор, разделы, нормализация) и что пишет каждое действие (операция над документом, с проверками «пусто» и «устарело»). `TaskServiceImpl` — оболочка над ним: хранилище, кэш прочитанного, подписки, история. `ShownCalendars` (`application/shownCalendars.ts`) — какие календари показаны и дни календаря из файлов; им пользуются `CalendarServiceImpl` и телефон.
3. **Дверь для JavaScriptCore** — `PhoneDoor` (`application/PhoneDoor.ts`). Без состояния: каждый вызов собирает `TaskRules` над настройками из JSON и `now` и работает с текстом, который дала iOS. Отдаёт новый текст и простые данные: время в миллисекундах эпохи, `{changed:false, reason:"stale"}` вместо исключения, никаких функций. `src/phone/main.ts` только кладёт её функции в `globalThis.TaskCalendarPhone`.
4. **Напоминания** — `TaskReminders` (`application/TaskReminders.ts`): какие задачи звенят и когда, и как найти задачу напоминания по её строке (в том числе вчерашнюю, чей слот сегодняшняя нормализация уже стёрла). Действия — те же методы `TaskRules`, что у `TaskServiceImpl`: `setStatus`, `setReminder`, `snooze`.
5. **Один `readingKey(settings)`** в `documentText.ts`: что из настроек задаёт чтение файла. Им пользуются кэш `TaskServiceImpl` и `readsAnew` (плюс файл и цвета уровней и меток, которые меняют вид карточек).

`PhoneReminderService`, `PhoneCaptureService`, `PhoneMeetingService` удаляются: своего поиска задачи, своей проверки пустоты и «устарело», своего разбора настроек у телефона больше нет.

## Почему не «дверь зовёт методы TaskService»

iOS зовёт `TaskCalendarPhone` синхронно (`PhoneCore.swift`: `invokeMethod` и сразу читает результат). Методы `TaskService` асинхронные: даже над хранилищем в памяти результат приходит в микрозадаче, а из JS её не дождаться синхронно. Поэтому общим путём стал синхронный слой под сервисом: `TaskServiceImpl.setStatus` — это `mutate(rules.setStatus(key, status))`, а телефон — `rules.change(text, rules.setStatus(key, "done"))`. Правило одно, отличается только ввод-вывод.

## Форма двери

Имена, аргументы и ответы семи функций прежние:

```ts
reminders(text, settingsJson, nowMs): { id, title, body, kind, date, startMs, dayEndMs }[]
complete(text, settingsJson, id, nowMs) / silence(...) / snooze(text, settingsJson, id, minutes, nowMs): PhoneAction
capture(text, settingsJson, list, title, nowMs): PhoneAction
calendarFiles(settingsJson): string[]
meetings(settingsJson, texts, fromMs, toMs, nowMs): { title, startMs, endMs }[]
// PhoneAction = { changed: true, text } | { changed: false, reason: "stale" }
```

## Что остаётся как было

- Ответы всех семи функций: `tests/phone/answers.test.ts` снят снимком с бандла до рефакторинга (≈2000 вызовов) и не меняется.
- **Захват заголовка из одного приоритета** («p1») по-прежнему пишется: Макс считает это нормальным. Общий `createInPlace` такой заголовок отвергает (`isBlank`), поэтому дверь проверяет только `trim()` и зовёт ту же операцию размещения без этой проверки. Это единственное место, где телефон обходит правило; исправить — значит звать `createInPlace`.
- Тексты на английском («10:00–11:00» в теле напоминания) — как были (S10).
- Поведение плагина, вид, `data.json`, формат файла. `docs/plugin/` не меняется: пользователь ничего нового не видит.

## Страж

Телефон импортирует только `contracts.ts` и `PhoneDoor.ts`. Записи `Phone*Service` из `tests/architecture.test.ts` уходят.
