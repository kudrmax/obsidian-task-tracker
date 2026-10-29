# Task Calendar MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Плагин Obsidian: слева список задач выбранного дня, справа таймлайн дня с событиями Google и рабочего календаря или список Soon, перетаскивание между ними, один markdown-файл как истина, экран пиксель в пиксель по `docs/design/canvas/Screen.dc.html`.

**Architecture:** `domain` (чистые функции над текстом файла: разбор, сериализация, правила, операции, выборки), `application` (`contracts.ts` — API для UI; `TaskServiceImpl` поверх порта `TaskFileStore`; `CalendarServiceImpl` над двумя источниками), `infrastructure` (vault, Google OAuth и API, файл Scriptable), `ui` (вид, список, таймлайн, перетаскивание на Pointer Events, зум щипком, меню). Два потока работы идут параллельно в своих worktree: **B** (backend: domain, application, infrastructure, вкладка настроек) и **C** (frontend: ui, styles.css, main.ts), стыкуясь только через `src/application/contracts.ts`, `src/application/ports.ts` и `src/settings.ts`, которые уже написаны и в потоках не меняются. Поток **D** (интеграция) собирает оба.

**Tech Stack:** TypeScript 7, esbuild, vitest 5 (happy-dom для ui-тестов), obsidian API 1.13. Без runtime-зависимостей. FullCalendar не используется.

**Spec:** `docs/superpowers/specs/2026-10-30-task-calendar-design.md` и `docs/design/README.md` (макеты в `docs/design/canvas/`). Где они расходятся, правы макеты.

## Global Constraints

- Один файл задач, путь `settings.tasksFile` (по умолчанию `TODOs Tasks.md`); секции `## Inbox / ## Now / ## Soon / ## Backlog / ## Done`, имена из `settings.sections`. Inbox и Backlog не читаются и не меняются.
- Строка задачи: `- [ ] Текст 📅 YYYY-MM-DD ⏰ YYYY-MM-DD HH:MM-HH:MM`; поля в конце в любом порядке; маркеры из `settings.dueDateMarker` / `settings.slotMarker`; статусы `[ ]` todo, `[/]` inProgress, `[x]` done, `[-]` cancelled; другой символ читается как todo и пишется обратно как был.
- Всё, что не задача, сохраняется байт в байт; неизменённая задача пишется исходной строкой байт в байт; вложенные строки переезжают с задачей.
- Три правила нормализации (спека §4.4) идемпотентны, порядок 1 → 2 → 3, одна запись, запись только при изменении.
- Запись в файл только через `TaskFileStore.write(fn)` (`vault.process`); идентичность задачи — `TaskKey` (секция, индекс, raw), несовпадение → `StaleTaskError`.
- Контракты `src/application/contracts.ts`, `src/application/ports.ts`, `src/settings.ts` в потоках B и C не редактируются; нужное изменение — сообщить оркестратору.
- `ui` импортирует только `application/contracts`, `application/ports`, `settings` и `obsidian`; никакого `domain`, никакого `infrastructure`.
- Экран пиксель в пиксель по `docs/design/README.md`; все значения в токенах `--tc-…` в `styles.css`; `tests/styles.test.ts` (как в `../obsidian-friends-tracker/tests/styles.test.ts`) не пускает голые числа и цвета в правила.
- Весь Node-код (loopback-сервер OAuth) в одном модуле `src/infrastructure/GoogleLoopbackLogin.ts`, вызывается только при `Platform.isDesktop`. `isDesktopOnly: false`.
- Долгое нажатие `settings.longPressMs` (250) на телефоне, на Mac перетаскивание сразу; тактильная отдача (Capacitor Haptics impact light, как в `../obsidian-button-haptics/src/infrastructure/HapticFeedback.ts`) на старте перетаскивания и при броске.
- Сборка никогда не копируется в `~/Obsidian`; проба в отдельном Obsidian на порту 9333 (CLAUDE.md).
- Удаление файлов только `trash`. Коммиты в ветке потока (`mvp-backend`, `mvp-frontend`), не в `mvp` и не в `master`.
- Текст интерфейса на английском (`Today`, `Tomorrow`, `Yesterday`, `New task`, `In progress`, `Done`, `Cancel`, `Due date`, `Rename`, `Delete`).

## Review Focus

1. Файл задач, где строка `- [ ] Текст ⏰ 2026-10-30 25:00-26:00` или `📅 2026-13-40` (битое поле): поле не распознаётся, строка читается как задача с этим хвостом в тексте, при записи остаётся байт в байт. Тест в Task B1.
2. Задача с вложенными строками стоит последней в Now, а за ней без пустой строки идёт `## Soon`: переезд задачи забирает вложенные строки и не трогает заголовок. Тест в Task B2 и B3.
3. Файл меняется руками между `dayView` и `setStatus` (строка по индексу теперь другая): `StaleTaskError`, файл не изменён, UI показывает Notice и перерисовывается. Тест в Task B6; ручная проба в D2.
4. Слот, уходящий за полночь при растягивании или броске у низа таймлайна: `end` зажимается в 1440, `start` не больше `end − шаг`. Тест в Task B3 (`clampSlot`) и C6.
5. Два пересекающихся события и задача поверх них в одном часе: события делят ширину, задача лежит над ними целиком (`z-index`), ничего не обрезано. Тест в Task C5 (`layoutColumns`).

---

## Поток A: каркас (сделано оркестратором, коммит `00b32f8` в ветке `mvp`)

`package.json`, `tsconfig.json`, `esbuild.config.mjs`, `vitest.config.mts`, `manifest.json` (id `task-calendar`), `versions.json`, `CLAUDE.md`, `src/domain/Task.ts` (типы `LocalDate`, `TaskStatus`, `Slot`, `Task`, `STATUS_CHARS`), `src/application/contracts.ts` (`TaskKey`, `TaskItem`, `DayView`, `TaskService`, `CalendarEvent`, `SourceStatus`, `DayEvents`, `CalendarService`, `StaleTaskError`, `TasksFileMissingError`), `src/application/ports.ts` (`TaskFileStore`, `Clock`, `systemClock`, `SettingsStore`), `src/settings.ts` (`TaskCalendarSettings`, `DEFAULT_SETTINGS`, `settingsFrom`, `LIST_WIDTH_MIN/MAX`, `RightMode`), `src/main.ts` (плагин, реализует `SettingsStore`), `scriptable/Export Work Calendar.js`. `npm test` и `npm run build` зелёные.

---

## Поток B: backend (ветка `mvp-backend`, worktree `.worktrees/backend`)

Порядок задач строгий: каждая следующая использует предыдущую. TDD: тест, красный, код, зелёный, коммит.

### Task B1: LocalDate и строка задачи

**Files:**
- Create: `src/domain/LocalDate.ts`, `src/domain/TaskLine.ts`
- Test: `tests/domain/LocalDate.test.ts`, `tests/domain/TaskLine.test.ts`

**Interfaces:**
- Produces: `localDateOf(d: Date): LocalDate` (локальная дата машины, `YYYY-MM-DD`), `addDays(d: LocalDate, n: number): LocalDate`, `isValidLocalDate(s: string): boolean`, `minutesToHHMM(m: number): string` (`"09:05"`, 1440 → `"24:00"`), `parseHHMM(s: string): number | null`.
- Produces: `interface Markers { dueDate: string; slot: string }`; `interface ParsedTaskLine { indent: string; bullet: string; task: Task }`; `parseTaskLine(line: string, markers: Markers): ParsedTaskLine | null` (null для не-задачи: нет `- [?] ` после отступа; маркер списка `-`, `*` или `+`); `formatTaskLine(parsed: ParsedTaskLine, markers: Markers): string` (`${indent}${bullet} [${statusChar}] ${text}` + ` 📅 date` + ` ⏰ date HH:MM-HH:MM`, в этом порядке, только непустые); `statusOf(char: string): TaskStatus`.

- [ ] **Step 1: Тесты `LocalDate`**

```ts
it("adds days across a month end", () => expect(addDays("2026-10-30", 2)).toBe("2026-11-01"));
it("formats minutes", () => { expect(minutesToHHMM(5)).toBe("00:05"); expect(minutesToHHMM(1440)).toBe("24:00"); });
it("rejects 2026-13-40", () => expect(isValidLocalDate("2026-13-40")).toBe(false));
it("parses 25:00 as null", () => expect(parseHHMM("25:00")).toBeNull());
```

- [ ] **Step 2: Тесты `TaskLine`**

```ts
const M = { dueDate: "📅", slot: "⏰" };
it("parses both fields in any order", () => {
  const p = parseTaskLine("- [/] Сдать отчёт ⏰ 2026-11-02 10:00-11:00 📅 2026-11-03", M)!;
  expect(p.task).toMatchObject({ status: "inProgress", statusChar: "/", text: "Сдать отчёт", dueDate: "2026-11-03", slot: { date: "2026-11-02", start: 600, end: 660 }, children: [] });
});
it("keeps an unknown status char", () => expect(parseTaskLine("- [?] x", M)!.task).toMatchObject({ status: "todo", statusChar: "?" }));
it("keeps a broken field in the text", () => {
  const line = "- [ ] Текст ⏰ 2026-10-30 25:00-26:00";
  const p = parseTaskLine(line, M)!;
  expect(p.task.slot).toBeNull(); expect(p.task.text).toBe("Текст ⏰ 2026-10-30 25:00-26:00");
  expect(formatTaskLine(p, M)).toBe(line);
});
it("keeps indent and bullet", () => expect(formatTaskLine(parseTaskLine("  * [x] Done", M)!, M)).toBe("  * [x] Done"));
it("is not a task", () => { expect(parseTaskLine("- plain item", M)).toBeNull(); expect(parseTaskLine("## Now", M)).toBeNull(); });
it("formats a task with both fields", () => expect(formatTaskLine({ indent: "", bullet: "-", task: { status: "todo", statusChar: " ", text: "A", dueDate: "2026-11-03", slot: { date: "2026-11-02", start: 600, end: 660 }, children: [] } }, M)).toBe("- [ ] A 📅 2026-11-03 ⏰ 2026-11-02 10:00-11:00"));
```

- [ ] **Step 3: Запустить, убедиться что красные** — `npx vitest run tests/domain`
- [ ] **Step 4: Реализовать** `src/domain/LocalDate.ts`, `src/domain/TaskLine.ts`. Разбор полей: с конца текста срезать повторяющиеся хвосты вида `\s+<marker>\s+<date>` и `\s+<marker>\s+<date>\s+<HH:MM>-<HH:MM>`; хвост с невалидной датой или временем не срезается. Маркеры экранировать для RegExp.
- [ ] **Step 5: Зелёные, коммит** `git commit -m "Domain: local dates and task line parsing"`

### Task B2: Документ: секции, разбор и сериализация байт в байт

**Files:**
- Create: `src/domain/TaskDocument.ts`
- Test: `tests/domain/TaskDocument.test.ts`

**Interfaces:**
- Consumes: B1.
- Produces: `interface SectionNamesOf { now: string; soon: string; done: string }`; `interface TaskEntry { readonly section: SectionKey; readonly index: number; readonly raw: string; readonly indent: string; readonly bullet: string; readonly task: Task }`; `class TaskDocument` с `static parse(text: string, sections: SectionNamesOf, markers: Markers): TaskDocument`; `tasks(section: SectionKey): readonly TaskEntry[]`; `allTasks(): readonly TaskEntry[]` (now, soon, done в порядке файла); `hasSection(section): boolean`; `serialize(): string` (идентичен входу, если ничего не менялось); иммутабельные методы, возвращающие новый документ: `insert(section, position: number | "end", task: Task): TaskDocument`, `replace(entry: TaskEntry, task: Task): TaskDocument` (та же строка, raw пересобирается только если task отличается), `removeEntry(entry): TaskDocument` (с вложенными), `moveEntry(entry, section, position: number | "start" | "end"): TaskDocument`, `ensureSections(all: readonly string[]): TaskDocument` (дописывает недостающие `## Имя` в конец, через пустую строку), `static empty(all: readonly string[]): string` (пять секций, каждая `## Имя` и пустая строка).
- Секция задачи: заголовок `## <имя>` (ровно второй уровень, имя сравнивается после `trim`); секция длится до следующего заголовка любого уровня `#`. Задача внутри секции — строка, которую `parseTaskLine` принимает; её вложенные строки — следующие строки с отступом строго больше её отступа (непустые) до первой строки с отступом не больше. Секция может кончаться без пустой строки.

- [ ] **Step 1: Тесты**

```ts
const SECTIONS = { now: "Now", soon: "Soon", done: "Done" };
const TEXT = `---\ntags: [todo]\n---\n# Список\n\n## Inbox\n- [ ] В инбоксе\n\n## Now\n- [ ] Первая\n- [/] Вторая ⏰ 2026-10-30 14:00-15:00\n  - заметка\n  - [ ] подпункт\n## Soon\n- [ ] Третья 📅 2026-11-03\nПросто текст\n\n## Backlog\n- [ ] Бэклог\n\n## Done\n- [x] Готово\n`;
it("round-trips byte for byte", () => expect(TaskDocument.parse(TEXT, SECTIONS, M).serialize()).toBe(TEXT));
it("reads tasks of the three sections only", () => {
  const d = TaskDocument.parse(TEXT, SECTIONS, M);
  expect(d.tasks("now").map((e) => e.task.text)).toEqual(["Первая", "Вторая"]);
  expect(d.tasks("now")[1].task.children).toEqual(["  - заметка", "  - [ ] подпункт"]);
  expect(d.tasks("soon").map((e) => e.task.text)).toEqual(["Третья"]);
  expect(d.tasks("done")).toHaveLength(1);
});
it("moves a task with its children to the start of Done without touching the next heading", () => {
  const d = TaskDocument.parse(TEXT, SECTIONS, M);
  const out = d.moveEntry(d.tasks("now")[1], "done", "start").serialize();
  expect(out).toContain("## Now\n- [ ] Первая\n## Soon\n");
  expect(out).toContain("## Done\n- [/] Вторая ⏰ 2026-10-30 14:00-15:00\n  - заметка\n  - [ ] подпункт\n- [x] Готово\n");
});
it("inserts at the end of a section before the blank line that separates sections", () => {
  const d = TaskDocument.parse("## Now\n- [ ] A\n\n## Soon\n", SECTIONS, M);
  expect(d.insert("now", "end", task("B")).serialize()).toBe("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n");
});
it("keeps raw when the task did not change", () => {
  const d = TaskDocument.parse("## Now\n-   [ ]   A  \n", SECTIONS, M);
  const e = d.tasks("now")[0];
  expect(d.replace(e, e.task).serialize()).toBe("## Now\n-   [ ]   A  \n");
  expect(d.replace(e, { ...e.task, status: "done", statusChar: "x" }).serialize()).toBe("## Now\n- [x] A\n");
});
it("adds missing sections at the end", () => expect(TaskDocument.parse("## Now\n- [ ] A\n", SECTIONS, M).ensureSections(["Inbox", "Now", "Soon", "Backlog", "Done"]).serialize()).toBe("## Now\n- [ ] A\n\n## Inbox\n\n## Soon\n\n## Backlog\n\n## Done\n"));
it("ignores a task-like line outside the three sections", () => expect(TaskDocument.parse("- [ ] outside\n## Now\n", SECTIONS, M).allTasks()).toHaveLength(0));
```

- [ ] **Step 2: Красные** — `npx vitest run tests/domain/TaskDocument.test.ts`
- [ ] **Step 3: Реализовать** `src/domain/TaskDocument.ts`. Внутри: массив строк файла (с сохранением `\n` в конце, если был) и карта секций `{ key, headingLine, firstLine, endLine }`; задачи вычисляются из строк. Операции работают со срезами строк и возвращают `TaskDocument.parse(newText)`.
- [ ] **Step 4: Зелёные, коммит** `git commit -m "Domain: task document with byte-exact serialization"`

### Task B3: Операции над документом

**Files:**
- Create: `src/domain/operations.ts`
- Test: `tests/domain/operations.test.ts`

**Interfaces:**
- Consumes: B1, B2.
- Produces (чистые функции `(doc, …) => TaskDocument`, все принимают `today: LocalDate` где нужно): `createInList(doc, date, today, text)`, `createInSoon(doc, text)`, `createAtTime(doc, date, today, start, minutes, text)`, `setStatus(doc, entry, status)`, `setDueDate(doc, entry, date | null)`, `rename(doc, entry, text)`, `remove(doc, entry)`, `moveBefore(doc, entry, before: TaskEntry | null, date, today)`, `setSlot(doc, entry, slot, today)`, `clearSlot(doc, entry)`, `moveToList(doc, entry, date, today)`, `moveToSoon(doc, entry, date, today)`, `clampSlot(slot: Slot, stepMinutes: number): Slot`, `newTask(text, patch?: Partial<Task>): Task`.
- Семантика ровно по `TaskService` в `contracts.ts` и таблице §5.1 спеки. `createAtTime`: слот `{date, start, end: min(start+minutes, 1440)}`. `setSlot`: слот зажимается `clampSlot(slot, 5)`; если `slot.date !== today` и `entry.section === "now"` — переезд в конец Soon. `moveBefore(…, null, date)`: в конец Now, если `date === today`, иначе в конец Soon. `moveToList` на другой день: due date = date, секция не меняется. `moveToSoon` сегодня: в конец Soon (due date остаётся); другой день: due date снимается, секция не меняется.

- [ ] **Step 1: Тесты** — по одному на каждую функцию, с проверкой итогового `serialize()`; обязательно:

```ts
it("setSlot on another day moves a Now task to the end of Soon", () => {
  const d = parse("## Now\n- [ ] A\n- [ ] B\n\n## Soon\n- [ ] C\n");
  expect(setSlot(d, d.tasks("now")[0], { date: "2026-10-31", start: 600, end: 660 }, "2026-10-30").serialize())
    .toBe("## Now\n- [ ] B\n\n## Soon\n- [ ] C\n- [ ] A ⏰ 2026-10-31 10:00-11:00\n");
});
it("clampSlot keeps the end at midnight and the start a step before", () => {
  expect(clampSlot({ date: D, start: 1420, end: 1480 }, 30)).toEqual({ date: D, start: 1410, end: 1440 });
  expect(clampSlot({ date: D, start: -10, end: 50 }, 30)).toEqual({ date: D, start: 0, end: 60 });
});
it("remove takes the children along", () => expect(remove(parse("## Now\n- [ ] A\n  - x\n- [ ] B\n"), first).serialize()).toBe("## Now\n- [ ] B\n"));
it("createInList on another day lands at the end of Soon with the due date", () => expect(createInList(parse("## Now\n\n## Soon\n- [ ] C\n"), "2026-11-03", "2026-10-30", "New").serialize()).toBe("## Now\n\n## Soon\n- [ ] C\n- [ ] New 📅 2026-11-03\n"));
it("moveToSoon on another day drops the due date and keeps the section", …);
it("moveBefore puts the task right before the target in the target's section", …);
```

- [ ] **Step 2: Красные** — `npx vitest run tests/domain/operations.test.ts`
- [ ] **Step 3: Реализовать** `src/domain/operations.ts`
- [ ] **Step 4: Зелёные, коммит** `git commit -m "Domain: task operations"`

### Task B4: Правила нормализации

**Files:**
- Create: `src/domain/normalize.ts`
- Test: `tests/domain/normalize.test.ts`

**Interfaces:**
- Consumes: B2, B3.
- Produces: `normalize(doc: TaskDocument, today: LocalDate): TaskDocument` (правила 1, 2, 3 спеки §4.4 в этом порядке; возвращает тот же объект `doc`, если ничего не изменилось — проверка по `serialize()`).

- [ ] **Step 1: Тесты**

```ts
it("rule 1 erases a past slot and keeps the due date", () => expect(normalize(parse("## Now\n- [ ] A 📅 2026-11-03 ⏰ 2026-10-29 10:00-11:00\n"), "2026-10-30").serialize()).toBe("## Now\n- [ ] A 📅 2026-11-03\n"));
it("rule 1 leaves today's and future slots", …);
it("rule 1 does not touch done tasks", …);
it("rule 2 moves done and cancelled to the start of Done, keeping their order", () => expect(normalize(parse("## Now\n- [x] A\n- [ ] B\n- [-] C\n\n## Done\n- [x] Old\n"), T).serialize()).toBe("## Now\n- [ ] B\n\n## Done\n- [x] A\n- [-] C\n- [x] Old\n"));
it("rule 3 moves a Soon task due today or earlier to the start of Now", () => expect(normalize(parse("## Now\n- [ ] N\n\n## Soon\n- [ ] S 📅 2026-10-30\n- [ ] Later 📅 2026-11-01\n"), "2026-10-30").serialize()).toBe("## Now\n- [ ] S 📅 2026-10-30\n- [ ] N\n\n## Soon\n- [ ] Later 📅 2026-11-01\n"));
it("rule 3 also fires on a slot dated today", …);
it("is idempotent", () => { const once = normalize(doc, T); expect(normalize(once, T)).toBe(once); });
it("returns the same object when nothing changes", () => expect(normalize(clean, T)).toBe(clean));
```

- [ ] **Step 2: Красные** — `npx vitest run tests/domain/normalize.test.ts`
- [ ] **Step 3: Реализовать** `src/domain/normalize.ts`
- [ ] **Step 4: Зелёные, коммит** `git commit -m "Domain: normalization rules"`

### Task B5: Выборки дня

**Files:**
- Create: `src/domain/queries.ts`
- Test: `tests/domain/queries.test.ts`

**Interfaces:**
- Consumes: B2.
- Produces: `listOn(doc, date, today): readonly TaskEntry[]` (сегодня: Now без слота на сегодня + Soon с due date сегодня; другой день D: Now и Soon с due date D и без слота на D; порядок файла, Now раньше Soon), `slottedOn(doc, date): readonly TaskEntry[]` (Now и Soon со слотом на дату), `soonList(doc): readonly TaskEntry[]` (Soon без due date и без слота), `toItem(entry: TaskEntry): TaskItem`.

- [ ] **Step 1: Тесты** — по сценариям спеки §5 («Слева, выбран сегодня», «Слева, выбран другой день D», «Справа, режим Soon»), плюс: задача из Now со слотом на завтра показывается сегодня в списке и завтра на таймлайне.
- [ ] **Step 2: Красные, реализовать, зелёные, коммит** `git commit -m "Domain: day queries"`

### Task B6: TaskService

**Files:**
- Create: `src/application/TaskServiceImpl.ts`, `tests/fakes/InMemoryTaskFileStore.ts`
- Test: `tests/application/TaskServiceImpl.test.ts`

**Interfaces:**
- Consumes: B1–B5, `TaskService`, `TaskFileStore`, `Clock`, `SettingsStore` из каркаса.
- Produces: `class TaskServiceImpl implements TaskService { constructor(store: TaskFileStore, settings: SettingsStore, clock: Clock) }`; `class InMemoryTaskFileStore implements TaskFileStore { constructor(text: string | null); text: string | null; writes: number; emitModify(): void }`.
- Поведение: каждый мутирующий метод — один `store.write(fn)`; внутри `fn` документ разбирается заново, ищется `entry` по `key` (секция, индекс, `entry.raw === key.raw`, иначе бросить `StaleTaskError` — `fn` возвращает текст без изменений, ошибка пробрасывается наружу), применяется операция, затем `normalize`, `ensureSections`, сериализация. `dayView`/`soonView` читают файл (`null` → `TasksFileMissingError`), применяют `normalize` только для чтения (не пишут). `normalize()` пишет, если правило что-то изменило. `onChange` подписывается на `store.onModify` и также вызывается после каждой своей записи. Пустой или пробельный текст в `createInList`/`createInSoon`/`createAtTime`/`rename` — ничего не делает (без записи).

- [ ] **Step 1: Тесты**

```ts
it("setStatus done moves the task to Done in one write", async () => { …; expect(store.writes).toBe(1); expect(store.text).toBe("## Now\n- [ ] B\n\n## Soon\n\n## Done\n- [x] A\n"); });
it("rejects a stale key and leaves the file alone", async () => {
  const view = await svc.dayView(T); store.text = "## Now\n- [ ] Changed\n…";
  await expect(svc.setStatus(view.list[0].key, "done")).rejects.toBeInstanceOf(StaleTaskError);
  expect(store.text).toBe("## Now\n- [ ] Changed\n…");
});
it("dayView of a missing file rejects with TasksFileMissingError", …);
it("createFile writes the five sections from settings", …);
it("whitespace-only text creates nothing", …);
it("onChange fires on a hand edit and after own writes", …);
it("adds missing sections on first write", …);
```

- [ ] **Step 2: Красные, реализовать, зелёные, коммит** `git commit -m "Application: TaskService over the file store"`

### Task B7: Хранилище файла поверх vault

**Files:**
- Create: `src/infrastructure/VaultTaskFileStore.ts`
- Test: `tests/infrastructure/VaultTaskFileStore.test.ts` (с минимальным фейком `App`: `vault.getAbstractFileByPath`, `vault.read`, `vault.process`, `vault.create`, `vault.on("modify")`)

**Interfaces:**
- Produces: `class VaultTaskFileStore implements TaskFileStore { constructor(app: App, path: () => string) }`. Путь читается при каждом вызове (настройка может смениться). `onModify` фильтрует события по пути. `write` на отсутствующем файле бросает `TasksFileMissingError`.

- [ ] **Step 1: Тесты, красные, реализовать, зелёные, коммит** `git commit -m "Infrastructure: tasks file over the vault"`

### Task B8: Календари

**Files:**
- Create: `src/infrastructure/GoogleLoopbackLogin.ts` (из `../obsidian-task-calendar-spike/src/google/GoogleAuth.ts`, только `login()` и Node `http`), `src/infrastructure/GoogleAuth.ts` (обмен и обновление токена через `requestUrl`), `src/infrastructure/GoogleCalendarSource.ts` (из спайка, плюс фильтр по `settings.google.calendarIds` и метод `listCalendars(): Promise<{ id: string; title: string; color: string }[]>`), `src/infrastructure/WorkCalendarFileSource.ts` (из спайка), `src/application/CalendarServiceImpl.ts`
- Test: `tests/application/CalendarServiceImpl.test.ts` (фейковые источники), `tests/infrastructure/WorkCalendarFileSource.test.ts` (фейковый `adapter`)

**Interfaces:**
- Produces: `interface EventSource { readonly name: CalendarSource; eventsBetween(start: Date, end: Date): Promise<{ events: CalendarEvent[]; updatedAt: Date }> }`; `class CalendarServiceImpl implements CalendarService { constructor(sources: readonly EventSource[]) }` — вызывает все источники параллельно за `[00:00 даты, 00:00 следующего дня)` локального времени; упавший источник отдаёт свои последние удачные события и `SourceStatus { ok: false, message: error.message }`; события на весь день (`allDay`) входят, если дата попадает в день. Google без `refreshToken`: статус `ok: false, message: "not logged in"`, без запроса. Work-файл отсутствует: `message: "file missing"`. Цвет события work-файла: `color` из файла или `#0A84FF`.
- `GoogleAuth`: `constructor(settings: SettingsStore)`, `accessToken(): Promise<string>` (кэш до истечения − 60 с), `logout()`. `GoogleLoopbackLogin.login(clientId, clientSecret): Promise<string>` (refresh token), только `Platform.isDesktop`.

- [ ] **Step 1: Тесты `CalendarServiceImpl`** — агрегация, падение одного источника с сохранением предыдущих событий, `allDay` по дате, статусы.
- [ ] **Step 2: Тесты `WorkCalendarFileSource`** — фильтр по названиям без учёта регистра, пустой список = все, отсутствие файла.
- [ ] **Step 3: Красные, реализовать (перенос из спайка с правкой под контракты), зелёные, коммит** `git commit -m "Calendars: Google and the work file behind one service"`

### Task B9: Вкладка настроек и фабрика сервисов

**Files:**
- Create: `src/ui/SettingsTab.ts`, `src/application/services.ts`
- Modify: ничего в `main.ts` (его подключает интеграция).

**Interfaces:**
- Produces: `class TaskCalendarSettingsTab extends PluginSettingTab { constructor(app, plugin: Plugin & SettingsStore, deps: { login(): Promise<string>; logout(): Promise<void>; listCalendars(): Promise<{ id; title; color }[]> }) }`; `createServices(app: App, settings: SettingsStore, clock?: Clock): { tasks: TaskService; calendars: CalendarService; google: GoogleAuth; googleSource: GoogleCalendarSource }`.
- Вкладка: все поля `TaskCalendarSettings` (§8 спеки) группами: Tasks file (путь, пять имён секций, два маркера), Timeline (длительность новой задачи, задержка долгого нажатия, час прокрутки, уровни масштаба как текст `28:60, 56:30, 112:15, 224:5`), Google Calendar (client id, secret, Login/Logout только на Mac с подписью «Log in on the Mac; the token syncs to the phone», интервал, список календарей с галочками после логина), Work calendar (путь, названия через запятую). Тексты на английском.

- [ ] **Step 1: Реализовать, `npm run build` зелёный, коммит** `git commit -m "Settings tab and service factory"`

### Task B11: Экран задачи и источники (добавлено по дизайну 30.10 вечер; после слияния `mvp` в ветку)

**Files:**
- Modify: `src/domain/operations.ts`, `src/application/TaskServiceImpl.ts`, `src/application/CalendarServiceImpl.ts`, `src/infrastructure/WorkCalendarFileSource.ts`, `src/application/EventSource.ts`
- Test: `tests/domain/operations.test.ts`, `tests/application/TaskServiceImpl.test.ts`, `tests/application/CalendarServiceImpl.test.ts`

**Interfaces:**
- Consumes: новые контракты в `contracts.ts`: `Placement`, `TaskDraft`, `TaskService.create(draft, slot?)`, `TaskService.edit(key, draft)`, `TaskService.placementOf(item)`, `SourceStatus.detail`, `SourceStatus.stale`, `CalendarService.cached(date)`; `settings.staleAfterMinutes` (180).
- Produces: `placeTask(doc, entry | null, draft, today, slot?)` в `operations.ts` (null = создать); `EventBatch.detail?: string` (устройство из work-файла).
- Семантика: `create`/`edit` по комментариям в `contracts.ts`; `edit` с той же плиткой, что у задачи, меняет только текст и не двигает строку; `stale = !ok || (updatedAt != null && now − updatedAt > staleAfterMinutes)`; `cached(date)` отдаёт последний результат `eventsOn` для этой даты.

- [ ] **Step 1: Тесты**

```ts
it("create with placement date before today lands at the end of Now", …);
it("create with placement date after today lands at the end of Soon with the due date", …);
it("create with a slot keeps the slot", …);
it("edit with the same placement only renames in place", …);
it("edit from now to soon moves to the end of Soon and drops the due date", …);
it("placementOf returns date when the task has a due date", …);
it("a source older than staleAfterMinutes is stale", …);
it("cached returns the last result without fetching", …);
```

- [ ] **Step 2: Красные → реализовать → зелёные → коммит** `git commit -m "Task sheet placements, source staleness"`

### Task B10: Финал потока B

- [ ] `npm test` и `npm run build` зелёные; `git log --oneline mvp..HEAD` показывает коммиты; отчёт оркестратору: список файлов, публичные сигнатуры, что отступает от плана и почему.

---

## Поток C: frontend (ветка `mvp-frontend`, worktree `.worktrees/frontend`)

До интеграции UI работает на фейках: `tests/fakes/DemoTaskService.ts` и `tests/fakes/DemoCalendarService.ts` с **ровно теми же данными, что в макете** (`docs/design/canvas/Screen.dc.html`, `renderVals`: семь задач списка, девять блоков таймлайна, событие на весь день «День рождения Ани», восемь задач Soon, «сейчас» = 14:20). Так снимок из Obsidian сравнивается с эталоном попиксельно.

### Task C1: Эталонный рендер макета

**Files:**
- Create: `docs/design/reference/render.mjs`, `docs/design/reference/Screen.html`, `docs/design/reference/ScreenSoon.html`, `docs/design/reference/ScreenDrag.html`, `docs/design/reference/Screen.png` (+ Soon, Drag, Left 130, Right 250)

**Interfaces:**
- Produces: `node docs/design/reference/render.mjs` — читает `canvas/Screen.dc.html`, выполняет `renderVals()` из его `<script type="text/x-dc">` с заданными props, подставляет `{{…}}` (точечный доступ), разворачивает `<sc-for list as>` и `<sc-if value>`, пишет статический HTML 390×844 и снимает PNG через headless Chrome (`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome --headless --screenshot --window-size=390,844 --hide-scrollbars`, если Chrome есть; иначе через встроенный браузер сессии вручную). Шрифт в эталоне `-apple-system`, как и в Obsidian на Mac.

- [ ] **Step 1: Написать `render.mjs`, получить `Screen.html`; открыть в браузере и глазами сверить с описанием `docs/design/README.md`**
- [ ] **Step 2: Снять PNG для пяти состояний; коммит** `git commit -m "Design: reference renders of the approved boards"`

### Task C2: Дизайн-система: токены, `design.ts`, тест стилей

**Files:**
- Create: `styles.css` (заменить пустой), `src/ui/design.ts`, `tests/styles.test.ts` (копия `../obsidian-friends-tracker/tests/styles.test.ts` с префиксом `--tc-`, корневой класс `task-calendar`)

**Interfaces:**
- Produces: токены `--tc-…` для каждого значения из `docs/design/README.md` (цвета, 40/12/15/6/3/24/13/9/36/20/16/10/52/22/28/4/26/56/14/11/7/8/34/2/190/42/32/18/44 и т. д.), `DESIGN` с мерами, которыми TypeScript считает раскладку: `hourPx: 56`, `columnsTop`, `timelineOffset: 34`, `labelHideDistance: 20`, `dueMinListWidth: 160`, `nowPillHeight: 16`, `itemInset: 1`, `itemGap: 2`, `tinyItemHeight: 24`, `floatWidth: 190`, `floatHeight: 42`, `floatLift: 20`.
- Корневой элемент вида: класс `task-calendar`, фон `#000`, шрифт из README; все правила внутри `.task-calendar`.

- [ ] **Step 1: Тест стилей красный на пустом `styles.css` (нет токенов) → написать токены и `design.ts` → зелёный → коммит** `git commit -m "UI: design tokens"`

### Task C3: Вид: шапка дня, колонки, разделитель, переключатель

**Files:**
- Create: `src/ui/TaskCalendarView.ts` (`ItemView`, `VIEW_TYPE = "task-calendar"`), `src/ui/DayHeader.ts`, `src/ui/Divider.ts`, `src/ui/SegmentedControl.ts`, `src/ui/dayTitle.ts`, `src/ui/haptics.ts`
- Modify: `src/main.ts` — регистрация вида, ribbon-иконка `calendar-days`, команда `Open Task Calendar`; временная проводка на `DemoTaskService`/`DemoCalendarService` (помечена `// DEMO WIRING: replaced at integration`).
- Test: `tests/ui/dayTitle.test.ts`, `tests/ui/Divider.test.ts` (happy-dom)

**Interfaces:**
- Produces: `dayTitle(date: LocalDate, today: LocalDate): string` → `Today` / `Tomorrow` / `Yesterday` / `Mon, 3 Nov` (en-GB, без года; с годом, если год другой: `Mon, 3 Nov 2027`); `class Divider { constructor(el: HTMLElement, opts: { width(): number; onWidth(w: number): void; min; max }) }` — Pointer Events, ширина зажата, на каждый move `onWidth`, при отпускании `settings.update({ listWidth })`; `class TaskCalendarView extends ItemView { constructor(leaf, deps: { tasks: TaskService; calendars: CalendarService; settings: SettingsStore; clock: Clock }) }`; `selectedDate` в состоянии вида; стрелки ±1 день, тап по заголовку → сегодня; переключатель режимов пишет `settings.update({ rightMode })`.
- Файл задач отсутствует (`dayView` отклоняется `TasksFileMissingError`): вместо колонок текст «No tasks file at <path>» и кнопка «Create file» → `tasks.createFile()`; после `onChange` вид перерисовывается.
- Раскладка: корень `position: relative; height: 100%`; строка дня на 16 px от верха содержимого; колонки с `columnsTop` (строка дня 36 + 12 зазор + 16 = 64 от верха содержимого); левая колонка шириной `listWidth`, разделитель 16, правая до края; кнопка New task закреплена над нижним краем содержимого (на телефоне содержимое уже кончается над навигацией Obsidian; проверить в эмуляции и, если навигация перекрывает, поднять на её высоту через `env(safe-area-inset-bottom)` и измеренный отступ).

- [ ] **Step 1: Тесты `dayTitle` и `Divider`, красные, реализовать, зелёные**
- [ ] **Step 2: `npm run build`, положить сборку в scratch-Obsidian (CLAUDE.md), открыть вид в эмуляции телефона, снимок; сравнить шапку, разделитель и переключатель с `docs/design/reference/Screen.png` наложением (скрипт `docs/design/reference/diff.mjs`: два PNG → процент отличающихся пикселей и PNG разницы; без зависимостей, PNG декодировать через `zlib` или снять снимки как JPEG=0 через CDP `Page.captureScreenshot` в формате png и сравнить через `sips`/`compare`, если ImageMagick есть)**
- [ ] **Step 3: Коммит** `git commit -m "UI: view with day header, columns, divider, mode switch"`

> **Изменение 30.10 (вечер):** дизайн дополнен экранами меню, срока, экрана задачи и источников (`docs/design/README.md`, разделы после «Перетаскивание»). Task C4: «New task» открывает экран задачи (Task C10), а не поле на месте. Task C8 заменена на C8′. Добавлены C10–C12. Перед ними слить `mvp` в ветку (`git merge mvp`): там новые контракты и настройки.

### Task C4: Список задач

**Files:**
- Create: `src/ui/TaskCard.ts`, `src/ui/TaskList.ts`, `src/ui/NewTaskButton.ts`, `tests/fakes/DemoTaskService.ts`
- Test: `tests/ui/TaskCard.test.ts` (happy-dom: структура карточки, полоса при `inProgress`, дата при `showDue`, формат месяца `NOV`)

**Interfaces:**
- Produces: `renderTaskCard(parent: HTMLElement, item: TaskItem, opts: { showDue: boolean }): HTMLElement`; `class TaskList { constructor(el, deps: { items(): readonly TaskItem[]; showDue(): boolean; onCreate(text: string): Promise<void>; onMenu(item, at: { x; y }): void }); render(): void }`; `class NewTaskButton` — кнопка по макету; нажатие вызывает `onNewTask()` (открывает экран задачи, Task C10; до C10 — заглушка, создающая задачу с текстом «New task» через `create`).
- `DemoTaskService` реализует `TaskService` в памяти (массивы по секциям, те же данные, что в макете), все операции работают, `onChange` вызывается после каждой.

- [ ] **Step 1: Тесты карточки красные → реализовать → зелёные**
- [ ] **Step 2: Снимок списка в scratch-Obsidian при 187, 130 и 250 px; попиксельная разница с эталонами ≤ 0,5 % (разница только в сглаживании текста); иначе править**
- [ ] **Step 3: Коммит** `git commit -m "UI: task list and new task input"`

### Task C5: Таймлайн

**Files:**
- Create: `src/ui/Timeline.ts`, `src/ui/timelineLayout.ts`, `src/ui/eventColors.ts`, `src/ui/AllDayRow.ts`, `tests/fakes/DemoCalendarService.ts`
- Test: `tests/ui/timelineLayout.test.ts`, `tests/ui/eventColors.test.ts`

**Interfaces:**
- Produces: `layoutColumns(events: readonly { start: number; end: number }[]): { col: number; cols: number }[]` (пересекающиеся кластеры делят ширину поровну, порядок по началу); `itemBox(startMin, endMin, hourPx): { top; height; tiny }` (`top = start/60·hourPx + 1`, `height = (end−start)/60·hourPx − 2`, `tiny = height < 24`); `eventColors(hex: string): { bg: string; bar: string; text: string }` (`bg = rgba(hex, 0.22)`, `bar = hex`, `text = mix(hex, #FFF, 0.5)`); `class Timeline { constructor(el, deps: { date(): LocalDate; today(): LocalDate; hourPx(): number; tasks(): readonly TaskItem[]; events(): readonly CalendarEvent[]; now(): Date; onMenu(item, at) }); render(): void; scrollTo(minutes: number, fraction: number): void; yOf(minutes): number; minutesAt(y): number }`.
- DOM: внешний скролл-контейнер (`overflow-y: auto; overscroll-behavior: contain`), внутри строка(и) на весь день (вне скролла, над ним), холст высотой `24 · hourPx`, подписи часов `0…23` (подпись скрыта, если `|y(h) − y(now)| ≤ 20` на сегодняшнем дне), линии, область блоков `left 28 / right 4`, блоки событий и задач по README, ряд «сейчас» только сегодня; обновляется раз в минуту (`registerInterval` во view). Первая отрисовка: сегодня → `scrollTo(nowMinutes, 0.45)`, другой день → `scrollTo(settings.scrollToHour · 60, 0)`.

- [ ] **Step 1: Тесты `layoutColumns` (два пересекающихся → cols 2; три, где третий не пересекает первый, но пересекает второй → один кластер из трёх), `itemBox`, `eventColors`; красные → реализовать → зелёные**
- [ ] **Step 2: Снимок в scratch-Obsidian с демо-данными и «сейчас» = 14:20 (DemoClock), прокрутка к 9:00 для совпадения с макетом; разница с `Screen.png` ≤ 0,5 %; иначе править**
- [ ] **Step 3: Коммит** `git commit -m "UI: day timeline with events, tasks and the now line"`

### Task C6: Перетаскивание

**Files:**
- Create: `src/ui/drag/DragSession.ts`, `src/ui/drag/LongPress.ts`, `src/ui/drag/FloatingCard.ts`, `src/ui/drag/DropTarget.ts`, `src/ui/drag/ListDrop.ts`, `src/ui/drag/TimelineDrop.ts`, `src/ui/drag/snap.ts`
- Test: `tests/ui/snap.test.ts`, `tests/ui/LongPress.test.ts` (happy-dom + fake timers), `tests/ui/DragSession.test.ts`

**Interfaces:**
- Produces: `snapMinutes(m: number, step: number): number`; `class LongPress { constructor(el, opts: { delayMs(): number; immediate(): boolean; onStart(p: PointerEvent): void; moveTolerance: 8 }) }` — на телефоне ждёт `delayMs` без сдвига > 8 px, на Mac (`immediate()`) стартует при сдвиге > 4 px; `class DragSession { constructor(opts: { source: DragSource; targets: readonly DropTarget[]; onEnd(result: DropResult | null): Promise<void> }) }` с `setPointerCapture`, `touch-action: none` на карточках и блоках; `interface DropTarget { hitTest(x, y): boolean; preview(x, y, drag: DragPayload): void; clear(): void; drop(x, y, drag): DropResult }`; `type DropResult = { kind: "slot"; slot: Slot } | { kind: "listBefore"; before: TaskKey | null; column: "left" | "soon" } | { kind: "clearSlot" }`.
- Поведение (README «Перетаскивание»): при старте — тактильный отклик, карточка-источник получает класс `is-lifted` и за 150 мс схлопывается (`height` и `margin` → 0, `opacity` → 0), список смыкается плавно; плывущая карточка 190×42 `position: fixed` рисуется через `transform: translate3d`, без layout на каждом move; над таймлайном цель броска прилипает к `snapMinutes(minutesAt(y) − durationMin/2 …)` (верх цели = y(start)), автопрокрутка таймлайна, когда палец ближе 40 px к его краю; над списком — зазор между карточками раскрывается до 40+6 px в месте вставки за 150 мс; бросок → плывущая карточка за 180 мс доезжает в место назначения (`transform` → позиция цели, затем `onEnd`), тактильный отклик; отпускание вне целей → карточка возвращается на место за 180 мс. Перенос блока на таймлайне: долгое нажатие на блок, движение по вертикали шагом сетки, преview блоком с акцентной рамкой; растягивание за ручку (16×3, зона нажатия 44×24) — только `end`. С таймлайна в левый список → `clearSlot`. Левый список → таймлайн → `setSlot`; Soon → левый список → `moveToList`; левый → Soon → `moveToSoon`; внутри списка → `moveBefore`. `StaleTaskError` → `new Notice(…)` и перерисовка.

- [ ] **Step 1: Тесты `snapMinutes`, `LongPress` (таймер, отмена сдвигом, immediate), `DragSession` (hitTest-маршрутизация, результат, отмена) → красные → реализовать → зелёные**
- [ ] **Step 2: Проба в scratch-Obsidian через CDP `Input.dispatchTouchEvent` в эмуляции телефона и мышью на десктопе: все восемь переходов из таблицы §5.1; снимок состояния «тащу» ≈ `ScreenDrag.png`**
- [ ] **Step 3: Коммит** `git commit -m "UI: drag and drop between the list, Soon and the timeline"`

### Task C7: Зум щипком

**Files:**
- Create: `src/ui/PinchZoom.ts`, `src/ui/zoomLevels.ts`
- Test: `tests/ui/zoomLevels.test.ts`

**Interfaces:**
- Produces: `nearestLevel(hourPx: number, levels: readonly ZoomLevel[]): ZoomLevel`; `stepFor(hourPx, levels): number` (шаг ближайшего уровня); `class PinchZoom { constructor(el, opts: { hourPx(): number; onScale(hourPx: number, anchorMinutes: number): void; onRelease(hourPx): void; min; max }) }` — два указателя, расстояние между ними / начальное × начальный `hourPx`, якорь — минута под серединой пальцев остаётся на месте; на отпускании `nearestLevel` с анимацией 200 мс. Пока идёт щипок, перетаскивание не стартует. На Mac — `ctrl/cmd + колесо`.

- [ ] **Step 1: Тесты → реализовать → проба в scratch-Obsidian (два касания через CDP) → коммит** `git commit -m "UI: pinch zoom with grid-bound steps"`

### Task C8′: Режим Soon и меню задачи по макету

**Files:**
- Create: `src/ui/SoonList.ts`, `src/ui/menu/TaskMenu.ts`, `src/ui/menu/MenuPanel.ts`, `src/ui/menu/DueSubmenu.ts`, `src/ui/menu/MonthPicker.ts`, `src/ui/menu/Backdrop.ts`, `src/ui/menu/dueOptions.ts`
- Test: `tests/ui/dueOptions.test.ts`, `tests/ui/MonthPicker.test.ts`

**Interfaces:**
- Produces: `menuRows(item: TaskItem): readonly MenuRow[]` (три группы по README; `In progress` ↔ `Stop progress`); `dueOptions(today: LocalDate, current: LocalDate | null): { today: {label, value}; tomorrow; nextWeek /* ближайший понедельник после сегодня */; pick: { value: string | "" }; canRemove: boolean }` (значения `Fri`, `Sat`, `Mon, 2 Nov`, `3 Nov` — en-GB); `class MonthPicker { constructor(el, opts: { month: LocalDate; today; selected: LocalDate | null; onPick(date): void; variant: "menu" | "sheet" }) }` — 42 ячейки с понедельника, навигация по месяцам; `class Backdrop` — подложка blur поверх корня вида, тап закрывает; `showTaskMenu(view, item, cardEl, actions)` — поднимает копию карточки (scale 1.04, фон `#2C2C2E`, тень), рисует панель под ней (или над, если не влезает), переключает подменю срока и календарь на месте панели. Все размеры и цвета из README через токены.
- Soon-список — тот же `TaskList` без даты, своя кнопка New task → экран задачи с плиткой Soon.

- [ ] **Step 1: Тесты `dueOptions` (ближайший понедельник с пятницы 30.10.2026 → `Mon, 2 Nov`; с понедельника → следующий понедельник), `MonthPicker` (сетка ноября 2026 начинается с 26 октября, 42 ячейки, выбранный и сегодня помечены) → красные → реализовать → зелёные**
- [ ] **Step 2: Снимки в scratch-Obsidian ≈ `ScreenMenu.png`, `ScreenDue.png`, `ScreenPicker.png`, `ScreenSoon.png` (эталоны из Task C1 дополнить этими артбордами; `MenuScreen.dc.html` импортирует `Screen`, рендерер должен разворачивать `<dc-import>`) → коммит** `git commit -m "UI: Soon mode, task menu, due date submenu and month picker"`

### Task C10: Экран задачи

**Files:**
- Create: `src/ui/sheet/TaskSheet.ts`, `src/ui/sheet/PlacementTiles.ts`, `src/ui/sheet/sheetState.ts`
- Test: `tests/ui/sheetState.test.ts`

**Interfaces:**
- Produces: `class TaskSheet { static open(view, opts: { mode: "new" | "edit"; initial: TaskDraft; slot: Slot | null; onSubmit(draft: TaskDraft): Promise<void> }) }` — накрывает весь корень вида по README «Экран задачи»; Cancel/Add(Save); поле названия `contenteditable` 28/34 700 по центру с автофокусом (клавиатура сразу); плитки Soon/Now/Date; строка времени при `slot`; календарь под плитками по Date; Enter в поле = Add; пустое название → Add неактивен и ничего не делает. `sheetState.ts`: чистые функции `tileLabel(placement, today): "Soon" | "Now" | string`, `togglePlacement(state, tile)`.
- Подключение: «New task» левой колонки → `mode: "new", placement: now`; «New task» Soon → `placement: soon`; долгий тап по пустому месту таймлайна (Task C12) → `placement: now` (или `date` дня, если день не сегодня) + `slot`; Rename в меню → `mode: "edit"`, `initial: { text, placement: tasks.placementOf(item) }`, `onSubmit → tasks.edit(key, draft)`.

- [ ] **Step 1: Тесты `sheetState` → реализовать → снимки ≈ `ScreenSheet.png`, `ScreenSheetSlot.png`, `ScreenSheetEdit.png`, `ScreenSheetPicker.png`, `ScreenSheetLong.png` (клавиатуру iOS в макете не сравнивать: обрезать снимки по 544 px) → коммит** `git commit -m "UI: task sheet with placement tiles and date picker"`

### Task C11: Источники календарей

**Files:**
- Create: `src/ui/sources/SourceDot.ts`, `src/ui/sources/SourcesPopover.ts`, `src/ui/sources/PullToRefresh.ts`, `src/ui/sources/sourceText.ts`
- Test: `tests/ui/sourceText.test.ts`

**Interfaces:**
- Produces: `sourceText(status: SourceStatus, now: Date): { name: "Google Calendar" | "Work calendar"; short: "Google" | "Work"; sub: string; time: string; stale: boolean }` (`sub`: `Updated today` / `Exported from iPhone` / текст ошибки; `time`: `14:19` сегодня, `Yesterday 08:02`, иначе `3 Nov 08:02`; пусто при `updatedAt null`); точка на кнопке календаря, если любой источник `stale`; тап по кнопке календаря в режиме календаря → `SourcesPopover` (подложка, переключатель поверх, панель по README, «Refresh now» → `calendars.eventsOn(date)` и перерисовка); `PullToRefresh` на скролл-контейнере таймлайна: оттягивание при `scrollTop === 0` открывает область 80 px со спиннером и строками источников, отпускание за порог 60 px обновляет.

- [ ] **Step 1: Тест `sourceText` → реализовать → снимки ≈ `ScreenSourcesDot.png`, `ScreenSourcesPopover.png`, `ScreenSourcesPull.png` → коммит** `git commit -m "UI: calendar sources dot, popover and pull to refresh"`

### Task C12: Долгий тап по таймлайну

**Files:**
- Modify: `src/ui/Timeline.ts`, `src/ui/drag/TimelineDrop.ts`

- [ ] **Step 1: Долгое нажатие по пустому месту холста (не по блоку): цель броска по README (фон `#251F3D`, делит ширину с блоком того же времени, время начала), тактильный отклик, затем `TaskSheet.open` с `slot: { date, start: snap(minutesAt(y)), end: start + newTaskMinutes }`; Cancel убирает цель. Снимок ≈ `Screen.dc.html` с `newSlot=true` → коммит** `git commit -m "UI: new task by a long tap on the timeline"`

### Task C9: Финал потока C

- [ ] Попиксельная сверка всех эталонов (главный экран в пяти состояниях, меню, срок, календарь, экран задачи в пяти состояниях, источники в трёх) (разница и PNG разницы в `docs/design/reference/diff/`), `npm test`, `npm run build` зелёные; отчёт оркестратору: проценты разницы по эталонам, что отступает от плана и почему, что осталось.

---

## Поток D: интеграция (оркестратор, ветка `mvp`)

### Task D1: Слияние
- [ ] `git merge mvp-backend`, `git merge mvp-frontend` (обе ветки уже содержат `mvp` с новыми контрактами); в `src/main.ts` заменить демо-проводку на `createServices(app, this)`, подключить `TaskCalendarSettingsTab`; `tests/fakes/Demo*` остаются для тестов. `npm test`, `npm run build`.

### Task D2: Проба в scratch-Obsidian на реальном файле
- [ ] Vault с `TODOs Tasks.md` (копия шаблона `~/Obsidian/TODOs Tasks.md`), файл `calendar/work.json` из спайка; все действия §5.1 мышью на десктопе и touch в эмуляции; правка файла руками при открытом виде; Google без логина (статус «not logged in»). Review Focus 3 руками.

### Task D3: Телефон
- [ ] Версия `0.1.0`, GitHub-репозиторий `kudrmax/obsidian-task-calendar`, релиз с `main.js`, `manifest.json`, `styles.css`; BRAT в `~/Obsidian` по правилам `~/.claude/CLAUDE.md`; Макс проверяет перетаскивание и пиксели на iPhone.
