# Блок 3 «Жесты без лишних замеров» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** на движении пальца ни один обработчик не читает раскладку после своей записи и не делает работу, когда привязанное значение (место, минута, слот, границы зума) то же; размер карточки читается без `getComputedStyle`; растягивание отпускает экран до записи.

**Architecture:** каждый горячий обработчик сначала один раз читает то, что ему нужно (`ListFrame` списка, кеш рамки таймлайна на время жеста), потом пишет — и только изменившееся. Положения карточек списка меряются один раз на вход в список через `offsetTop`/`offsetHeight` (не зависят от transform), прокрутка учитывается через `scrollTop`. Размер карточки — переменная модуля `cardSize`.

**Tech Stack:** TypeScript, vitest + happy-dom, Obsidian API.

**Spec:** `docs/superpowers/specs/2026-11-03-perf-3-gestures-design.md`

## Что в спеке уже не так (сверено с master 432ec5c)

- Номера строк сдвинулись: правило сдвига карточек — `styles.css:707` (не 723); растягивание — `DragController.ts:353-390`; `Timeline.showDrop/placeDrop` — `Timeline.ts:282-302`; `visibleHeight` — `Timeline.ts:173-175`, `layout` — `242-264`; границы пинча — `PinchZoom.ts:55-57` + `TaskCalendarView.ts:332-340, 655-658`; `touchmove` — `TaskCalendarView.ts:409-412`; `wheel` в `Swipe` — `Swipe.ts:99` (файл переписан под swipe-follow).
- **Перетаскивание на таймлайн: «выход, если начало не изменилось» в буквальном виде не делаем.** Линия цели стоит в координатах окна (`placeDrop`, `.tc-drop` в `body`); пока автопрокрутка двигает таймлайн под неподвижным пальцем, привязанная минута та же, а линия обязана ехать вместе с сеткой. Полный выход заморозил бы её — это изменение вида. Вместо этого: текст пилюли пишется только при смене минуты, положение — только при смене пикселя, замеры — из кеша жеста (Task 5).
- **`wheel` в `Swipe` остаётся непассивным на корне вида.** `preventDefault` нужен: горизонтальная прокрутка трекпадом иначе уходит в прокручиваемые предки (списки — `overflow-y: auto`, значит и по x прокручиваются) и в жест «назад» Electron; глайд после шага тоже глушится (`Swipe.ts:108`). Свайп принимается в любой точке вида, кроме полей ввода (`swipeStartsAt`), так что корень — и есть самый узкий элемент. Chromium блокирует прокрутку только на первом `wheel` последовательности, дальше события некэнселабельны — выигрыш от переноса был бы ничтожен. Пункт снят.
- `touchmove` на корне остаётся непассивным — снято самой спекой. Pull-to-refresh убран в 0.4.69 — снято спекой.
- Дополнение, которого нет в спеке, но без которого «сначала чтения» не выполняется: `DropGap.show`, `DropLine.show` и `AutoScroll.follow` сами читают rect списка после записей `arrange()`; `ListDrop.indent()` зовёт `getComputedStyle` (через `tokenPx`) несколько раз за движение; `Timeline.zoomTo` пишет `--tc-room-top/bottom` (`setRoom(0, 0)`) и сразу читает rect — на каждом кадре пинча. Всё это входит в задачи ниже.

## Global Constraints

- Вид, анимации, пороги, длительности, вибро-отклик не меняются ни на пиксель (обзор, «Общие правила»).
- `src/settings.ts` и `src/application/contracts.ts` не меняются; всё — внутри `src/ui`.
- В `styles.css` — только `var(--tc-…)`, никаких голых чисел (`tests/styles.test.ts`).
- Тесты фиксируют выигрыш счётчиками (шпионы на `getBoundingClientRect`, `getComputedStyle`, геттеры `offset*`, `setProperty`, `MutationObserver.takeRecords()`), не временем.
- Стиль кода как в соседних файлах; комментарии короткие, английские, только где нужны.
- `npm test`, `npm run build`.

## Review Focus

1. Снятие `is-moved` у карточки, чей `--tc-room` стал 0: transform уходит в `none` и переход возвращает её в 0 с той же длительностью и кривой (переход между `translateY(Npx)` и `none` анимируется как к единичной матрице). Проверить на телефоне, что возврат не обрывается и не мигает, в т.ч. при уходе пальца из списка (`leave`) и в конце (`clear`, снятие `is-making-room`).
2. Перевод `offset*` → клиентские пиксели: `box.top + clientTop + offsetTop − scrollTop`. Проверить список с полем быстрого ввода внутри (`.tc-quick-row` не в `elements`, но занимает место), с подзадачами (`margin-left` входит в `offsetLeft`), во время автопрокрутки.
3. Растягивание: экран отпущен до записи; часть экрана, отложенная во время жеста (например, опрос календаря), рисуется сразу — блок обязан остаться растянутым, пока не придут задачи с новым слотом. Запись, упавшая с `StaleTaskError` (данные те же, `DayData` молчит), возвращает блок.
4. Линия цели на таймлайне едет с сеткой при автопрокрутке, даже когда минута не меняется.
5. Кеш рамки таймлайна живёт только пока есть цель или растягивание; после слайда колонок следующий жест меряет заново.

---

### Task 1: Размер карточки без чтения стилей

**Files:**
- Modify: `src/ui/cardSize.ts`
- Test: `tests/ui/cardSize.test.ts` (новый)

**Interfaces:**
- Модульная переменная `let shown: CardSize = { height: DEFAULT_SETTINGS.cardHeight, gap: DEFAULT_SETTINGS.cardGap }`.
- `showCardSize(size)` — как сейчас пишет оба свойства на `body` и ставит `shown = { height: size.height, gap: size.gap }` (новый объект на каждый вызов: `ListDrop` сравнивает по ссылке).
- `clearCardSize()` — как сейчас снимает свойства и возвращает `shown` к значениям по умолчанию.
- `shownCardSize(): CardSize` — возвращает `shown`; `tokenPx`/`PROPERTY` больше не импортируются, если не нужны.

- [ ] **Step 1: Тесты** (`afterEach(clearCardSize)`):
  - `"gives the settings' defaults before any size is shown"` → `{ height: DEFAULT_SETTINGS.cardHeight, gap: DEFAULT_SETTINGS.cardGap }`.
  - `"gives the size last shown without reading the styles"`: `const style = vi.spyOn(window, "getComputedStyle")`; `showCardSize({ height: 44, gap: 6 })`; 100 вызовов `shownCardSize()` → `{ height: 44, gap: 6 }`, `style` не вызван; `document.body.style.getPropertyValue("--tc-card-h")` = `"44px"`.
  - `"goes back to the defaults once cleared"`.
- [ ] **Step 2:** `npx vitest run tests/ui/cardSize.test.ts` — FAIL (второй тест: шпион вызван).
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** Commit `Card size: kept where it is set, not read back from the styles`.

### Task 2: Список меряется один раз на вход

**Files:**
- Create: `src/ui/drag/listFrame.ts`
- Modify: `src/ui/drag/ListDrop.ts`, `src/ui/drag/DropGap.ts`, `src/ui/drag/DropLine.ts`, `src/ui/drag/AutoScroll.ts`, `src/ui/drag/TimelineDrop.ts` (только вызов `follow`)
- Test: `tests/ui/ListDrop.test.ts`, `tests/ui/AutoScroll.test.ts`

**Interfaces:**
- `listFrame.ts`:
  - `export interface ListFrame { readonly box: DOMRect; readonly scrollTop: number; readonly scrollLeft: number; readonly clientTop: number; readonly clientLeft: number }`
  - `export function readFrame(el: HTMLElement): ListFrame` — один `getBoundingClientRect` и четыре свойства.
  - `export function toContent(frame: ListFrame, clientX: number, clientY: number): { x: number; y: number }` и `export function toClient(frame: ListFrame, x: number, y: number): { x: number; y: number }` — `client = box + client* + content − scroll*` и обратно.
- `DropGap.show(rect: DOMRect, visible: boolean, frame: ListFrame)` и `DropLine.show(left: number, right: number, y: number, frame: ListFrame)` — переводят через `toContent`, сами rect списка не читают. `void el.offsetWidth` для свежего `DropGap` остаётся (запуск появления, раз на показ).
- `AutoScroll.follow(y: number, box: DOMRect)` — rect прокручиваемого элемента приходит от вызывающего; `TimelineDrop` передаёт rect таймлайна (до Task 5 — `this.timeline.el.getBoundingClientRect()`, прочитанный до `show`).
- `ListDrop`:
  - `Layout` хранит положения в пикселях содержимого списка: для карточки `{ entry, top, left, width, height }` (`top = offsetTop − removed`, `left = offsetLeft`), для заголовка — как сейчас `PlacedHead` с `top` в пикселях содержимого; плюс `nodes` (ссылка `list.elements`), `size` (ссылка `shownCardSize()`), `width` (`frame.box.width`), `indent` (`tokenPx` один раз).
  - `private layoutFor(frame: ListFrame): Layout` — отдаёт сохранённый, пока `nodes === list.elements && size === shownCardSize() && width === frame.box.width`, иначе меряет заново только через `offsetTop/offsetLeft/offsetWidth/offsetHeight`. Функция `translateY` и её `getComputedStyle` удаляются; `rect` карточек и заголовков не читается вовсе.
  - `preview(x, y, drag)`: первой строкой `const frame = readFrame(this.list.el)` — единственное чтение rect списка за движение; дальше `placed`, `gapRect`, `lineRect`, `baseLeft`, `cardLevel`, `newTaskLevel`, `indent` получают `frame` (и/или `layout`) параметром и в клиентские пиксели переводят через `toClient`; `gap.show(…, frame)`, `line.show(…, frame)`, `scroll.follow(y, frame.box)`.
  - `landing()`, `leave()`, `drop()` читают один свежий `frame` в начале.
  - Снятие `is-waiting` в начале `preview` — только если `leave()` его ставил (флаг `waiting`), не на каждом движении.
  - `reset()` больше не обнуляет `layout` (его держит ключ); `clear()` обнуляет.

- [ ] **Step 1: Тесты.** `setup()` в `ListDrop.test.ts` перевести с подмены `getBoundingClientRect` у узлов на `Object.defineProperties(node, { offsetTop: { get: () => i * 40 }, offsetHeight: { value: 35 }, offsetLeft: { value: 0 }, offsetWidth: { value: 175 } })` (геттер `offsetTop` считает чтения); rect `list.el` и `area` оставить. Существующие ожидания не меняются. `AutoScroll.test.ts`: `follow(y)` → `follow(y, rect)` с тем rect, что подменён сейчас. Новые, в `describe("measuring once (block 3)")`, список из 30 карточек, одна поднята:
  - `"measures each card once over a whole drag: 50 moves read no card's rect and no computed style"`: шпион `vi.spyOn(HTMLElement.prototype, "getBoundingClientRect")` — ни одного вызова с `this` из `list.elements`; `vi.spyOn(window, "getComputedStyle")` — не больше одного вызова (отступ подзадачи при замере); `offsetTop` каждой карточки прочитан ровно один раз.
  - `"reads the list's own rect once per move"`: `list.el.getBoundingClientRect = vi.fn(...)`; 50 `preview` → 50 вызовов.
  - `"follows a scroll by scrollTop, not by measuring again"`: `preview` над серединой карточки 5, затем `scrollTop = 40` и `preview` в той же точке → место на одну карточку дальше; новых чтений `offsetTop` нет.
  - `"measures again once the list is drawn anew"`: `list.render()` посреди перетаскивания → следующий `preview` читает `offsetTop` новых узлов.
- [ ] **Step 2:** `npx vitest run tests/ui/ListDrop.test.ts tests/ui/AutoScroll.test.ts` — новые FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS; `npx tsc --noEmit` чистый.
- [ ] **Step 5:** Commit `List drop: the cards are measured once a drag, the list's box once a move; nothing reads the layout after writing it`.

### Task 3: Сдвиг пишется только изменившимся карточкам

**Files:**
- Modify: `src/ui/drag/ListDrop.ts` (`arrange`), `styles.css` (строка 707)
- Test: `tests/ui/ListDrop.test.ts`, `tests/styles.test.ts`

**Interfaces:**
- `const MOVED = "is-moved"` (класс в коде и CSS больше нигде не встречается — проверено поиском).
- `private readonly rooms = new Map<HTMLElement, number>()` — последнее записанное значение `--tc-room` узла. `arrange()`:
  - шаг `shownCardSize()` читается один раз;
  - для каждого узла значение считается как сейчас; если `rooms.get(node) !== value` — `setProperty(PROPERTY.room, px(value))`, `classList.toggle(MOVED, value !== 0)`, запись в карту; `SHIFTED` — как сейчас, `toggle` с силой;
  - ветка «ни комнаты, ни поднятых» снимает свойство, `MOVED` и `SHIFTED` только у узлов из карты и чистит её;
  - при новом `nodes` (Task 2) карта очищается.
- CSS, строка 707: `.tc-list.is-making-room > .tc-card, .tc-list.is-making-room > .tc-group-head { transform: translate3d(0, var(--tc-room), 0); }` → `.tc-list.is-making-room > .tc-card.is-moved, .tc-list.is-making-room > .tc-group-head.is-moved { transform: translateY(var(--tc-room)); }`. Переходы `transform` у `.tc-card` и `.tc-group-head` не трогать; комментарий над правилом (строка 704) дополнить: двигаются только сдвинутые.

- [ ] **Step 1: Тесты**:
  - `"writes the room only into the cards whose room changed"`: после первого `preview` повесить `vi.spyOn(CSSStyleDeclaration.prototype, "setProperty")`; `preview` в соседнюю щель → `setProperty` с `"--tc-room"` вызван ровно для одного узла (того, что перешёл через щель); `preview` в ту же щель → ни одного вызова.
  - `"marks as moved only the cards drawn off their place"`: поднята карточка 1 из 4, палец над щелью 3 → у каждого узла `is-moved` ⇔ его `--tc-room` (хелпер `room(list)`) не `"0px"`; у поднятой и у карточки 0 — нет.
  - `"stands as drawn after the drag: no room and no mark left"`: после `clear()` ни у одного узла нет `is-moved` и `--tc-room`.
  - `styles.test.ts`: `"moves only the cards a drag draws off their place, flat"` — правило с `var(--tc-room)` одно, его селектор содержит `.is-moved`, значение — `translateY(var(--tc-room))`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** Commit `List drop: only the cards that move get a transform, flat, and only when their room changes`.

### Task 4: Сессия: сначала цели, потом плавающая карточка

**Files:**
- Modify: `src/ui/drag/DragSession.ts` (`move`)
- Test: `tests/ui/DragSession.test.ts`

**Interfaces:**
- `move(x, y)`: `hitTest` целей (`find`) → `leave` прежней при смене → `target?.preview` → `float.moveTo(x, y)` последним. Плавающая карточка — `position: fixed` в `body`, на места и замеры целей не влияет.

- [ ] **Step 1: Тест** `"reads the targets before it moves the float"`: цель-заглушка и float-заглушка пишут в общий журнал `hit`/`preview`/`float`; два `move` → `["hit", "preview", "float", "hit", "preview", "float"]`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** PASS.
- [ ] **Step 5:** Commit `Drag session: the targets read first, the float is written last`.

### Task 5: Таймлайн: рамка на жест, запись только изменившегося

**Files:**
- Modify: `src/ui/Timeline.ts`, `src/ui/drag/TimelineDrop.ts`
- Test: `tests/ui/Timeline.test.ts`, `tests/styles.test.ts`

**Interfaces:**
- В `Timeline` — `private frame: { readonly view: DOMRect; readonly canvasAt: number } | null` (`canvasAt = canvas.getBoundingClientRect().top + el.scrollTop` в момент замера) и `private measured(): { view: DOMRect; canvasTop: number }`: пока есть цель (`this.drop`) или растягивание (`this.stretch`) — берёт сохранённое (замеряет лениво один раз), иначе меряет заново и не сохраняет; `canvasTop = canvasAt − el.scrollTop` (прокрутка учитывается чтением `scrollTop`, не новым rect). Сбрасывается в `clearDrop()`, когда `stretch` становится `null`, в `setRoom` при изменении значений и в колбэке `ResizeObserver`.
- `minutesAt(clientY)` и `placeDrop()` берут rect только через `measured()`.
- `showDrop(span)`: сначала `measured()` и расчёт `y` (чтения), потом записи; текст пилюли пишется только при смене `span.start`; `placeDrop` пишет `--tc-y`, `left`, `width`, `is-hidden` только при смене значения (последние записанные хранятся в полях).
- `setRoom(top, bottom)`: пишет, только если значения отличаются от последних записанных (иначе `zoomTo` на каждом кадре пинча пишет `0px` и тут же читает rect).
- `layout()`: `--tc-hour` пишется на `this.canvas`, не на `this.el`, и только при смене значения. Единственное правило с `var(--tc-hour)` — `.tc-canvas` (`styles.css:787`, проверено поиском).
- Публичный `Timeline.viewBox(): DOMRect` — `measured().view`. `TimelineDrop.preview`: `minutesAt` и `viewBox()` (для `scroll.follow(y, box)`) читаются до `show`.

- [ ] **Step 1: Тесты** (`Timeline.test.ts`, хелперы рендера — существующие):
  - `"measures itself once for a whole drop, following a scroll by scrollTop"`: подменить `el.getBoundingClientRect` и `canvas.getBoundingClientRect` на `vi.fn`; `showDrop` + 20× (`minutesAt(300)`, `showDrop`) с изменением `el.scrollTop` (через `Object.defineProperty`, как в `ListDrop.test.ts`) → каждый rect вызван один раз; `minutesAt(300)` после `scrollTop += 56` больше на 60; после `clearDrop()` следующий `minutesAt` меряет снова.
  - `"writes the drop's time only when its minute changes"`: `MutationObserver` на `.tc-drop` (`childList`, `characterData`, `subtree`); 10× `showDrop` с тем же `start` → `takeRecords()` пуст после первого.
  - `"moves the drop line with the day under a still minute"`: `showDrop` с тем же `start`, `scrollTop += 20` → `--tc-y` линии меньше на 20.
  - `"sets the hour on the canvas, the only rule that reads it"`: после `render()` — `canvas.style.getPropertyValue("--tc-hour")` = `"56px"`, у `el` пусто.
  - `"keeps the room as it is while a pinch zooms"`: шпион `canvas.style.setProperty`; два `zoomTo` подряд → `--tc-room-top` записан не больше одного раза.
  - `styles.test.ts`: `"reads the hour only on the canvas"` — все правила с `var(--tc-hour)` имеют селектор `.tc-canvas`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** Commit `Timeline: measured once a gesture, the drop's time and place written only when they change, the hour set on the canvas`.

### Task 6: Растягивание: шаг сетки и экран до записи

**Files:**
- Modify: `src/ui/drag/DragController.ts` (`beginResize`), `src/ui/Timeline.ts` (`Stretch`, `render`, `stretchTo`)
- Test: `tests/ui/DragController.test.ts`, `tests/ui/Timeline.test.ts`

**Interfaces:**
- `beginResize` → `move`: после расчёта `start`/`end` — выход, если оба равны записанным в последний `stretchTo`.
- `finish`: `this.deps.arbiter.release(RESIZE)` сразу после снятия слушателей, до `await onResize`; затем `try { await onResize(...) } finally { timeline.endStretch(item.key) }`; ветка «без изменений» — как сейчас `stretchTo(block, null, edge)`.
- `Timeline`:
  - `Stretch` получает `key: TaskKey` и `from: Slot` (слот задачи при начале растягивания, из `this.tasks` по `el`).
  - `render()`: растягивание переживает перерисовку, пока задача с тем же ключом есть и её `slot` равен `from` (новых задач ещё нет) — `el` переносится на новый блок, ему ставится `is-resizing`; иначе `stretch = null`.
  - `endStretch(key: TaskKey): void` — снимает растягивание, только если оно на задаче `key` (иначе новый жест, начатый пока шла запись, не трогается), и раскладывает задачи.

- [ ] **Step 1: Тесты**:
  - `DragController`: `"stretches the block once per grid step, not per pixel"`: `deps.timeline` — заглушка (`minutesAt: (y) => y`, `shownSpan`, `stretchTo: vi.fn()`, `slotAt`, `hourPx`, `endStretch: vi.fn()`), `step: () => 15`; задача `600–660`; `grip(block, item, "end", down)` и 30 `pointermove` с `clientY` в пределах 653–667 (`snapMinutes` округляет к ближайшему шагу → 660) → `stretchTo` вызван 1 раз (начальный); `pointermove` 676 → 2.
  - `DragController`: `"frees the screen before the change is written"`: `onResize` возвращает неразрешённый промис; после `pointerup` → `arbiter.busy === false`, `endStretch` не вызван; после разрешения → `endStretch` вызван с ключом задачи.
  - `DragController`: `"puts the block back when the write fails"`: `onResize` отклоняется → `endStretch` вызван.
  - `Timeline`: `"keeps a block stretched across a redraw until its new time comes"`: `stretchTo(block, { start: 600, end: 720 }, "end")`, `render()` с тем же слотом → новый блок задачи с `is-resizing` и длиной 120 мин; `render()` с задачей на `600–720` → без `is-resizing`.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS.
- [ ] **Step 5:** Commit `Resize: the stack follows the grid's steps, not every pixel; the screen is free while the change is written`.

### Task 7: Пинч: границы на жест

**Files:**
- Modify: `src/ui/PinchZoom.ts`, `src/ui/TaskCalendarView.ts` (опции `PinchZoom`)
- Test: `tests/ui/PinchZoom.test.ts`

**Interfaces:**
- `PinchZoomOptions`: `min()` и `max()` заменяются на `bounds(): { readonly min: number; readonly max: number }`.
- `PinchZoom` хранит `private limits: { min: number; max: number } | null`: берёт `bounds()` при начале пинча (вторым пальцем, после `claim`) и на первом `wheel` серии (когда `lastAnchor === null`); `clamp` читает `limits`; обнуляется в `end()` и в таймере конца серии колеса.
- Вид: `bounds: () => { const levels = this.zoomLevels(); return { min: levels[0].hourPx, max: levels[levels.length - 1].hourPx }; }` — `zoomLevels()` (и с ним `visibleHeight`: `clientHeight` + `getComputedStyle`) один раз на жест вместо трёх на движение.

- [ ] **Step 1: Тесты**: существующие хелперы перевести на `bounds: () => ({ min: 28, max: 224 })`; новые:
  - `"takes its bounds once a pinch"`: `bounds = vi.fn(...)`; два пальца, 30 движений → `bounds` вызван 1 раз; масштаб по-прежнему зажат (`"keeps within its bounds"` не меняется).
  - `"takes its bounds once a run of the wheel"`: 10 `wheel` с `ctrlKey` → 1; `vi.advanceTimersByTime(150)`, ещё `wheel` → 2.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `Pinch: the zoom's bounds are read once a gesture`.

### Task 8: Секция и массовое меню

**Files:**
- Modify: `src/ui/drag/GroupDrag.ts` (`lift`, `moveTo`), `src/ui/menu/BulkMenu.ts` (конструктор, `lift`)
- Test: `tests/ui/GroupDrag.test.ts`, `tests/ui/BulkMenu.test.ts` (новый)

**Interfaces:**
- `GroupDrag.moveTo`: плавающая секция двигается всегда; метка переставляется, только если `slot` отличается от слота, при котором она последний раз ставилась/снималась (`let marked: number | null`).
- `BulkMenu`: конструктор сначала читает rect всех `context.cards` (`const rects = context.cards.map((card) => card.getBoundingClientRect())`), потом создаёт копии; `lift(card, rect)` принимает готовый rect. Условие «вне экрана — без копии» прежнее.

- [ ] **Step 1: Тесты**:
  - `GroupDrag`: `"moves the mark only when the slot changes"`: список с тремя секциями (по образцу `ListDrop.test.ts`), rect заголовков подменены; `attach`, `pointerdown` на заголовке, `vi.advanceTimersByTime(longPressMs)` (по образцу `LongPress.test.ts`); `MutationObserver` на `taskList.el` (`childList`); 20 `pointermove` внутри одного слота → `takeRecords()` пуст после первого; движение к другому слоту → одна перестановка.
  - `BulkMenu`: `"measures every picked card before it lifts any"`: 5 карточек в `body`, у каждой `getBoundingClientRect` записывает `document.querySelectorAll(".tc-lifted").length`; `BulkMenu.open(...)` (контекст — заглушки, по образцу полей `BulkMenuContext`) → все записи `0`, копий 5.
- [ ] **Step 2:** FAIL.
- [ ] **Step 3:** Реализовать.
- [ ] **Step 4:** `npm test` — PASS, `npm run build` — OK.
- [ ] **Step 5:** Commit `A section's mark moves only to another slot; the bulk menu measures the cards before it lifts them`.

### Task 9: Проверка (ведущий)

- [ ] Тестовый Obsidian (порт 9333, свой vault), сборка ветки. Через CDP обернуть `Element.prototype.getBoundingClientRect`, `window.getComputedStyle` и `Timeline.prototype.layoutTasks` счётчиками; имитировать жесты событиями `PointerEvent` на `document`:
  - перетаскивание карточки по списку из 30 карточек, 50 движений: rect карточек — 0, `getComputedStyle` ≤ 1, rect списка — по одному на движение (+ `hitTest`);
  - растягивание блока за обе точки, 30 движений внутри шага: `layoutTasks` — 0 после первого;
  - цель на таймлайне с автопрокруткой у края: rect канвы и таймлайна — по одному на жест; линия едет с сеткой;
  - пинч (Ctrl+колесо на Mac, два пальца в виде телефона): `getComputedStyle` — один раз на жест (границы) + при отпускании;
  - секция: метка переставляется только при смене слота; массовое меню на 20 карточках: в Performance один Layout при открытии.
- [ ] Запись Performance при CPU ×6, перетаскивание с автопрокруткой: нет «Forced reflow» на каждом движении; промежутки между кадрами во время перетаскивания (rAF-метки) — сравнить с master.
- [ ] Пиксель в пиксель: скриншоты одного и того же состояния перетаскивания (комната открыта, палец над карточкой, после отпускания) на master и на ветке совпадают; анимация возврата карточек при уходе пальца из списка и в конце не обрывается.
- [ ] Визуально, телефон (390×844, `app.emulateMobile(true)`) и Mac, светлая и тёмная: перетаскивание по длинному списку с автопрокруткой, между колонками, на таймлайн; растягивание блока за обе точки (в том числе запись, упавшая из-за изменённого файла); перетаскивание секции; массовое меню; пинч на телефоне и трекпаде; обычная прокрутка списков и таймлайна; горизонтальный свайп трекпадом.
- [ ] Итог в спеку, строка в таблицу обзора.
