# Блок 5 «Настройки и календари» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** переключение колонок, разделитель и зум — ноль чтений и записей `data.json`; своя запись настроек — один вызов слушателей; ввод в поле настроек — одна запись на поле; смена дня — один запрос окна «вчера…завтра» на источник, свайп на соседний день в пределах `refreshSeconds` — ноль запросов; список календарей Google — раз в 30 минут, а не на каждый запрос; фоновая вкладка календаря — ноль запросов; события после 250-го не теряются; кеш событий в localStorage пишется, только когда что-то поменялось.

**Architecture:** логика настроек уходит из `main.ts` в `PluginSettings` (infrastructure; `main.ts` — тонкий фасад, сам по-прежнему `SettingsStore`): локальный патч не трогает файл, общий — через очередь записей с «оптимистичным» `get()`, перечитка файла молчит, если ничего не изменилось. Текстовые поля настроек сохраняются через `SettingsCommits` (ui, без импорта `obsidian`): blur, Enter, нажатие в другом месте страницы, закрытие вкладки, уход приложения в фон. Google и токен получают HTTP через порт `Http` (тестируемо без `obsidian`). Календарь: новый метод контракта `CalendarService.eventsAround(date)` (единственное изменение `contracts.ts`, отдельная задача) — окно ±1 день и «свежесть» по источнику; `eventsOn` остаётся «всегда заново» для опроса, Refresh now и `onChange`. `CalendarPolling` знает «на экране ли вид» и ограничивает обновление по фокусу.

**Tech Stack:** TypeScript, vitest + happy-dom, Obsidian API.

**Spec:** `docs/superpowers/specs/2026-11-03-perf-5-settings-calendars-design.md`

## Что в спеке уже не так (сверено с master 114cbe2)

- **Пп. 1, 2, 4 верны** (`main.ts:91-102` — `update` всегда `loadData`; `:69-75` + `:82-85` — эхо `raw` → `loadData` + `emit`; `:70` берёт `this.manifest.dir` без запасного пути `:63`). Но **цена эха после блока 2 меньше**: `settingsEffect` (`src/ui/settingsEffect.ts:17-30`, `TaskCalendarView.ts:483-497`) на равные настройки ничего не перерисовывает. Остаётся `loadData`, `showCardSize` и — новое, в спеке нет — `WorkCalendarExportScript.keepInstalled` (`WorkCalendarExportScript.ts:32-35, 43-46`): **на каждый `emit`**, в том числе от переключения колонки (`TaskCalendarView.ts:641`), разделителя (`:303`) и зума (`:726`), он делает `exists` + `read` файла экспорта. Добавлено в план: переустановка только при смене `workCalendarFile`.
- **Эхо распознаётся не по «запомненному записанному содержимому», а сравнением с `get()`**: перечитанный файл + ещё не записанные патчи + состояние устройства равны текущим настройкам → тишина. Это покрывает и своё эхо, и одинаковый файл от Sync, и не требует хранить историю записей при нескольких записях подряд.
- **Гонка, которую создаёт сохранение по blur** (в спеке нет): blur поля префикса приоритета и тут же клик по цвету — `LevelEdits.recolour` читает `current()` (`priorityLevels.ts:31-33`) раньше, чем `update` дошёл до `this.current` (`main.ts:95-100` — после `await loadData`), и затирает новый префикс. То же для «Client id» → «Log in» (`GoogleAuth.login` читает настройки сразу, `GoogleAuth.ts:26`). Поэтому `update` сразу кладёт патч в `get()`, а записи в файл идут по очереди (сейчас два одновременных общих `update` могут потерять один из патчей).
- **П. 3, полный список полей** (`SettingsTab.ts`): `text()` — путь файла задач `:61`, пять названий секций `:63`, маркеры `:67-68`, «No section» `:114`, Client id `:189`, путь рабочего файла `:250`, названия рабочих календарей `:251`; `number()` — `longPressMs` `:165`, `scrollToHour` `:173`, `staleAfterMinutes` `:187`, `refreshSeconds` `:197`; префикс приоритета `:78`; имя пресета `:107`; уровни зума `:177`; Client secret `:194`. Не трогаем: ползунки `:159-160`, выпадающий список `:171`, переключатели `:231`, кнопки. Цена сейчас хуже, чем в спеке: каждая буква пути файла задач перечитывает задачи с несуществующего файла, каждая буква пути рабочего файла переписывает скрипт экспорта.
- **Задержка 500 мс не нужна ни одному полю**: страница настроек закрывает экран на обеих платформах, на самой странице ничто не читает значение поля до нажатия кнопки, а нажатие сохраняет поле раньше (см. Task 2). Вместо задержки — сохранение по нажатию в любом другом месте страницы (на iOS кнопка не забирает фокус, blur может не прийти) и при уходе приложения в фон.
- **Пп. 5, 8, 11 верны** (`GoogleCalendarSource.ts:46-51`, `:69`; `GoogleAuth.ts:37-45`). Добавлено: удалённый календарь отвечает 404 — при кеше списка источник падал бы до 30 минут; любая ошибка запроса событий сбрасывает кеш списка. Кеш списка привязан к `refreshToken` + `clientId`: вход, выход и токен от Sync меняют ключ — подписка на настройки не нужна.
- **П. 6 верен** (`CalendarServiceImpl.ts:82-92`), но **«`eventsOn` запрашивает окно» противоречит «минутный опрос — только показанный день»**: опрос, Refresh now и `onChange` идут через тот же `DayData.calendars()` → `eventsOn` (`DayData.ts:42, 89-91`; `TaskCalendarView.ts:164, 397, 880-882`), а контракт обещает «Fetches both sources afresh» (`contracts.ts:298-299`). Различить «открылся день» и «обнови» без контракта нельзя (UI не знает, когда источник отвечал, а `updatedAt` рабочего файла — время экспорта). Поэтому — отдельный метод `eventsAround` (Task 7). Им же пользуются открытие вида (`DayData.load`) и подглядывание соседнего дня при свайпе — `DayPeek.ts:78-83` сейчас шлёт сетевой запрос за некешированным днём прямо во время жеста (в спеке нет).
- **«Свежесть» — только у источников без `onChange`** (Google). Рабочий файл сам сообщает об изменениях, а его чтение после Task 6 — один `stat`; считать его «свежим» значило бы показать на соседнем дне устаревшие рабочие события, если файл пришёл, пока вид был закрыт. Свежесть помнит ключ настроек, влияющих на ответ (`google.clientId`, `google.refreshToken`, `google.calendarIds`, `dayStartHour`); ответ, пришедший после смены этих настроек, свежим не считается.
- **П. 7 верен** (`CalendarPolling.ts:43-47`, `TaskCalendarView.ts:166, 400-404, 420-422`, `DayData.ts:77-81`). Уточнение: минутный тик уже проверяет `contentEl.isShown()` (`TaskCalendarView.ts:430`), опрос — нет. После блока 2 опрос с теми же событиями не перерисовывает (`DayData.ts:120-134`) — фоновая вкладка стоит сеть и запись кеша, не кадры. Вернувшаяся на экран вкладка, пропустившая опрос, запрашивает сразу (раньше её «лечил» непрерывный опрос).
- **П. 9 в лоб не работает**: статус Google получает `updatedAt: new Date()` на каждом запросе (`GoogleCalendarSource.ts:51`), сравнение «по содержимому» никогда не совпадёт. Правило: писать, если изменились события или статусы без учёта `updatedAt`, либо `updatedAt` какого-то источника ушёл вперёд больше чем на 10 минут от записанного. В памяти день всегда свежий; после перезапуска время обновления в кеше старше правды не больше чем на 10 минут, до первого ответа (≈1 с).
- **П. 10 адаптирован**: вместо сброса по `onChange` (подписка есть, только пока открыт вид; изменения файла, пропущенные хранилищем, оставили бы кеш навсегда) — проверка по `adapter.stat` (`mtime` + `size`): один `stat` вместо `exists` + `read` + `JSON.parse`, сам себя лечит.
- **П. 12 верен**: `keepInstalled` в `createDeps` (`main.ts:34`), чтение кеша событий в конструкторе `CalendarServiceImpl` (`:78-80`), оба на `onload`. Кеш событий читается лениво при первом обращении (это и есть «при первом открытии вида»); экспорт — в `onLayoutReady`. `LOADER_PATH` (`WorkCalendarExportScript.ts:11`) не трогаем.

## Global Constraints

- Вид настроек, экран, тексты статусов, интервал опроса по умолчанию, формат `data.json` и кеша событий не меняются (обзор, «Общие правила»).
- `src/settings.ts` и `src/application/ports.ts` не меняются. `src/application/contracts.ts` меняется **только в Task 7**: один метод `eventsAround`.
- Ничего, что раньше «лечилось» лишним действием, не остаётся устаревшим: файл от Sync применяется (событие `raw` и выход приложения на передний план); введённое значение не теряется при закрытии настроек, уходе в фон, выгрузке плагина и нажатии кнопки без blur; токен и список календарей от другого устройства подхватываются по ключу; соседний день не берётся из кеша после смены календарей, часа начала дня или неудачного ответа.
- Тесты — счётчики вызовов (`loadData`, `saveData`, слушатели, HTTP-запросы, `read`/`stat`, `cache.writes`/`reads`) и фальшивые часы/таймеры, без реального времени.
- Модули, импортирующие `obsidian` во время выполнения, в тестах не грузятся (пакет — только типы): тестируемое выносится в классы без этого импорта.
- Стиль кода как в соседних файлах; комментарии короткие, английские, только где нужны.
- `npm test`, `npm run build`.

## Review Focus

1. `PluginSettings`: Sync приносит `data.json`, пока своя запись в очереди или в полёте — перечитка стоит в той же очереди, итог = файл ∪ незаписанные патчи ∪ устройство; упавшая запись убирает свой патч из `get()` и отклоняет `update`.
2. Поле настроек на iOS: нажатие кнопки/цвета/переключателя без blur сохраняет поле **до** обработчика нажатия (`pointerdown` capture); `display()` после правки уровня не теряет набранное в другом поле.
3. `eventsAround`: соседний день из кеша только для Google, только после успешного ответа, только при тех же ключевых настройках, только моложе `refreshSeconds`; `refreshSeconds = 0` — свежести нет. Соседний день сохраняется, только если на него ответили все источники.
4. Смена дня во время запроса окна, опрос во время открытия дня — `Reload` дотягивает последний запрос, флаг «окно» берётся в момент старта запроса.
5. Фоновая вкладка: пропущенный опрос догоняется при возвращении (смена активного листа, `onResize`); календарь в сплите рядом с заметкой опрашивается.
6. Кеш списка календарей: 404/ошибка, выход и вход, токен от Sync; два одновременных запроса — один запрос списка.
7. `GoogleAuth`: обновление токена, пережившее выход/смену токена, не сохраняется.
8. Скрипт экспорта переустанавливается при загрузке и смене пути, а не на каждое изменение настроек.

---

### Task 1: `PluginSettings` — локальное без файла, общее по очереди, эхо молчит

**Files:**
- Create: `src/infrastructure/PluginSettings.ts`
- Modify: `src/main.ts`
- Test: `tests/infrastructure/PluginSettings.test.ts`

**Interfaces:**
- ```ts
  export interface SettingsPersistence {
      loadData(): Promise<unknown>;
      saveData(data: unknown): Promise<void>;
      loadLocalStorage(key: string): unknown;
      saveLocalStorage(key: string, data: unknown): void;
  }
  export class PluginSettings implements SettingsStore {
      constructor(host: SettingsPersistence, file: string)
      /** The vault path of data.json: a `raw` event for it means the file may have changed. */
      owns(path: string): boolean
      /** The first read, at load: always tells the listeners. */
      load(): Promise<void>
      /** The file read afresh (Sync, coming back to the front): tells the listeners only when get() changed. */
      reload(): Promise<void>
      get(): TaskCalendarSettings
      update(patch: Partial<TaskCalendarSettings>): Promise<void>
      onChange(listener: () => void): () => void
  }
  ```
  `DEVICE_STATE_KEY = "task-calendar:device"` переезжает сюда.
- Состояние: `file: TaskCalendarSettings` (последний прочитанный/записанный файл), `pending: Partial<SharedSettings>[]` (патчи в очереди), `queue: Promise<void>`, `current`.
- `get()` = `{ ...settingsFrom({ ...file, ...merge(pending) }), ...deviceState() }`, кешируется в `current` и пересчитывается при каждом изменении `file`/`pending`/устройства.
- `update(patch)`: `partition(patch)`; локальная часть → `saveLocalStorage` сразу; общая часть → `pending.push(shared)`; `current` пересчитан **синхронно, до первого `await`**. Только локальное → `emit()`, вернуть (ни `loadData`, ни `saveData`). Общее → `queue = queue.then(persist)`, где `persist`: `fresh = settingsFrom(await loadData())`; `next = settingsFrom({ ...fresh, ...shared })`; если `JSON.stringify(sharedOf(next)) !== JSON.stringify(sharedOf(fresh))` — `await saveData(sharedOf(next))`; `file = next`; убрать `shared` из `pending`; пересчитать; `emit()`. Ошибка `persist`: убрать `shared` из `pending`, `file = fresh` (если прочитан), пересчитать, `emit()`, отклонить промис `update`; очередь не ломается (`queue` ловит ошибку).
- `reload()`: в ту же очередь: `file = settingsFrom(await loadData())`, пересчитать; `emit()` только если `JSON.stringify` нового `current` ≠ старого.
- `main.ts`: поле `private readonly settings: PluginSettings` создаётся в `onload` с хостом из стрелок, вызывающих методы плагина **в момент вызова** (`loadData: () => this.loadData()`, `saveData: (d) => this.saveData(d)`, `loadLocalStorage: (k) => this.app.loadLocalStorage(k)`, `saveLocalStorage: (k, d) => this.app.saveLocalStorage(k, d)` — иначе проверка ведущего не перехватит вызовы) и файлом `` `${this.pluginDir}/data.json` ``, где `private get pluginDir(): string` — выражение из `servicesHost` (`main.ts:63`), которым теперь пользуются оба. `get/update/onChange` плагина делегируют `this.settings`. Первым слушателем — `showCardSize` из текущих настроек (сейчас в `emit`, `main.ts:110`); `load()` вызывает его один раз. `watchSettingsFile`: `if (this.settings.owns(path)) void this.settings.reload()`. Новое: `this.registerDomEvent(document, "visibilitychange", () => { if (!document.hidden) void this.settings.reload(); })` — страховка вместо прежней перечитки на каждом `update`. `reloadSettings`/`deviceState`/`emit` из `main.ts` удаляются.

- [ ] **Step 1: Тесты** (фальшивый хост: `file: unknown`, счётчики `loads`, `saves`, `localSaves`; `gate` — промис, которого ждёт `saveData`):
  - `"a device-only patch neither reads nor writes data.json and tells the listeners once"`: `update({ rightMode: "soon" })` → `loads` 0, `saves` 0, `localSaves` 1, слушатель 1, `get().rightMode === "soon"`.
  - `"a shared patch reads the file once, writes it once and tells once"`: `update({ scrollToHour: 7 })` → 1/1/1, `file.scrollToHour === 7`.
  - `"its own write coming back tells nobody"`: после предыдущего `reload()` → `loads` 2, слушатель всё ещё 1.
  - `"a file Sync changed is seen and told"`: хосту подменить `file.google.refreshToken = "fromMac"`, `reload()` → слушатель 1, `get().google.refreshToken === "fromMac"`, `get().rightMode` — из localStorage.
  - `"a shared patch is seen by get() at once, before the file is written"`: `saveData` ждёт `gate`; `void update({ dueDateMarker: "D" })`; синхронно `get().dueDateMarker === "D"`.
  - `"two shared patches in a row both reach the file"`: `update({ dueDateMarker: "D" })` и сразу `update({ slotMarker: "S" })` без `await`; после обоих — оба в `file`, `saves` 2, `loads` 2.
  - `"Sync arriving while a write waits keeps both"`: `saveData` на `gate`; `update({ dueDateMarker: "D" })`; хост меняет `file.google.refreshToken`; `reload()`; открыть `gate` → `get()` содержит и `"D"`, и новый токен, слушатель не меньше 2.
  - `"a patch that changes nothing in the file does not write it"`: `update({ scrollToHour: DEFAULT_SETTINGS.scrollToHour })` поверх файла с тем же значением → `saves` 0.
  - `"a failed write takes its patch back out of get()"`: `saveData` бросает → `update` отклонён, `get().dueDateMarker` — прежний, следующий `update` пишет.
  - `"owns only data.json in the plugin folder"`: `owns(".obsidian/plugins/task-calendar/data.json")` true, `owns("x/data.json")` false.
- [ ] **Step 2:** `npx vitest run tests/infrastructure/PluginSettings.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать, подключить в `main.ts`.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Settings: the device's own keys never touch data.json, writes queue over the freshest file, an echo of our own write tells nobody`.

### Task 2: Поля настроек сохраняются по завершении ввода, а не на каждую букву

**Files:**
- Create: `src/ui/SettingsCommits.ts`
- Modify: `src/ui/SettingsTab.ts`, `src/main.ts`
- Test: `tests/ui/SettingsCommits.test.ts` (`// @vitest-environment happy-dom`)

**Interfaces:**
- ```ts
  export class SettingsCommits {
      /** Saves the field's text when it is done with: blur, Enter, a press elsewhere on the page, flush(). Nothing while typing; nothing when the text is what was saved last. */
      bind(input: HTMLInputElement, commit: (value: string) => unknown): void
      /** A press anywhere in `page` outside a field saves that field first: on iOS a button takes no focus, the field may never blur. */
      watch(page: HTMLElement): void
      /** Saves every field with unsaved text; the fields stay bound. */
      flush(): void
      /** Forgets the fields: the page is about to be emptied. */
      reset(): void
  }
  ```
  `bind`: `committed = input.value`; `input` → «есть несохранённое»; `blur` и `keydown` с `key === "Enter" && !isComposing` → `save(field)`; `save`: если `input.value !== committed` — `committed = input.value`, `commit(input.value)`. `watch`: `pointerdown` с `capture: true` на `page` → `save` для всех полей, кроме того, в которое нажали. Без таймеров.
- `SettingsTab`: `private readonly commits = new SettingsCommits()`. Все поля из списка выше (`:61, :63, :67, :68, :78, :107, :114, :165, :173, :177, :187, :189, :194, :197, :250, :251`) вместо `.onChange(...)` — `this.commits.bind(t.inputEl, (v) => …)` с тем же телом (проверка числа в `number()` и разбор в «Zoom levels» — в момент сохранения). `display()` начинается с `this.commits.flush(); this.commits.reset();`, после построения — `this.commits.watch(containerEl)` (один раз на `containerEl`, флаг). `override hide(): void { this.flushPending(); super.hide(); }`. `flushPending(): void { this.commits.flush(); }` — публичный. В конструкторе: `plugin.registerDomEvent(document, "visibilitychange", () => { if (document.hidden) this.flushPending(); })`.
- `main.ts`: вкладка настроек сохраняется в поле; `this.register(() => tab.flushPending())`.

- [ ] **Step 1: Тесты** (`commit` — шпион; ввод — `input.value = …; input.dispatchEvent(new Event("input"))` по букве):
  - `"ten letters, then blur: one save with the whole text"` → шпион 1 раз, аргумент — 10 букв.
  - `"nothing is saved while typing"` → после 10 букв без blur — 0.
  - `"Enter saves; the blur after it saves nothing more"` → 1.
  - `"text typed back to what was saved saves nothing"` → `"ab"` → `"abc"` → `"ab"`, blur → 0.
  - `"a press elsewhere on the page saves the field before the press is handled"`: кнопка в `page` с обработчиком `click`, который пишет в общий массив порядка; `pointerdown` + `click` по кнопке → порядок `["commit", "click"]`.
  - `"a press in the field itself saves nothing"` → `pointerdown` по `input` → 0.
  - `"flush saves every field with unsaved text and only those"` → три поля, в двух ввод → 2 сохранения; повторный `flush()` → по-прежнему 2.
  - `"after reset, the old fields are not saved"` → ввод, `reset()`, `flush()` → 0.
- [ ] **Step 2:** `npx vitest run tests/ui/SettingsCommits.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать, подключить в `SettingsTab` и `main.ts`.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Settings fields save when typing is done: blur, Enter, a press elsewhere, the tab closing or the app going to the background`.

### Task 3: Скрипт экспорта — при загрузке и смене пути; старт без лишней работы

**Files:**
- Modify: `src/infrastructure/WorkCalendarExportScript.ts`, `src/main.ts`
- Test: `tests/infrastructure/WorkCalendarExportScript.test.ts`

**Interfaces:**
- `keepInstalled()`: `install()` сразу, затем на `settings.onChange` — `install()` только если `settings.get().workCalendarFile !== installedFor`; `private installedFor: string | null` выставляется в `install()` значением пути, для которого поставлена запись в очередь.
- `ExportScriptAdapter` объявляет свои `exists`, `read`, `write` сам (не `extends WorkCalendarAdapter`: в Task 6 у того `exists` заменяется на `stat`).
- `main.ts`: `this.app.workspace.onLayoutReady(() => this.register(services.workExport.keepInstalled()))` вместо `main.ts:34`. Поле `private services: Services | null = null` заполняется в `createDeps` (нужно ведущему для счётчиков через CDP; demo его не заполняет).

- [ ] **Step 1: Тесты:**
  - `"a settings change that keeps the work file path does not look at the export"`: счётчики `exists`/`read` фальшивого адаптера после `keepInstalled()` и `await` установки; `settings.update({ rightMode: "soon" })` и `update({ scrollToHour: 3 })` → счётчики не выросли.
  - Существующий `"rewrites the export when the work file path changes, and stops when unsubscribed"` — без изменений, PASS.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `The work calendar export is installed once the layout is ready and again only when its path changes`.

### Task 4: HTTP через порт; одно обновление токена на два вызова

**Files:**
- Create: `src/infrastructure/Http.ts`, `src/infrastructure/ObsidianHttp.ts`
- Modify: `src/infrastructure/GoogleToken.ts`, `src/infrastructure/GoogleAuth.ts`, `src/application/services.ts`
- Test: `tests/infrastructure/GoogleAuth.test.ts`

**Interfaces:**
- `Http.ts` (без импорта `obsidian`):
  ```ts
  export interface HttpRequest { readonly url: string; readonly method?: "GET" | "POST"; readonly headers?: Record<string, string>; readonly body?: string }
  export interface HttpResponse { readonly status: number; readonly json: unknown; readonly text: string }
  export type Http = (request: HttpRequest) => Promise<HttpResponse>;
  ```
- `ObsidianHttp.ts`: `export const obsidianHttp: Http` — `requestUrl({ ...request, throw: false })`.
- `GoogleToken.requestToken(http: Http, clientId: string, clientSecret: string, fields: Record<string, string>): Promise<TokenResponse>` — без импорта `obsidian`.
- `GoogleAuth` конструктор: `(settings: SettingsStore, flow: LoginFlow, token: (fields: Record<string, string>) => Promise<TokenResponse>, clock: Clock)`; импорт `GoogleToken` — только тип. `Date.now()` → `clock.now().getTime()`. `private refreshing: { readonly refreshToken: string; readonly promise: Promise<string> } | null`. `accessToken()`: валидный токен — вернуть; `refreshing` с тем же `refreshToken` — вернуть его промис; иначе начать обновление, по завершении сохранить `accessTokenValue`/`expiresAt` **только если** `settings.get().google.refreshToken` всё ещё тот же, в `finally` обнулить `refreshing` (если он наш). `saveRefreshToken` обнуляет и `refreshing`.
- `services.ts`: `const token = (fields) => requestToken(obsidianHttp, settings.get().google.clientId, settings.get().google.clientSecret, fields)` — его получают и `GoogleRedirectLogin` (как сейчас), и `GoogleAuth`; `clock` передаётся в `GoogleAuth`.

- [ ] **Step 1: Тесты** (`token` — шпион с ручным промисом; `FakeSettingsStore` с `refreshToken: "r"`; фальшивые часы):
  - `"two calls at once refresh the token once"` → два `accessToken()` до ответа → шпион 1, оба получили `"a1"`.
  - `"a token still valid is reused; one about to expire is refreshed"` → `expires_in: 3600`; часы +30 мин → 1 вызов; +59,5 мин → 2.
  - `"a refresh that failed lets the next call try again"` → первый отклонён; следующий вызов → шпион 2.
  - `"a token answered after logout is not kept"` → обновление в полёте, `logout()`, ответ пришёл; `settings.update` с новым `refreshToken: "r2"`; `accessToken()` → шпион 2, вызван с `refresh_token: "r2"`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS (`GoogleRedirectLogin.test.ts` не меняется), `npm run build` — OK.
- [ ] **Step 5:** Commit `Google: one token refresh for calls that come together, none kept across a logout; requests go through an Http port`.

### Task 5: Список календарей кешируется; все страницы событий

**Files:**
- Modify: `src/infrastructure/GoogleCalendarSource.ts`, `src/application/services.ts`
- Test: `tests/infrastructure/GoogleCalendarSource.test.ts`

**Interfaces:**
- Конструктор: `(auth: Pick<GoogleAuth, "isLoggedIn" | "accessToken">, settings: SettingsStore, clock: Clock, http: Http)`; `services.ts` передаёт `clock` и `obsidianHttp`.
- `const LIST_KEPT_MS = 30 * 60_000; const PAGE_SIZE = "250";`
- `private list: { readonly key: string; readonly at: number; readonly calendars: Promise<CalendarListEntry[]> } | null`; ключ — `JSON.stringify([google.clientId, google.refreshToken])`.
- `private calendarList(fresh = false)`: вернуть `list.calendars`, если `!fresh`, ключ совпал и `clock.now() - at < LIST_KEPT_MS`; иначе запросить, положить промис в `list` сразу (два одновременных вызова делят запрос), при ошибке — `list = null` и пробросить.
- `eventsBetween`: при ошибке любого `eventsOf` — `list = null`, пробросить (удалённый календарь не держит источник упавшим 30 минут).
- `listCalendars()` (страница настроек) — `calendarList(true)`: всегда запрос, кеш обновлён.
- `eventsOf`: цикл по страницам — параметры как сейчас + `pageToken`, пока в ответе есть `nextPageToken`; события всех страниц склеиваются.
- `get<T>()` — через `this.http`.

- [ ] **Step 1: Тесты** (`FakeHttp` отвечает по URL: `/users/me/calendarList` и `/calendars/<id>/events`, считает запросы по видам; фальшивый `auth`; часы):
  - `"asks for the calendar list once for two fetches in a row"` → `eventsBetween` ×2 → список 1, события 2.
  - `"two fetches at once share one list request"` → `Promise.all` двух → список 1.
  - `"asks for the list again after 30 minutes"` → часы +30 мин → список 2.
  - `"asks for the list again after another login"` → `refreshToken` сменён → список 2.
  - `"a failed events request drops the list"` → events 404, `eventsBetween` отклонён; следующий → список 2.
  - `"the settings page always asks for the list and refreshes the one kept"` → `listCalendars()`, затем `eventsBetween` → список 1 + 1 = 2, не 3.
  - `"follows nextPageToken to the last page"` → две страницы по одному событию, во второй запрос ушёл `pageToken=p2`, `maxResults=250` в обоих; в результате 2 события.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Google: the calendar list is kept for 30 minutes and shared by fetches at once; events follow every page`.

### Task 6: Рабочий файл разбирается, только когда изменился

**Files:**
- Modify: `src/infrastructure/WorkCalendarFileSource.ts`
- Test: `tests/infrastructure/WorkCalendarFileSource.test.ts`

**Interfaces:**
- `WorkCalendarAdapter { stat(path: string): Promise<{ readonly mtime: number; readonly size: number } | null>; read(path: string): Promise<string> }` (`app.vault.adapter` это умеет; `exists` убран).
- `private kept: { readonly path: string; readonly mtime: number; readonly size: number; readonly file: WorkCalendarFile } | null`.
- `eventsBetween()`: `stat` → `null` — `throw new Error("file missing")` (текст как сейчас); путь, `mtime` и `size` совпали с `kept` — разобранный файл из `kept`; иначе `read` + `JSON.parse`, `kept` обновлён (ошибка разбора — `kept` не трогать, пробросить). Фильтр по названиям и `toEvent` — каждый раз от `kept.file` (настройки названий действуют сразу).

- [ ] **Step 1: Тесты** (`FakeAdapter` получает `stat` из `mtime`/`size` по пути и счётчик `reads`; старые тесты переводятся на `stat`):
  - `"reads and parses the file once while it stays the same"` → 3 × `eventsBetween` → `reads` 1.
  - `"reads it again when its time or size changed"` → `mtime` +1 → `reads` 2.
  - `"reads the new file when the path in the settings changed"` → `reads` 2, события нового файла.
  - `"applies changed titles to the file kept, without reading it"` → `workCalendarTitles` сменены → `reads` 1, фильтр новый.
  - Существующий `"throws 'file missing' when the file is not there"` — через `stat → null`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Work calendar: the file is parsed again only when its time or size changed`.

### Task 7: Контракт — `CalendarService.eventsAround` (общий контракт, отдельный шаг)

**Files:**
- Modify: `src/application/contracts.ts`, `tests/fakes/DemoCalendarService.ts`, `tests/ui/DayData.test.ts` (`SlowCalendars`), `src/application/CalendarServiceImpl.ts` (временная реализация)

**Interfaces:**
- В `CalendarService` после `eventsOn`:
  ```ts
  /**
   * Another day opens: the day and the days next to it, one request per source. A source polled over the network that
   * answered for the day less than the refresh interval ago is not asked again: its last answer is shown.
   */
  eventsAround(date: LocalDate): Promise<DayEvents>;
  ```
  Комментарий `eventsOn` — `/** Fetches both sources afresh for the day alone: polling, Refresh now, a source that changed. */`.
- Временная реализация везде — `eventsAround(date) { return this.eventsOn(date); }` (в `SlowCalendars` — записывает дату в отдельный массив `around` и отвечает так же, как `eventsOn`).

- [ ] **Step 1:** Изменить контракт и реализации; `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 2:** Commit `Contract: CalendarService.eventsAround, the day and its neighbours when a day opens`.

### Task 8: `CalendarServiceImpl` — окно ±1 день, свежесть, кеш устройства по делу

**Files:**
- Modify: `src/application/CalendarServiceImpl.ts`, `tests/fakes/MemoryEventCache.ts` (счётчик `reads`)
- Test: `tests/application/CalendarServiceImpl.test.ts`

**Interfaces:**
- Константы: `AROUND_DAYS = 1`; `CACHE_TIME_STEP_MS = 10 * MINUTE_MS`.
- Кеш устройства читается лениво: `private days: Map<LocalDate, DayEvents> | null = null`, геттер `lastDay` читает `cache.read()` при первом обращении; конструктор `cache.read()` не зовёт.
- `private readonly answered = new Map<string, { readonly at: number; readonly key: string }>()` — ключ записи `` `${source}|${date}` ``, `key` — `JSON.stringify([google.clientId, google.refreshToken, google.calendarIds, dayStartHour])` в момент **начала** запроса. Пишется после успешного ответа источника без `onChange` для каждого дня, который покрывал запрос (`eventsOn` — один день, `eventsAround` — три).
- `private fresh(source: EventSource, date: LocalDate): boolean` = `!source.onChange && refreshSeconds > 0 && answered` есть, `key` равен текущему и `clock.now() - at < refreshSeconds * 1000`.
- `eventsAround(date)`, алгоритм:
  1. `days` = `date-1, date, date+1` (`addDays` из `src/domain/LocalDate.ts:26`), окна `DayWindow` для каждого.
  2. Источники, свежие для `date`, не спрашиваются; остальные — `fetch` с диапазоном `windows[0].fetchStart … windows[2].fetchEnd` (как `fetch` сейчас: тайм-аут, при ошибке — `keptOf(source, date) ?? lastGood`).
  3. Если спрашивать некого — вернуть `cached(date)` без записи в кеш устройства.
  4. Для каждого дня `X` собрать `DayEvents`: спрошенный источник — его события, отфильтрованные `windows[X].shows`, статус с числом показанных; неспрошенный — `keptOf(source, X)` и его статус (`stale` пересчитан, как в `cached`). Если у неспрошенного источника для `X` ничего нет — день `X` не сохраняется (для `date` такого не бывает: свежесть подразумевает сохранённый день).
  5. Все собранные дни — одним `remember` (одна запись в кеш устройства максимум); вернуть день `date`.
- `eventsOn(date)` — как сейчас (один день, все источники всегда), плюс запись `answered`.
- `remember(days: readonly (readonly [LocalDate, DayEvents])[])`: в памяти — как сейчас (перестановка в конец, обрезка до `KEPT_DAYS`); `cache.write` только если хотя бы для одного дня: новый день, или изменились события, или статусы без `updatedAt` и `stale` (сравнение `JSON.stringify`), или `updatedAt` какого-то источника позже записанного больше чем на `CACHE_TIME_STEP_MS`, или день вытеснен. Для сравнения хранить `private written = new Map<LocalDate, DayEvents>()` — то, что ушло в кеш последней записью (после ленивого чтения — прочитанное).

- [ ] **Step 1: Тесты** (`FakeSource`, `ChangingSource`, `FakeClock`, `FakeSettingsStore` с `google.refreshSeconds: 60`):
  - `"eventsAround asks every source once for the day before through the day after and keeps the three days"` → `google.calls` 1; `start` = начало 29.10 (полночь), `end` = 01.11 `dayStartHour`; `cached` для 29, 30, 31 — не `null`, каждый со своими событиями.
  - `"a neighbour answered less than refreshSeconds ago is shown without asking Google"` → `eventsAround("2026-10-30")`, часы +30 с, `eventsAround("2026-10-31")` → `google.calls` 1, результат = `cached("2026-10-31")`.
  - `"refreshSeconds later it asks again, once"` → +60 с → 2.
  - `"eventsOn asks for the day alone every time"` → `eventsAround(D)`, `eventsOn(D)` → `google.calls` 2, второй диапазон — один день.
  - `"a source that tells its changes is always asked"` → `ChangingSource("work")` + Google: второй `eventsAround(D+1)` в пределах 60 с → `work.calls` 2, `google.calls` 1.
  - `"a failed answer is not fresh"` → `failWith` на первом, снять, `eventsAround(D+1)` → 2.
  - `"other calendars chosen make every day unfresh, another column shown does not"` → `update` `google.calendarIds` → спрошен; заново: `update({ rightMode })` → не спрошен.
  - `"an answer that comes after the calendars changed is not fresh"` → источник на ручном промисе; смена `calendarIds` до ответа; ответ; `eventsAround(D+1)` → спрошен.
  - `"refreshSeconds 0 means nothing is fresh"` → 2 запроса.
  - `"a neighbour is kept only when every source answered for it"`: `eventsOn(D)` (Google свежий только для D), рабочий — `ChangingSource`; `eventsAround(D)` → `cached(D+1)` — `null`.
  - `"the same events fetched again write the device cache nothing"` → `eventsOn(D)` ×2 с `updatedAt` +1 мин → `cache.writes` 1.
  - `"other events are written at once"` → 2; `"a fetch time 10 minutes newer is written"` → `updatedAt` +10 мин 1 с → 2.
  - `"eventsAround writes the three days at most once"` → `cache.writes` +1.
  - `"reads the device cache on first use, not when built"` → после конструктора `cache.reads` 0; после `cached(D)` — 1; после ещё одного — 1.
  - Существующие (`"keeps the 31 days fetched last"`, `CalendarServiceImpl.onChange`) — без изменений, PASS.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Calendars: a day opens with its neighbours in one request, a neighbour fresh from Google asks nothing, the device cache is written only for news`.

### Task 9: Вид открывает день через `eventsAround`

**Files:**
- Modify: `src/ui/DayData.ts`, `src/ui/DayPeek.ts`
- Test: `tests/ui/DayData.test.ts`

**Interfaces:**
- `DayData`: `private around = false`. `eventReload` берёт значение в момент старта запроса: `() => { const date = this.deps.date(); const around = this.around; this.around = false; return around ? calendars.eventsAround(date) : calendars.eventsOn(date); }`. `load()` и `selectDay()` ставят `around = true` перед запросом; публичный `calendars()` (опрос, Refresh now, `onChange`) — `around = false`.
- `DayPeek.ts:81`: `eventsOn(date)` → `eventsAround(date)`.

- [ ] **Step 1: Тесты** (`SlowCalendars.around`/`asked`):
  - `"the view opens asking for the day with its neighbours"` → `load()` → `around` = `[TODAY]`, `asked` = `[]`.
  - `"another day asks for it with its neighbours"` → `selectDay()` → `around` содержит новую дату.
  - `"a poll asks for the shown day alone"` → `calendars()` → `asked` = `[TODAY]`.
  - `"a poll during the opening of a day is served by a fetch of the day alone after it"` → `selectDay()`, `calendars()` до ответа, `answer()` ×2 → `around` = `[D]`, `asked` = `[D]`.
  - `"a day changed during the fetch is asked for with its neighbours after it"` → `selectDay()` на D1, до ответа `setDate(D2)` + `selectDay()`, ответы → `around` = `[D1, D2]`, на экране — события D2.
  - Остальные тесты `DayData` — PASS (ожидания про `asked` при открытии/смене дня переводятся на `around`).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `The view opens a day and peeks at the next one through eventsAround; polling and Refresh now still fetch the shown day`.

### Task 10: Опрос — только для вида на экране; фокус не чаще раза в пол-интервала

**Files:**
- Modify: `src/ui/CalendarPolling.ts`, `src/ui/TaskCalendarView.ts`
- Test: `tests/ui/CalendarPolling.test.ts`

**Interfaces:**
- `PollingDeps`: `hidden` — doc «The view is not on screen: the document is hidden or its tab is behind another»; новое `readonly now: () => number`.
- `CalendarPolling`: `private missed = false`, `private lastAt = -Infinity`.
  - `start()` — как сейчас + `lastAt = now()` (вид открывается со своим запросом в `DayData.load`).
  - `refresh()` — всегда запрос (Refresh now); по завершении `lastAt = now()`, `missed = false`.
  - `tick()` — скрыт: `missed = true`, перепланировать; иначе `refresh()`.
  - `wake(): void` — фокус окна и возврат приложения: ничего, если `hidden()` (тогда `missed = true`) или `now() - lastAt < intervalMs() / 2`; иначе `refresh()`. При `intervalMs() === 0` — запрос всегда (как обещает подпись настройки).
  - `catchUp(): void` — вид снова на экране: `refresh()`, только если `missed && !hidden()`.
- `TaskCalendarView`: `hidden: () => document.hidden || !this.contentEl.isShown()`, `now: () => Date.now()` (не `deps.clock`: в demo часы стоят); `focus` → `this.polling.wake()`; `visibilitychange` (видим) → `wake()` + `catchUpTick()`; `onResize` → добавить `this.polling.catchUp()`; новое `this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.polling.catchUp()))`.

- [ ] **Step 1: Тесты** (`setup` получает фальшивое `now`):
  - `"a tick while the view is off screen fetches nothing; coming back fetches once"` → `setHidden(true)`, `fire()` → 0; `setHidden(false)`, `catchUp()` → 1; `catchUp()` → 1.
  - `"coming back without a missed tick fetches nothing"` → `catchUp()` → 0.
  - `"wake right after the view opened fetches nothing"` → `start()`, `wake()` → 0.
  - `"wake fetches once half the interval passed since the last fetch"` → `now` +29 с → 0; +31 с → 1.
  - `"wake fetches nothing for a view off screen"` → 0.
  - `"Refresh now fetches even right after another fetch"` → `refresh()` ×2 с ответом между → 2.
  - `"with the timer off, wake fetches at once"` → интервал 0 → 1.
  - Существующие — PASS (`"does not fetch for a hidden screen, and keeps the timer going"` не меняется).
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать, подключить в виде.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Polling only for a calendar on screen; coming back fetches at most once per half interval; a tab brought back catches up`.

### Task 11: Проверка (ведущий)

- [ ] Тестовый Obsidian (порт 9333, свой vault), сборка ветки. Через CDP: `p = app.plugins.plugins["task-calendar"]`; обернуть счётчиками `p.loadData`, `p.saveData`, `app.saveLocalStorage` (с ключом), `app.loadLocalStorage`; слушатель `p.onChange(() => n++)`; время `data.json` — `app.vault.adapter.stat(".obsidian/plugins/task-calendar/data.json")`.
  - Переключить колонки 5 раз, перетащить разделитель, изменить зум: `loadData` 0, `saveData` 0, `mtime` `data.json` прежний; `saveLocalStorage("task-calendar:device")` — по одному на действие.
  - «Day starts at» в настройках: `saveData` 1, `loadData` 2 (запись + эхо), `n` +1.
  - Подменить `data.json` с диска (как Sync: `app.vault.adapter.write` с другим `scrollToHour`) — настройка применилась, `n` +1.
- [ ] Настройки: «File path» рабочего календаря — 10 букв через `Input.insertText` по одной: `saveData` 0; клик мимо поля → 1; скрипт экспорта переписан один раз. Префикс приоритета + сразу клик по цвету: в `data.json` и префикс, и цвет. Ввод в поле и Esc (закрыть настройки) → значение в `data.json`. То же в виде телефона (`app.emulateMobile(true)`, 390×844): ввод в «Client id» и тап по «Log in» без blur — кнопка видит введённое (ошибка «required» не появляется при заполненном secret).
- [ ] Календари: обернуть `eventsBetween` источников (`p.services.calendars.sources`) счётчиком с диапазоном; `refreshSeconds` = 10.
  - Открыть вид: 1 вызов на источник, диапазон 3 дня. Свайп вперёд в пределах 10 с: Google 0, рабочий 1 (только `stat`: обернуть `app.vault.adapter.read` — 0 чтений рабочего файла). Свайп ещё вперёд: по 1, диапазон 3 дня. Через 10 с тик опроса: по 1, диапазон 1 день. Подглядывание дня при медленном свайпе — без вызовов, если день в кеше.
  - `saveLocalStorage("task-calendar:events")` — 0 на тиках без изменений.
  - Mac: открыть заметку новой вкладкой поверх календаря в той же группе — за 3 интервала 0 вызовов; вернуться на вкладку — 1. Календарь в сплите рядом с заметкой с фокусом в заметке — тики идут. Окно потеряло и вернуло фокус дважды за 3 с — не больше 1 вызова.
  - Перезапуск плагина при закрытом виде (`app.plugins.disablePlugin/enablePlugin`): `loadLocalStorage("task-calendar:events")` — 0 до открытия вида.
  - Если в тестовом профиле есть вход в Google: обернуть `p.services.googleSource.http` — два свайпа → один запрос `calendarList`. Без входа — проверка списка и пагинации остаётся за тестами; в Obsidian Макса после релиза — только с его согласия (`obsidian eval`, без изменений vault).
- [ ] Телефон (390×844) и Mac, светлая и тёмная: экран и страница настроек совпадают с master по скриншотам; события соседних дней появляются сразу при свайпе.
- [ ] Итог в спеку, строка в таблицу обзора.
