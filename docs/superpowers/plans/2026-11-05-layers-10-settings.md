# Блок 10 «Настройки» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** UI видит из настроек только то, что ему нужно, и меняет их командами `application` с проверкой внутри. Экран читает `ViewSettingsStore` (вид, путь файла, имена, уровни) и сам ставит только разделитель, колонку и зум; вкладка настроек — `SettingsService`: каждая команда проверяет своё значение и на плохом ничего не пишет. Секреты Google UI не видит. После блока в `src/ui` нет импортов `settings.ts` и `application/ports.ts`, список `ALLOWED` стража пуст и удалён. Поведение, вид, `data.json` (общая часть и часть устройства в localStorage), Sync, разделитель, переключатель колонок, зум — те же.

**Architecture:** `settings.ts` делит тип на `FileFormatSettings & ViewSettings & SourceSettings` (форма `data.json` та же). `contracts.ts` отдаёт UI типы вида (`RightMode`, `Zoom`, `ZoomLevel`, `SectionNames`, `ViewSettings`, `ScreenSettings`), границы (`LIST_WIDTH_*`, `CARD_*`), `Clock`, `sameLevels` и два интерфейса: `ViewSettingsStore` и `SettingsService`. Реализации — `application/ViewSettingsImpl.ts` и `application/SettingsServiceImpl.ts` поверх порта `SettingsStore` (он остаётся портом `application`, `PluginSettings` не меняется). Корень (`main.ts`, `demo.ts`) их строит.

**Tech Stack:** TypeScript, vitest + happy-dom, esbuild, Obsidian (тестовый, CDP).

**Spec:** `docs/superpowers/specs/2026-11-05-layers-10-settings-design.md`, обзор `2026-11-05-layers-overview.md`, что делает каждое поле — `docs/plugin/settings.md`.

## Что в спеке уже не так (сверено с master fd85ae8, после блока 9 и 0.4.114–0.4.117)

- **Полей больше, чем в спеке.** С тех пор появились `repeatMarker` (Repeat marker), высота карточки и зазор (`cardHeight`, `cardGap`, ползунки), перетаскивание заготовок (`move`), любой цвет уровня (кружок с системным выбором и поле кода, 0.4.114). Все они — команды `SettingsService`; `repeatMarker` — в `FileFormatSettings`.
- **`ViewSettingsStore.get()` нужны ещё уровни.** `settingsEffect` перерисовывает экран, когда меняются уровни приоритета (полоса быстрого ввода). Поэтому `get()` отдаёт `ScreenSettings` = `ViewSettings` + `tasksFile`, `sections`, `ungrouped`, `priorities`. Остальное (маркеры, заготовки, `dayStartHour`, источники) экран не читает: их смену видят сервисы (`readsAnew`, `DayService`).
- **`set` — только то, что экран ставит руками.** Вид пишет три поля устройства: `listShare`, `rightMode`, `zoom`. `set(patch: Partial<ScreenState>)`, где `ScreenState` — эти три, а не весь `Partial<ViewSettings>`: высота карточки и прочее ставятся только во вкладке.
- **Поле Client secret показывает сохранённый секрет** (поле `password`, точки по длине). Если UI не видит секрет, заполнить поле нечем — без потери поведения нельзя ни скрыть значение, ни подставить маску (правка маски записала бы мусор). Поэтому секрет не читается, а привязывается: `SettingsService.bindClientSecret(field: SecretField)` — сервис сам кладёт сохранённое значение в поле и пишет то, что набрано. В контрактах нет ни геттера секрета, ни `refreshToken`; `SettingsForm` отдаёт из Google только `clientId` и `refreshSeconds`.
- **Цвет по коду остаётся в UI.** `colorOf` сводит код к готовому цвету, если он равен его оттенку *в этой теме* (`inkOf`, `priorityColors.ts` — дизайн). Проверка кода — `hexColor` домена, уже из контрактов. Сервис получает готовый `PriorityColor`; «код не тот же, что был — перекрасить» и откат поля — поведение поля, остаётся во вкладке.
- **Текст полей — у сервиса.** Разбор уровней зума и списка календарей через запятую — правила сервиса, поэтому и их текст для поля (`formatZoomLevels`, `join(", ")`) отдаёт сервис (`SettingsForm.zoomLevels`, `SettingsForm.workCalendars`). `ui/zoomLevelsText.ts` уходит в `application/zoomLevelsText.ts` с тестами.
- **Час начала дня.** Список часов и их подписи — вид; `Number(value)` выбранного пункта — тоже вид. Команда `setDayStartHour(hour)` пишет как сейчас.
- **`openInObsidian`, `ObsidianMarkdown`, `MarkdownTitleField`** берут путь из `ViewSettingsStore.get().tasksFile`, как в спеке.
- **`cardSize.ts`** берёт размер по умолчанию из `DEFAULT_SETTINGS` — в контракты уходит `DEFAULT_CARD_SIZE`.
- **`settingsEffect` остаётся в UI** (что смена просит у экрана), сравнивает `ScreenSettings`. Его тест строит их из полных настроек функцией `screenSettingsOf` (application), ожидания те же, в том числе «ничего для маркеров, заготовок и часа начала дня».

## Global Constraints

- Рефакторинг: ни вида, ни записи в файл, ни `data.json`, ни поведения не меняется. Каждое поле принимает и отвергает то же и пишет в тот же момент (синхронно в обработчике, тем же патчем от настроек этого момента). `docs/plugin/` не меняется.
- Сначала характеризующие тесты против текущего кода: настоящая вкладка (`TaskCalendarSettingsTab`) над поддельным модулем `obsidian` (`tests/fakes/obsidian.ts`, алиас в `vitest.config.mts`: у пакета `obsidian` нет кода, вкладку иначе не загрузить) и настоящим `PluginSettings` над поддельным хранилищем; проверяется `data.json` байт в байт и localStorage после каждого действия. Потом перенос; ожидания не меняются, меняется только сборка вкладки в тесте.
- Перенос правила = перенос его тестов: `tests/ui/priorityLevels.test.ts`, `presetEdits.test.ts`, `zoomLevelsText.test.ts` → `tests/application/SettingsServiceImpl.test.ts`, `zoomLevelsText.test.ts`.
- Контракты только добавляют: типы и константы выше, `ScreenSettings`, `ScreenState`, `ViewSettingsStore`, `SettingsForm`, `SecretField`, `SettingsService`, `Clock`, `sameLevels`, `DEFAULT_CARD_SIZE`. `PluginSettings` и порт `SettingsStore` не меняются.
- `ALLOWED` в страже — ровно оставшиеся нарушения; в конце пуст и удалён, проверка «ни одного нарушения» остаётся.
- Стиль соседнего кода: табы, короткие английские doc-комментарии.
- `npm test`, `npm run build:demo`, `npm run build` (последней) зелёные; `phone/task-calendar-phone.js` — только если его требуют `tests/phone`.

---

### Task 1: Характеризующие тесты вкладки и `data.json`

**Files:**
- Create: `tests/fakes/obsidian.ts`, `tests/ui/SettingsTab.test.ts`
- Modify: `vitest.config.mts`

- [x] Поддельный `obsidian`: `Setting` (имя, описание, заголовок; `addText`, `addSlider`, `addDropdown`, `addButton`, `addToggle`), `TextComponent` (`input` → `onChange`), `ExtraButtonComponent`, `PluginSettingTab`, `Plugin`, `Notice`; методы Obsidian на `HTMLElement` (`createDiv`, `createEl`, `empty`, `addClass`, `toggleClass`, `hasClass`).
- [x] Вкладка над `PluginSettings`; каждое поле: верное значение — что в `data.json` (строкой, байт в байт) и что в localStorage; неверное — ничего не записано. Поля: File path; пять разделов (пустое имя пишется как есть); пять маркеров; уровни — переименование (обрезка, без перерисовки), добавление (`p<n>`, первый свободный цвет), удаление, цвет кружком, кодом (верный, неверный, готовый оттенок темы → готовый цвет), выбор цвета; заготовки — переименование (обрезка), добавление пустой, удаление, перестановка; No section (пусто/пробелы → `No section`); высота и зазор; Long press delay, Scroll to hour, Stale after, Refresh interval (`""`, `" "`, `-1`, `abc`, `Infinity` — ничего; `0`, `" 12 "` — пишется); Day starts at; Zoom levels (верный, старый с шагом, неверный, `0`); Client id; Client secret (поле показывает сохранённый, набранное пишется, `refreshToken` остаётся); Work calendar File path и Calendars (запятые, пробелы, пустые).
- [x] Запись в тот же момент: `get()` видит значение сразу после события поля.
- [x] `npm test` — PASS. Commit.

### Task 2: Типы настроек разделены, UI берёт типы вида из контрактов

**Files:**
- Modify: `src/settings.ts`, `src/application/contracts.ts`, `src/ui/ColumnSwitch.ts`, `src/ui/screens.ts`, `src/ui/quick/QuickEntryController.ts`, `src/ui/listWidth.ts`, `src/ui/cardSize.ts`, `src/ui/zoomLevels.ts`, тесты UI на эти типы, `tests/architecture.test.ts`

```ts
// settings.ts — форма data.json та же
export interface FileFormatSettings { tasksFile; sections; dueDateMarker; slotMarker; alarmSlotMarker; silentSlotMarker; repeatMarker; priorities; groups; dayStartHour }
export interface ViewSettings { listShare; rightMode; zoom; zoomLevels; cardHeight; cardGap; longPressMs; scrollToHour }
export interface SourceSettings { workCalendarFile; workCalendarTitles; google; staleAfterMinutes }
export type TaskCalendarSettings = FileFormatSettings & ViewSettings & SourceSettings;
// contracts.ts
export type { RightMode, SectionNames, ViewSettings, Zoom, ZoomLevel } from "../settings";
export { CARD_GAP_MAX, CARD_HEIGHT_MAX, CARD_HEIGHT_MIN, LIST_WIDTH_MAX, LIST_WIDTH_MIN, sameLevels } from "../settings";
export const DEFAULT_CARD_SIZE: { readonly height: number; readonly gap: number };
export type { Clock } from "./ports";
```

- [x] Вычеркнуть из `ALLOWED` строки `ColumnSwitch`, `screens`, `QuickEntryController`, `listWidth`, `cardSize`, `zoomLevels`.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 3: Экран читает `ViewSettingsStore`

**Files:**
- Create: `src/application/ViewSettingsImpl.ts`, `tests/application/ViewSettingsImpl.test.ts`
- Modify: `src/application/contracts.ts`, `src/ui/TaskCalendarView.ts`, `src/ui/settingsEffect.ts`, `tests/ui/settingsEffect.test.ts`, `src/main.ts`, `src/demo.ts`, `tests/architecture.test.ts`

```ts
// contracts.ts
/** What the screen reads of the settings: its own, and the names, the path and the levels it draws. */
export interface ScreenSettings extends ViewSettings { readonly tasksFile: string; readonly sections: SectionNames; readonly ungrouped: string; readonly priorities: readonly PriorityLevel[] }
/** What the screen sets by hand, on this device only: the divider, the column shown, the zoom. */
export type ScreenState = Pick<ViewSettings, "listShare" | "rightMode" | "zoom">;
export interface ViewSettingsStore { get(): ScreenSettings; set(patch: Partial<ScreenState>): Promise<void>; onChange(listener: () => void): () => void }
// application/ViewSettingsImpl.ts
export function screenSettingsOf(settings: TaskCalendarSettings): ScreenSettings;
export class ViewSettingsImpl implements ViewSettingsStore { /* get() — тот же объект, пока настройки те же */ }
```

- [x] Тест: `get()` — поля экрана, без источников и секретов; тот же объект, пока стор отдаёт тот же; `set` — тот же патч в стор (поля устройства в localStorage, `data.json` не тронут); `onChange` — стора.
- [x] Вид: `ViewDeps.settings: ViewSettingsStore`, `Clock` из контрактов; `update` → `set`; `groups.ungrouped` → `ungrouped`. `settingsEffect` над `ScreenSettings`, его тест — через `screenSettingsOf`, ожидания те же.
- [x] Корень: `main.ts` и `demo.ts` дают виду `new ViewSettingsImpl(this)`.
- [x] Вычеркнуть `TaskCalendarView → ports.ts`, `TaskCalendarView → settings.ts`, `settingsEffect → settings.ts`.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 4: Вкладка работает через `SettingsService`

**Files:**
- Create: `src/application/SettingsServiceImpl.ts`, `src/application/zoomLevelsText.ts`, `tests/application/SettingsServiceImpl.test.ts`, `tests/application/zoomLevelsText.test.ts`
- Modify: `src/application/contracts.ts`, `src/ui/SettingsTab.ts`, `src/main.ts`, `tests/ui/SettingsTab.test.ts` (только сборка вкладки), `tests/architecture.test.ts`
- Delete (`trash`): `src/ui/priorityLevels.ts`, `src/ui/presetEdits.ts`, `src/ui/zoomLevelsText.ts`, их тесты в `tests/ui`

```ts
// contracts.ts
export type Marker = "dueDateMarker" | "slotMarker" | "alarmSlotMarker" | "silentSlotMarker" | "repeatMarker";
export type CountField = "longPressMs" | "scrollToHour" | "staleAfterMinutes" | "refreshSeconds";
export type CardField = "cardHeight" | "cardGap";
/** The settings tab's fields as it shows them: no secret of Google's among them. */
export interface SettingsForm { tasksFile; sections; markers: Record<Marker, string>; priorities; presets; ungrouped; cardHeight; cardGap; longPressMs; dayStartHour; scrollToHour; zoomLevels: string; staleAfterMinutes; googleClientId; refreshSeconds; workCalendarFile; workCalendars: string }
/** A field the service fills with a secret and reads typed text from: the UI never asks for the secret. */
export interface SecretField { setValue(value: string): void; onChange(listener: (value: string) => void): void }
/** The settings tab's commands: each checks its value and writes nothing on a bad one. */
export interface SettingsService {
	form(): SettingsForm;
	setTasksFile(path: string): Promise<void>;
	setSection(key: keyof SectionNames, name: string): Promise<void>;
	setMarker(marker: Marker, text: string): Promise<void>;
	setCount(field: CountField, text: string): Promise<void>;
	setCardSize(field: CardField, px: number): Promise<void>;
	setDayStartHour(hour: number): Promise<void>;
	setZoomLevels(text: string): Promise<void>;
	renameLevel(index: number, prefix: string): Promise<void>;
	recolourLevel(index: number, color: PriorityColor): Promise<void>;
	removeLevel(index: number): Promise<void>;
	addLevel(): Promise<void>;
	renamePreset(index: number, name: string): Promise<void>;
	removePreset(index: number): Promise<void>;
	addPreset(): Promise<void>;
	movePreset(from: number, to: number): Promise<void>;
	setUngrouped(name: string): Promise<void>;
	setGoogleClientId(id: string): Promise<void>;
	bindClientSecret(field: SecretField): void;
	setWorkCalendarFile(path: string): Promise<void>;
	setWorkCalendars(text: string): Promise<void>;
}
```

- [x] `SettingsServiceImpl` над `SettingsStore`: правила `LevelEdits`, `PresetEdits`, число ≥ 0, пустое No section → умолчание, разбор уровней зума и календарей; каждая правка — от настроек этого момента, вложенные объекты (`sections`, `groups`, `google`) — целиком с новым полем, как сейчас.
- [x] Тесты правил переезжают из `tests/ui` в `tests/application`, те же ожидания; плюс по команде: что пишется и что отвергается.
- [x] Вкладка: `SettingsTabDeps.settings: SettingsService`; читает `form()`, пишет командами; после добавления, удаления, перекраски уровня и правки заготовок (кроме переименования) — перерисовка, как сейчас. Client secret — `bindClientSecret`.
- [x] Характеризующий тест задачи 1 — без изменений ожиданий.
- [x] Вычеркнуть `SettingsTab → ports.ts`, `SettingsTab → settings.ts`: `ALLOWED` пуст — удалить его и тест «список только сокращается»; «ни одного нарушения» остаётся.
- [x] `npm test`, `npx tsc --noEmit` — PASS. Commit.

### Task 5: Сборки, проверка в тестовом Obsidian, ход работы

- [x] `grep -rn "settings\"\|ports\"" src/ui` — пусто; `clientSecret`/`refreshToken` в `src/ui` — нет.
- [x] `npm test`, `npm run build:demo`, `npm run build` — PASS.
- [x] Тестовый Obsidian (порт 9473, профиль `profile-4`, свой vault): `data.json` плагина сохранён; сборка ветки, перезагрузка, `setBackgroundThrottling(false)`. Mac и телефон (390×844, `app.emulateMobile(true)`), светлая и тёмная: вкладка настроек, снимок каждого раздела; правка каждого вида поля (текст, число с неверным значением, пустое имя раздела → умолчание, уровень: добавить/переименовать/перекрасить/удалить, заготовка, уровни зума верные и неверные, час начала дня) — `data.json` и localStorage сравнены с тем, что пишет сборка master при тех же действиях. На экране: разделитель, переключатель колонок, зум — держатся после перезагрузки плагина. `data.json` и файл задач восстановлены.
- [x] Строка 10 в «Ход работы» обзора, статус обзора. Commit.
