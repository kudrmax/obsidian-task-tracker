# Блок 10 «Настройки»

Обзор: `2026-11-05-layers-overview.md`. Пакеты ревью: P1 (настройки), P10 (вкладка настроек, открытие файла).

## Цель

UI видит из настроек только то, что ему нужно, и меняет их через команды сервиса с проверкой внутри. Секреты Google UI не видит. После блока страж слоёв не держит ни одной строки.

## Где сейчас

- `settings.ts`: `TaskCalendarSettings` смешивает формат файла (секции, маркеры, приоритеты, пресеты, `dayStartHour`), состояние вида (`listShare`, `rightMode`, `zoom`, `zoomLevels`, `cardHeight`, `cardGap`, `longPressMs`, `scrollToHour`, `LIST_WIDTH_*`, `CARD_*`) и источники (`workCalendarFile`, `workCalendarTitles`, `google` с `clientSecret`/`refreshToken`, `staleAfterMinutes`).
- UI получает `SettingsStore` (`application/ports.ts`) целиком и пишет сырые патчи.
- `ui/SettingsTab.ts`: сама проверяет и нормализует значения (пустое имя → умолчание, число ≥ 0, разбор списка календарей через запятую, уровни зума).
- `ui/priorityLevels.ts`, `ui/presetEdits.ts`: правила правки уровней (имя `p<n>`, первый свободный цвет) и пресетов (обрезка).
- `ui/TaskCalendarView.ts` `openInObsidian`, `ObsidianMarkdown`, `MarkdownTitleField`: путь файла задач из настроек.
- Импорты `RightMode`, `ZoomLevel`, `DEFAULT_SETTINGS`, `LIST_WIDTH_*`, `sameLevels` из `settings.ts` в UI.

## Что сделать

```ts
// settings.ts — форма data.json та же; типы разделены
export interface FileFormatSettings { tasksFile; sections; dueDateMarker; slotMarker; alarmSlotMarker; silentSlotMarker; priorities; groups; dayStartHour }
export interface ViewSettings { listShare; rightMode; zoom; zoomLevels; cardHeight; cardGap; longPressMs; scrollToHour }
export interface SourceSettings { workCalendarFile; workCalendarTitles; google; staleAfterMinutes }
export type TaskCalendarSettings = FileFormatSettings & ViewSettings & SourceSettings;

// contracts.ts
export type { RightMode, ZoomLevel, Zoom, SectionNames, ViewSettings };
export { LIST_WIDTH_MIN, LIST_WIDTH_MAX, CARD_HEIGHT_MIN, CARD_HEIGHT_MAX, CARD_GAP_MAX };
/** What the screen reads of the settings and what it sets by hand. */
export interface ViewSettingsStore {
  get(): ViewSettings & { readonly tasksFile: string; readonly sections: SectionNames; readonly ungrouped: string };
  set(patch: Partial<ViewSettings>): Promise<void>;
  onChange(listener: () => void): () => void;
}
/** The settings tab's commands: each checks its value and writes nothing on a bad one. */
export interface SettingsService { … }   // по полям вкладки: setTasksFile, setSection, setMarker, levels (add/rename/recolor/remove), presets, setUngrouped, setDayStartHour, setZoomLevels(text), setRefreshSeconds, setWorkCalendar, …
```

- Вкладка настроек и вид работают через `SettingsService`/`ViewSettingsStore`; `SettingsStore` с сырыми патчами остаётся портом `application`.
- Правила `priorityLevels.ts`/`presetEdits.ts` и проверки вкладки — в `application/SettingsServiceImpl.ts`, тесты туда же.
- Открыть задачу в Obsidian: `TaskService.lineOf` уже есть; путь берётся из `ViewSettingsStore.get().tasksFile` — это допустимо для вида в Obsidian (адаптер платформы).
- `PluginSettings` (инфраструктура) и формат `data.json` (общая и устройственная части) не меняются.

## Не меняется

Каждое поле вкладки настроек ведёт себя как сейчас (что принимает, что отвергает, когда пишет), `data.json` байт в байт тот же при тех же действиях, Sync, состояние устройства.

## Готово, когда

- В `src/ui` нет импортов `settings.ts` и `application/ports.ts`; UI не видит `google.clientSecret`/`refreshToken`.
- Страж слоёв: список `ALLOWED` пуст и удалён.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian: каждое поле вкладки (правка, неверное значение), перетаскивание разделителя, переключатель колонок, зум.
