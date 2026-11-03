# Блок 4 «Быстрый ввод без перерисовок на каждую букву» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enter — ровно две перерисовки задач (сдвиг строки сразу + одна с записанной карточкой), ни одной перерисовки каркаса и событий; буква — ни одного замера раскладки в обработчике ввода и один проход «замер → запись» в кадр; иконка места и открытая панель не пересобираются, пока не изменились.

**Architecture:** запись быстрого ввода снимает строку из очереди и сдвигает место поля *в том же применении данных*, которое рисует записанную карточку: `Reload` принимает крючок «перед применением», `DayData.tasks(beforeShow)` его передаёт, `QuickEntry` обновляет себя в нём и сообщает контроллеру «перерисовка сейчас придёт»; если данные не изменились и рисовать нечего — контроллер перерисовывает сам. Всё, что меряет поле и ставит панель (буква, прокрутка, `transitionend`), идёт через `FramePass` — один проход в `requestAnimationFrame`; после перерисовки проход выполняется сразу, как сейчас. `QuickBar` пишет только изменившееся и читает до записей.

**Tech Stack:** TypeScript, vitest + happy-dom, Obsidian API.

**Spec:** `docs/superpowers/specs/2026-11-03-perf-4-quick-entry-design.md`

## Что в спеке уже не так (сверено с master 500ae6a)

- Номера строк сдвинулись: `QuickEntry.create/write` — `QuickEntry.ts:253-285`, `state` — `132-144`; `changed/sync` — `QuickEntryController.ts:490-512`, `fieldIn` — `576-581`, `onInput` — `591-595`, `blurred` — `620-624`, `scrolled/settled` — `140-152`, `bringIntoSight/followBar/roomOf` — `447-484`; `QuickBar.show` — `125-139`, `follow` — `151-163`, `showPlace` — `218-222`, `refreshPanel` — `250-255`.
- **Рендер 2 (`fresh()` перед записью) уже бесплатен.** После блока 2 `DayData.show` молчит, если прочитанное равно показанному (`DayData.ts:120-128`), а `Reload` складывает запросы (`Reload.ts:15-28`). Перед записью данные почти всегда те же — перерисовки нет. Сам `fresh()` перед записью **остаётся**: `fitLevel`/`resultOf` берут карточки из нарисованных списков (`QuickEntryController.ts:344-346` → `TaskList.listCards`), и только он гарантирует, что место считается по файлу после предыдущих записей. Это защита от гонки, её не трогаем.
- **Эхо `modify`** не подавляется (обзор), но складывается в тот же `Reload` с `fresh()` после записи — отдельной перерисовкой не становится, если данные равны.
- **«Поле переезжает» — неверно для текущего кода, пункт снят.** `TaskList.render` хранит строку поля и рисует карточки вокруг неё (`TaskList.ts:70-71, 123-127, 133-149`: `keptRow`, `kept.before(...)`), таймлайн держит тот же бокс (`Timeline.ts:411-422`, `holdField`), стопка меню — тот же ряд (`QuickEntryController.ts:424`). `fieldIn` переносит узел только при смене колонки (кнопка места, `moveTo`), где blur ожидаем. Поэтому таймер `setTimeout` в `blurred()` **остаётся**: он нужен для переезда между колонками и для окна, потерявшего фокус. В план входит только тест, закрепляющий, что Enter не трогает узел поля и фокус.
- **Рендер 4 стоит дорого не из-за списков, а из-за `render()` = все три части.** `deps.render` в виде — `this.render()` → `parts.request("frame", "tasks", "events")` (`TaskCalendarView.ts:378, 927-929`). Состояние ввода влияет только на списки, таймлайн и стопку меню (`rendered()` → `placeOffLists`); `is-entering` — чистый CSS (`styles.css:587-589, 682, 739`). Значит, `deps.render` → `parts.request("tasks")`.
- **`transitionend` не фильтруем по элементу и свойству** (спека, п. 4): список «слайд колонок, оседание карточек» устареет с первой новой анимацией, и панель останется стоять не там — ровно тот «залежавшийся» результат, который полная перерисовка раньше лечила. Вместо фильтра — сведение в один проход за кадр: пачка из N событий стоит одного прохода.
- **Элементы панели клавиатуры и строки статуса** ищутся не «один раз на открытие поля», а кешируются, пока подключены (`isConnected`), и ищутся заново, если пропали или их не было (панель клавиатуры появляется после открытия поля). После `FramePass` поиск идёт не чаще раза в кадр.
- `canIndent/canOutdent` (`QuickEntry.ts:141-142`) действительно на каждую букву строят `listCards` дважды (`TaskList.ts:171-173` — новый массив на каждый вызов) и массив `shown` в `Run.shifted` — остаётся в плане.

## Global Constraints

- Вид, анимации, положение панели над клавиатурой и у поля, правила уровней и мест не меняются ни на пиксель (обзор, «Общие правила»).
- `src/settings.ts` и `src/application/contracts.ts` не меняются; всё — внутри `src/ui`.
- `fresh()` перед записью и таймер в `blurred()` остаются (см. выше).
- Частичное обновление не оставляет ничего устаревшим: если после записи данные не дали перерисовки, состояние ввода всё равно нарисовано (страховка в контроллере); упавшая запись или упавшее чтение снимают строку из очереди с перерисовкой, как сейчас.
- Тесты фиксируют выигрыш счётчиками (шпионы на `render`, `getBoundingClientRect`, `querySelector`, `MutationObserver.takeRecords()`, ручная очередь `requestAnimationFrame`), не временем.
- Стиль кода как в соседних файлах; комментарии короткие, английские, только где нужны.
- `npm test`, `npm run build`.

## Review Focus

1. Крючок `beforeShow` выполняется перед применением, а данные оказались равны показанным (`DayData` молчит): контроллер обязан перерисовать сам, иначе строка «висит» в очереди или поле стоит над своей карточкой.
2. Чтение после записи упало (`Reload` отклонён): крючок не выполнен и выброшен вместе с отклонённым проходом; строка снимается в `finally` с обычной перерисовкой; следующий `request` не выполняет старый крючок.
3. Жест держит экран (`ScreenParts` занят), когда приходит запись: состояние ввода обновлено, перерисовка отложена; после отпускания — одна перерисовка, в ней карточка и поле на своих местах.
4. Поле ушло в другую колонку, пока запись летела (`run !== field.run`): крючок сдвигает очередь старого прохода, перерисовку состояния поля не заказывает.
5. Проход в кадре: первая буква после перерисовки, прокрутка пальцем во время ввода (флаг `follow` снимается синхронно в обработчике `scroll`), открытая панель на Mac при смене уровня префиксом, клавиатура выезжает (`onResize` → `reveal()` → проход сразу).

---

### Task 1: Крючок «перед показом» в `Reload` и `DayData`

**Files:**
- Modify: `src/ui/Reload.ts`, `src/ui/DayData.ts`
- Test: `tests/ui/Reload.test.ts`, `tests/ui/DayData.test.ts`

**Interfaces:**
- `Reload.request(beforeApply?: () => void): Promise<void>` — крючок кладётся в `private hooks: (() => void)[]`. В `drain` после последнего `fetch` (когда `requested` ложно) — `this.hooks.splice(0).forEach((hook) => hook())`, затем `apply(value)`. Если `fetch` отклонён — `hooks` очищаются (все они принадлежат этому проходу: `request` отдаёт `this.running`), промис отклоняется как сейчас.
- `DayData.tasks(beforeShow?: () => void): Promise<void>` — `this.taskReload.request(beforeShow)`. Остальные вызовы `tasks()` без аргумента.

- [ ] **Step 1: Тесты**
  - `Reload`: `"runs the hooks right before applying the value fetched after them"` — порядок в общем массиве: `["hook", "apply:1"]`.
  - `Reload`: `"a hook given during a fetch waits for the fetch after it"` — два `deferred` (как в `"folds requests…"`); `request()`, затем `request(hook)` во время первого `fetch`; после обоих — `hook` вызван 1 раз, `applied` = `["fresh"]`, и в момент вызова `hook` `applied` пуст.
  - `Reload`: `"drops the hooks of a fetch that failed"` — первый `fetch` бросает, `request(hook)` отклонён, `hook` не вызван; следующий `request()` применяет значение, `hook` по-прежнему 0 вызовов.
  - `DayData`: `"runs beforeShow before telling the tasks changed"` — порядок `["before", "tasks"]`; `"runs beforeShow even when the tasks read are the same"` — второй `data.tasks(before)` без изменения файла: `before` вызван, `updates` не вырос.
- [ ] **Step 2:** `npx vitest run tests/ui/Reload.test.ts tests/ui/DayData.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Reload: a hook runs right before the value it waited for is shown`.

### Task 2: Записанная строка уходит из очереди в том же показе, что и карточка

**Files:**
- Modify: `src/ui/quick/QuickEntry.ts`
- Test: `tests/ui/QuickEntry.test.ts`

**Interfaces:**
- `QuickEntryDeps.fresh(beforeShow?: () => void): Promise<void>` — doc: «Resolves once the lists show the file as of the last write; `beforeShow` runs right before they draw it».
- `QuickEntryDeps.onChange(state: EntryState | null, drawnNext?: boolean): void` — `drawnNext: true` значит «списки сейчас нарисуют данные, к которым относится это изменение; отдельная перерисовка не нужна».
- `create(field)`: в задаче очереди — `await this.deps.fresh()` (перед записью, как сейчас), затем `await this.write(run, line)`; `finally` снимает строку и зовёт `changed()` **только если** крючок не успел (`let shown = false`).
- `write(run: Run, line: Line, onShown: () => void): Promise<void>` (принимает `run`, а не `spot`): `await createInPlace(...)`, затем `await this.deps.fresh(() => { …; onShown() })`, где крючок делает: для списка — `this.runs.landed(column, place.index)` (раньше это шло после `fresh`); для всех видов — `run.pending.shift()`; если `run === this.field?.run` — `this.deps.onChange(this.state, true)`. `onShown` ставит `shown = true`.
- Слот и стопка — тот же крючок без `landed`. `saveRename` не меняется.

- [ ] **Step 1: Тесты** (`FakeTasks.fresh` принять `beforeShow`: после `await this.gate` вызвать `beforeShow?.()`, затем применить `written`, затем записать в `seen` снимок «как нарисовали» — карточки + очередь из `this.lastState`; `onChange` хранит `lastState` и пишет в `seen` только при `drawnNext !== true`. Существующий тест `"…it never leaves the screen for a moment"` должен пройти без изменения ожиданий):
  - `"a written line leaves the queue in the change that comes with its card, not after it"`: `open(at(2))`, `type("1")`, `enter()`, `await idle()` → изменения после Enter: ровно одно с `drawnNext === true`, в нём `pending` = `[]` и `spot` = `at(3)`; после него — ни одного изменения.
  - `"a write that fails takes its line off the queue with a redraw"`: `failing = {"1"}` → последнее изменение с `drawnNext` не `true`, `pending` = `[]`.
  - `"a read that fails after the write takes its line off the queue with a redraw"`: `fresh` бросает на втором вызове → то же, место поля не сдвинуто (`spot` = `at(2)`), как сейчас.
  - `"a line written for a field that has moved changes nothing shown"`: Enter, `moveTo(at(0))` до разрешения `gate` → после записи изменений с `drawnNext` нет.
- [ ] **Step 2:** `npx vitest run tests/ui/QuickEntry.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** PASS (ошибки типов в контроллере — Task 3).
- [ ] **Step 5:** Commit `Quick entry: a written line leaves the queue as its card is drawn, in one go`.

### Task 3: Enter — две перерисовки задач, без каркаса и событий

**Files:**
- Modify: `src/ui/quick/QuickEntryController.ts`, `src/ui/TaskCalendarView.ts`
- Test: `tests/ui/QuickEntryController.test.ts`

**Interfaces:**
- `QuickEntryControllerDeps.fresh(beforeShow?: () => void): Promise<void>`; doc у `render()`: «Redraws the lists and the timeline, which calls `rendered` once drawn».
- `private draws = 0` — растёт в начале `rendered()`.
- В конструкторе `QuickEntry` получает `fresh: (beforeShow) => this.fresh(beforeShow)` и `onChange: (state, drawnNext) => this.changed(state, drawnNext)`.
- `private async fresh(beforeShow?: () => void): Promise<void>`: без крючка — `deps.fresh()`; с крючком — `let mark = -1; await deps.fresh(() => { beforeShow(); mark = this.draws; }); if (mark === this.draws) this.deps.render();` (данные равны или экран занят — перерисовать самим; при занятом экране запрос сольётся с отложенным).
- `changed(state, drawnNext = false)`: всё как сейчас; если `drawnNext` и `state` не null — после учёта `moved`/`follow` выход без `render()` и без `sync()`.
- Вид: `fresh: (beforeShow) => this.data.tasks(beforeShow)`, `render: () => this.parts.request("tasks")`.

- [ ] **Step 1: Тесты** (в `setUp` — опция `drawsOnFresh?: boolean`: `fresh(beforeShow)` вызывает `beforeShow?.()`, затем `render()`, только если `created.length` изменился с прошлого `fresh` — как `DayData`, молчащий о тех же данных; `createInPlace` при этой опции дописывает `item(text, key("now", n))` в конец `items.left`; `render` обёрнут счётчиком `draws`):
  - `"Enter draws the lists twice: the line moving up at once, and once with its card"`: открыть поле в конце `left` с двумя карточками, `type("A")`, `draws = 0`, `press("Enter")`, `await settled()` → `draws` = 2. `settled()` — новый помощник в файле теста: `await new Promise((r) => setTimeout(r, 0))` (очередь записей пуста после него; `controller.settle()` не годится — закрывает поле).
  - `"no drawing shows the line twice or the field over its card"`: в обёртке `render` после отрисовки снимать `rowsOf("left")`; после Enter во всех снимках `"A"` встречается не больше одного раза и `"field"` — последний.
  - `"Enter keeps the field's own element, focused, with no blur"`: `const before = field()`, слушатели `blur`/`focus` на нём; Enter + ожидание → `field()` тот же узел, `document.activeElement === before`, счётчики 0.
  - `"a write whose read draws nothing redraws the lists itself"`: `drawsOnFresh`, но `createInPlace` ничего не дописывает (данные «те же») → после Enter `draws` = 2, очередь пуста (`rowsOf` без `"A"` как невписанной карточки).
- [ ] **Step 2:** `npx vitest run tests/ui/QuickEntryController.test.ts` — FAIL (`draws` = 3).
- [ ] **Step 3:** Реализовать контроллер и проводку в виде.
- [ ] **Step 4:** `npm test` — PASS, `npx tsc --noEmit` — OK.
- [ ] **Step 5:** Commit `Enter draws the tasks twice and nothing else: the written card and the field come in one drawing`.

### Task 4: `canIndent`/`canOutdent` не пересчитываются на каждую букву

**Files:**
- Modify: `src/ui/TaskList.ts`, `src/ui/quick/QuickEntry.ts`
- Test: `tests/ui/TaskList.test.ts` (новый), `tests/ui/QuickEntry.test.ts`

**Interfaces:**
- `TaskList.listCards` — один массив на отрисовку: `private drawnCards: readonly ListCard[] | null`, сбрасывается в начале `render()`, заполняется лениво в геттере.
- `QuickEntry`: `private shifts: { readonly cards: readonly ListCard[]; readonly indent: boolean; readonly outdent: boolean } | null`. `state` берёт `canIndent/canOutdent` из `shifts`, если `shifts.cards === this.deps.cards(column)`, иначе считает и запоминает. `shifts = null` при каждом изменении, кроме `type()` и `setPriority()` (текст и уровень не влияют на сдвиг); для поля не в списке или переименования — `false/false` без кеша.

- [ ] **Step 1: Тесты**
  - `TaskList`: `"hands out the same cards until it draws again"` — два чтения `listCards` без `render()` → `toBe` один объект; после `render()` — другой.
  - `QuickEntry`: `"typing does not read the cards again"` — шпион на `cards` в `FakeTasks.entry()`; `open(at(1))`, сбросить счётчик, 10 × `type(...)` → `cards` вызван ≤ 1 раза; `indent(1)` → снова читает.
  - `QuickEntry`: `"what the field may do follows cards drawn anew"` — `type("x")`, подменить `tasks.cards` новым массивом, где сдвиг запрещён, → `state.canIndent` = `false`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `What the field may do is worked out once per change of its place or the cards, not per letter`.

### Task 5: `QuickBar` пишет только изменившееся и читает до записей

**Files:**
- Modify: `src/ui/quick/QuickBar.ts`
- Test: `tests/ui/QuickBar.test.ts`

**Interfaces:**
- `show(state)`: `showPlace` только если `state.place` не `samePlacement` с показанным (`private shownPlace: Placement | null`); иконка и текст места не пересоздаются при том же месте.
- `OpenPanel` получает `drawn: string` — ключ отрисованного: `JSON.stringify([kind, usable levels, state.priority?.prefix ?? null, state.place, deps.today()])`; `renderPanel` его записывает; `refreshPanel` перерисовывает, только если ключ изменился (условия «закрыть» и «не трогать выбор даты» прежние).
- `follow(anchor)`: сначала все чтения (`parent` rect — только когда он нужен `standOverToolbar`; rect бара и `offsetHeight` панели — только на Mac при `anchor`), затем записи; каждое свойство стиля (`left`, `top`, `width`, `bottom`, `--tc-toolbar-room` на баре и родителе) пишется или снимается, только если значение отличается; классы — `toggle(name, force)` (не `remove`, он пишет атрибут всегда). Перенос бара между `body` и видом и `sidePanel` — как сейчас.

- [ ] **Step 1: Тесты**
  - `"the same place keeps its icon"`: два `show` с `{ kind: "inbox" }` → тот же узел `svg` в `.tc-bar-place`; `show` с `{ kind: "soon" }` → другой.
  - `"an open panel is not drawn again for the same state"`: открыть панель места, запомнить первый `.tc-menu-tile`; `show` с тем же состоянием → тот же узел; со сменой места → новый. То же для панели уровня при смене `priority`.
  - `"follows the same anchor without writing anything"` (на телефоне с `toolbarTop` и на Mac): `follow(anchor)`, затем `MutationObserver` (`attributes`, `subtree`) на родителе и `body`, второй `follow(anchor)` → `takeRecords()` пуст.
  - `"reads the layout before it writes"`: шпион на `Element.prototype.getBoundingClientRect`, в нём `observer.takeRecords().length` складывается в `readsAfterWrite`; `follow` с новым anchor на Mac и на телефоне → `readsAfterWrite` = 0 (панель закрыта).
- [ ] **Step 2:** `npx vitest run tests/ui/QuickBar.test.ts` — FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Quick bar: the place and the panel are drawn again only when they change; it measures before it moves`.

### Task 6: Буква, прокрутка и `transitionend` — один проход в кадр

**Files:**
- Create: `src/ui/FramePass.ts`
- Modify: `src/ui/quick/QuickEntryController.ts`
- Test: `tests/ui/FramePass.test.ts` (новый), `tests/ui/QuickEntryController.test.ts`

**Interfaces:**
- `export interface Frames { request(run: () => void): number; cancel(id: number): void }`.
- `export class FramePass { constructor(run: () => void, frames: Frames = { request: (f) => requestAnimationFrame(f), cancel: (id) => cancelAnimationFrame(id) }); ask(): void; now(): void; cancel(): void }` — `ask` ставит один кадр, сколько бы раз ни звали до него; `now` снимает поставленный кадр и выполняет сразу; `cancel` снимает.
- Контроллер: `private readonly pass = new FramePass(() => this.followField())`; `private followField(): void` — если есть `state`: rect корня и прокрутчика читаются один раз и передаются в `bringIntoSight(state, view, box)` (если `follow`) и `followBar(state, view, box)`; rect поля читается заново, только если `bringIntoSight` сдвинул прокрутку. `roomOf(state, view, box)` принимает готовые rect.
- Кто что зовёт:
  - `onInput`: `entry.type(text)`, `follow = true`, `pass.ask()`;
  - `changed` без сдвига строк: `sync(state)` + `pass.ask()`; `onPriority` поля: `sync` + `pass.ask()`;
  - `sync(state)` больше не зовёт `followBar`;
  - `scrolled`: проверка `follow` по `revealedAt` — синхронно, как сейчас; `followBar` → `pass.ask()`;
  - `settled` (`transitionend`): `pass.ask()`, без фильтра;
  - `rendered()`: `sync`, фокус как сейчас, затем `pass.now()` (в т.ч. когда поле не подключено — раньше `followBar` шёл из `sync`);
  - `reveal()` (вид: `onResize`): `pass.now()`;
  - `close()` и `changed(null)`: `pass.cancel()`.

- [ ] **Step 1: Тесты**
  - `FramePass`: `"runs once in the next frame however often it is asked"`, `"now runs at once and drops the frame asked"`, `"cancel drops the frame"` — ручная очередь `Frames`.
  - Контроллер (в `setUp` — `vi.stubGlobal("requestAnimationFrame", …)` / `cancelAnimationFrame` на ручную очередь и помощник `runFrames()`; в `afterEach` — `vi.unstubAllGlobals()`):
    - `"ten letters measure nothing until the frame, then once"`: открыть поле, `runFrames()`, шпион на `getBoundingClientRect`; 10 × `type(...)` → шпион 0 вызовов, в очереди один кадр; `runFrames()` → число вызовов равно числу после одной буквы (отдельный прогон в том же тесте).
    - `"a burst of transitionend moves the bar once"`: 20 × `transitionend` на дочернем элементе корня → один кадр в очереди.
    - `"scrolls in one frame are one pass"`: 5 × `scroll` на списке → один кадр.
  - Существующие тесты, проверяющие положение бара или прокрутку сразу после `type`/`scroll`/`transitionend` (`"on the desktop"`, `"a list the finger scrolled away from the field"`), получают `runFrames()` перед проверкой; ожидаемые значения не меняются.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** Commit `Quick entry: a letter, a scroll or a settling card moves the field and the bar once a frame`.

### Task 7: Панель клавиатуры и строка статуса ищутся, только когда пропали

**Files:**
- Create: `src/ui/quick/ObsidianChrome.ts`
- Modify: `src/ui/TaskCalendarView.ts` (убрать `keyboardToolbarTop`/`statusBarTop`, `TaskCalendarView.ts:984-995`)
- Test: `tests/ui/ObsidianChrome.test.ts` (новый)

**Interfaces:**
- `export class ObsidianChrome { constructor(doc: Document); toolbarTop(): number | null; statusBarTop(): number }` — те же селекторы и правила `height > 0`, что сейчас; найденный элемент хранится и ищется заново, только если его нет или `!isConnected`.
- Вид: `const chrome = new ObsidianChrome(root.ownerDocument)`; `chromeTop: () => chrome.statusBarTop()`, `toolbarTop: () => chrome.toolbarTop()`.

- [ ] **Step 1: Тесты**: `"finds the keyboard's toolbar once while it stays"` (шпион на `document.body.querySelector`, 10 × `toolbarTop()` → 1 поиск); `"finds it again once it is gone"` (удалить, добавить новый → новый rect); `"Infinity without a status bar, null without a toolbar"`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать и подключить.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Obsidian's keyboard toolbar and status bar are looked up only when they are gone`.

### Task 8: Проверка (ведущий)

- [ ] Тестовый Obsidian (порт 9333, свой vault), сборка ветки. Через CDP обернуть счётчиками: `view.draw` (приватный, доступен в JS; записывать набор частей), `Element.prototype.getBoundingClientRect`, события `focus`/`blur`/`focusin`/`focusout` на `document` (capture).
  - Enter в конце «Now» с непустым текстом, после разрешения записи: `draw` — 2 вызова, оба `{"tasks"}`; `focus`/`blur` — 0; `document.activeElement` и узел `.tc-quick-field` — те же объекты, что до Enter. 5 Enter подряд быстро — карточки в порядке ввода, ни в одном кадре строка не видна дважды.
  - Буква: между `input` и концом обработчика — 0 `getBoundingClientRect`; за кадр — один проход (≤ числа после одной буквы при 10 буквах в кадре через `Input.insertText`).
  - Узел `svg` в `.tc-bar-place` — тот же после 10 букв; открытая панель места не пересобирается при наборе.
  - Слайд колонок при открытом поле: число проходов = число кадров с `transitionend`, не число событий.
- [ ] Телефон (390×844, `app.emulateMobile(true)`): набрать 5 задач подряд с Enter в каждой колонке, в слоте таймлайна, в стопке меню календаря; Tab/Shift+Tab; кнопка места (поле переезжает в другую колонку и остаётся в фокусе). Клавиатурная панель держится над тулбаром, прокрутка не дёргается.
- [ ] Mac: то же с капсулой у поля и панелями уровня и места (панель открыта во время набора, префикс `p1 ` меняет уровень — панель следует).
- [ ] Светлая и тёмная; скриншоты одних и тех же состояний (поле с текстом, очередь из двух строк, открытая панель) на master и на ветке совпадают.
- [ ] Итог в спеку, строка в таблицу обзора.
