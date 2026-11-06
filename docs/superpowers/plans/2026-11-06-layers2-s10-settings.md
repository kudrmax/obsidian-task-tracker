# План S10

1. Календари: тест на `accountName`/`name` в `CalendarServiceImpl.known()`, затем поля в `KnownCalendar` и `ShownCalendar`; `SettingsTab.shownGroup` рисует их.
2. Статусы: тесты `CalendarServiceImpl` на `problem`/`events`, `sourceText` на слова; `SourceProblemError` в `EventSource.ts`, бросают `GoogleAuth`, `GoogleCalendarApi`, `GoogleCalendarFeed`, `CalendarFileSource`.
3. `StaleTaskError.code`, уведомление словами view.
4. Напоминания: `TaskReminder.slot` минутами, тело в `PhoneDoor`; снимок двери не меняется, тест на `startMinute`/`endMinute`.
5. Настройки вида: `ui/viewSettings.ts`, `settingsFile.ts`, `PluginSettings` по схеме; `ScreenSettingsImpl` вместо `ViewSettingsImpl`; экран читает два хранилища через `ScreenSettingsView`; вкладка пишет размеры, краску меток и масштаб в хранилище вида. Тест вкладки: файл байт в байт.
6. Мелочи: `colourOf`, имя раздела как набрано.
7. Слить origin/master, `npm test`, `npm run build`, проверка в тестовом Obsidian (настройки: все страницы, календари; окно источников; телефон и десктоп, светлая и тёмная).
