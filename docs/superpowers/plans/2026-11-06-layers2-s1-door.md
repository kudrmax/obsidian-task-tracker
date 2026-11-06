# S1 «Один вход для двух фронтендов» — план

**Spec:** `docs/superpowers/specs/2026-11-06-layers2-s1-door-design.md`.

**Global constraints:** чистый рефакторинг; ответы `TaskCalendarPhone` неизменны (снимок `tests/phone/answers.test.ts` снят до правок); тесты переезжают вместе с правилом, ожидания не ослабляются; удаление — только `trash`.

- [x] 1. Снимок ответов семи функций с бандла master (`tests/phone/answers.test.ts`), коммит до правок.
- [x] 2. `documentText`: `readingKey(settings)`, тип `Operation` с настройками; `readsAnew` через `readingKey` + файл + цвета.
- [x] 3. `TaskRules`: чтение (`moment`, `read`, `change`, `changeAsRead`), поиск (`entryOf`, `groupOf`, `resolve`), операции всех действий. `TaskServiceImpl` — оболочка: `mutate(rules.x(...))`. Тесты `TaskServiceImpl` без правок.
- [x] 4. `TaskReminders` над `TaskRules`: `ringing(text)`, `act(text, id, action)`; тесты из `PhoneReminderService.test.ts` переезжают сюда.
- [x] 5. `ShownCalendars`: `known()`, `hidden()`, `days()`; `CalendarServiceImpl` через него. `CALENDAR_SOURCES` и `calendarPath` в `calendarFile.ts`.
- [x] 6. `composeCore(ports)`; `compose.ts` — порты Obsidian + `composeCore`.
- [x] 7. `PhoneDoor` (семь функций, провод), `src/phone/main.ts` только присваивает; `Phone*Service` и их тесты — в корзину, тесты правил — в `PhoneDoor.test.ts`. Страж: телефон видит `contracts.ts` и `PhoneDoor.ts`.
- [x] 8. `node phone/build.mjs`; `npm test`, `npm run build` без фильтров; снимок не изменился.
- [x] 9. Бандл временно в `../task-calendar-ios/plugin/phone/`, `swift test --package-path Core`, вернуть файл `git checkout`.
- [x] 10. `git merge origin/master`, полный прогон, коммит.
