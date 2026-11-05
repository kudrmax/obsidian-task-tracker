# Блок 9 «Меню и границы слота»

Обзор: `2026-11-05-layers-overview.md`. Пакеты ревью P8 и P9.

## Цель

Правила статусов, напоминаний, описания и границ слота — в домене; меню и таймлайн берут их через контракты и держат только подписи и жесты.

## Где сейчас и что сделать

| Где | Правило | Куда |
|-----|---------|------|
| `menu/TaskMenu.ts` (`nextStatus`, `progressTile`), `menu/BulkMenu.ts` | «Stop progress» возвращает в todo; для группы — только если все в работе | `contracts.nextProgress(statuses: readonly TaskStatus[]): TaskStatus` (чистая функция домена) |
| `menu/TaskMenu.ts` `REMINDER_ORDER`, `nextReminder` | порядок видов напоминания | `contracts.REMINDER_KINDS`, `nextReminder(kind)` из домена; подписи остаются в UI |
| `menu/TaskMenu.ts` строка Reminder | напоминание есть только у задачи со слотом | `TaskItem.reminder: ReminderKind \| null` нельзя (сломает существующих читателей) → `TaskItem.can.remind: boolean` |
| `sheet/DescriptionSheet.ts` `FIRST_POINT`, `keptDescription` | описание начинается с `- `; одинокий `-` = нет описания | `contracts.DESCRIPTION_TEMPLATE`; `setDescription` в сервисе сам считает одинокий маркер пустым; UI шлёт текст как есть |
| `menu/TaskMenu.ts` `plainText(item.text)` | чистый заголовок без разметки | `TaskItem.title` |
| `TaskTitle.ts` `textParts` | разбор ссылок в тексте | остаётся реэкспортом контрактов (нужен и для незаписанного текста) — уже сделано в блоке 1 |
| `drag/TimelineDrop.ts`, `drag/DragController.ts` | слот не выходит за конец дня; минимальная длина | `contracts.clampSlot(start, end, minMinutes)` из домена |
| `timelineLayout.ts` `stretchedSpan` | растянутый не выше карточки теряет длительность | порог в пикселях — жест, остаётся; «нет длительности» записывается через `clampSlot` |
| `Timeline.ts` обрезка событий по краям дня | длина дня | `DayBoundary.clipToDay(day, start, end)` |
| `LAYOUT.minutesPerDay`, `DESIGN.dayHours` vs `DAY_MINUTES` в домене | длина дня записана дважды | UI берёт `MINUTES_PER_DAY` из контрактов; `DESIGN`/CSS-токены, которые от него зависят, остаются (тест `styles.test.ts` сверяет `DESIGN` с CSS) |

`sheet/DescriptionSheet` — проверить в плане, нужен ли `DESCRIPTION_TEMPLATE` UI (он ставит курсор после маркера) — если да, константа контрактов.

## Не меняется

Меню задачи и групповое меню (те же строки, те же переключения), лист описания, перетаскивание и растягивание на таймлайне, обрезка событий.

## Готово, когда

- В меню нет констант статусов и видов напоминаний, только подписи; `keptDescription` удалён.
- Длина дня в коде один раз (домен), UI берёт из контрактов.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian: In progress / Stop progress одной и группой, Reminder, описание (создать, очистить), растягивание блока до края дня.
