# S10 «Настройки и подписи»

Ревью: `layers-review-2`, пакет S10. Ветка `layers2-s10-settings`.

## Что

1. **Календари в настройках.** `ShownCalendar` получает `accountName` (заголовок, под которым календарь стоит: аккаунт или «iPhone» для календаря, которого не назвал ни один аккаунт) и `name` (название как в файле, без «iPhone · »). `account` и `title` остаются ключом для `setShown`: ключ лежит в `hiddenCalendars` в `data.json`, и у неоднозначного календаря Scriptable он по-прежнему «iPhone · X». `SettingsTab` больше не сравнивает `account === ""` и не режет префикс регуляркой.
2. **Настройки вида — у TS-интерфейса.** `src/ui/viewSettings.ts`: `ViewSettings` (`listShare`, `rightMode`, `zoom`, `zoomLevels`, `cardHeight`, `cardGap`, `labelPaint`), их умолчания, границы (`LIST_WIDTH_*`, `CARD_HEIGHT_*`, `CARD_GAP_MAX`), `LabelPaint`/`LABEL_PAINTS`, текст уровней масштаба, хранилище `ViewSettingsStore` (что экран ставит руками и что вкладка настроек пишет слайдерами). Из `src/settings.ts`, `contracts.ts` и `src/domain/Label.ts` это уходит: общие настройки (их читает и Swift через `settingsJson`) пикселей вида Obsidian не несут. В `contracts.ts` остаётся `ScreenSettings` — то, что экран читает из общих настроек (файл, имена разделов, «без раздела», уровни, метки, `longPressMs`, `scrollToHour`), и `ScreenSettingsStore` только для чтения. `SettingsService` теряет `setCardSize`, `setLabelPaint`, `setZoomLevels` и эти поля формы. Экран читает `ShownSettingsStore` (`ui/viewSettings.ts`): общие настройки экрана и свои как один объект, ставит только свои.
3. **`data.json` прежний.** `src/settingsFile.ts` (корень, связка): файл — это общие настройки и настройки вида в одном объекте, ключи в прежнем порядке, часть устройства (`listShare`, `rightMode`, `zoom`) — в localStorage, как была. `PluginSettings` хранит объект по схеме, которую ему дали, и не знает, чьи в нём ключи. Старый файл читается, после правки пишется байт в байт тем же текстом.
4. **Подписи из application — данными.** `SourceStatus.message` → `problem` (`loggedOut`, `fileMissing`, `noAnswer` с секундами, `failed` с текстом источника) и `events` (сколько событий показано); слова выбирает `ui/sources/sourceText.ts` и они те же. Инфраструктура бросает `SourceProblemError` вместо строк «not logged in»/«file missing» (сообщение ошибки прежнее, его видят уведомления входа). `StaleTaskError` несёт `code: "staleTask"`, уведомление «The task changed in the file; the view was refreshed» пишет интерфейс. `TaskReminder` отдаёт начало и конец слота минутами; тело «10:00–11:00» собирает из них дверь телефона, ответы двери прежние до байта (снимок `tests/phone/answers.test.ts`, новых полей нет).
5. **Мелочи.** Код цвета, совпавший с пресетом в этой теме, — пресет: `SettingsService.colourOf(text, shades)` (оттенки даёт фронтенд). Имя раздела из поля передаётся сервису как набрано: обрезку, «пусто — ничего» и «то же имя — ничего» решает `TaskService` (`toSection`, `renameGroup`); `GroupNameField` больше не режет пробелы.

## Что остаётся как было

Вид, `data.json` и localStorage, ответы двери телефона, слова на экране и в уведомлениях. `docs/plugin/` не меняется.

## Не сделано

- Цели сброса `"left"` → `"day"`: имя колонки «left» живёт в `ui/quick/**` и `BulkController`, их сейчас переписывают S3 и S4+S5. Переименование в контракте без них — это второй словарь и перевод на границе. Оставлено до слияния тех веток.
- Хранение масштаба и перестройка уровней (`TaskCalendarView.zoomLevels/restoreZoom/settleZoom`) остаются во view: это теперь настройки самого TS-интерфейса, Swift их не повторяет.
