# Этап 4. Окна и подменю — компоненты

Дата: 2026-11-04. Обзор этапов: `2026-11-04-design-overview.md`. Находки: `2026-11-04-design-audit.md`, раздел 4.

## Цель

Одно окно, одна поднятая копия, одно подменю каждого вида. Сейчас:
- **Поднятая копия** собирается четырьмя способами:
  - меню задачи и события (`LiftedMenu`);
  - меню раздела (`GroupMenu`);
  - меню выбранных задач (`BulkMenu`);
  - окно источников (`SourcesPopover`).
- **Панель** — тоже четырьмя способами.
- **Подменю скопированы.** «Раздел» и «Дата» с «Remove due date» написаны дважды: `TaskMenu` и `BulkMenu`. `QuickBar` строит только сам выбор месяца, со своим правилом «сегодня → Now».
- **«Закрыть и потом выполнить»** написано 4 раза.
- **«Поставить элемент в прямоугольник»** написано 6 раз.

После этапа это общие объекты. Новое окно или подменю собирается из них, а не копированием.

**Пиксели и поведение не меняются.** Каталог экранов совпадает попиксельно. Открытие, закрытие, Escape, тап мимо, выбор пункта, порядок «закрыть, потом выполнить», размещение над или под и анимации — как были.

## Решения

### 1. `dom.pinTo(el, rect, { size?: boolean })`

Ставит `left/top`, а при `size` ещё и `width/height`, по прямоугольнику. Заменяет 6 ручных копий:
- `GroupMenu`;
- `BulkMenu`;
- `SourcesPopover`;
- `TaskMenu` ×2;
- `FloatingCard`;
- `LiftedMenu`.

### 2. `kit/Panel`

Окно над экраном. Его корневой класс — параметр: `tc-panel`, `tc-popover` или `tc-desc-peek`, с теми же модификаторами, что ставят создатели окон сейчас. Общий класс на всё **не добавляется**. `.tc-panel` несёт `top`, ширину 250, переходы и правила кнопок, и, повешенный на окно источников или начало описания, сдвинул бы их. Компонент объединяет поведение, а не CSS: CSS уже общий после этапа 1.

```ts
interface PanelSpec {
	readonly root: "tc-panel" | "tc-popover" | "tc-desc-peek";
	readonly cls?: string;              // is-menu, is-task is-bulk, tc-quick-panel … — как сейчас
	readonly place: (panel: HTMLElement) => void; // placePanel(…) с нужным зазором и комнатой
}
class Panel {
	readonly el: HTMLElement;
	show(): void;                          // is-shown на следующем кадре, как сейчас
	close(how?: CloseHow): Promise<void>;  // гаснет вместе с оверлеем
	pick(then: () => void): () => void;    // «закрыть, потом выполнить» — один раз для всех
	replace(build: (el: HTMLElement) => void): void; // перейти на подменю на месте
}
```

Кто на нём:
- `LiftedMenu.addPanel`;
- `BulkMenu`;
- `GroupMenu`;
- `SourcesPopover`;
- `DescriptionPeek`;
- панели полосы в `QuickBar`.

`QuickBar` сейчас живёт не в `Overlay` и сам закрывается по нажатию снаружи. Это поведение сохраняется: `Panel` не требует `Overlay`, закрытие снаружи — забота владельца.

### 3. `kit/LiftedCopy`

Копия того, к чему относится окно, над подложкой: в прямоугольнике оригинала, через `pinTo`.

```ts
class LiftedCopy {
	static of(source: HTMLElement, cls: string, overlay: Overlay): LiftedCopy; // cloneNode/свой строитель — как у каждого сейчас
	readonly el: HTMLElement;
	readonly rect: DOMRect;
}
```

Кто на нём: `LiftedMenu` (`tc-lifted`), `GroupMenu` (`is-head`), `BulkMenu` (`is-selected`), `SourcesPopover` (`tc-seg-copy`). У каждого остаётся свой класс и способ собрать содержимое. Общее — постановка в прямоугольник, слой и то, что копия уходит вместе с оверлеем.

**`BulkMenu`** не наследует `LiftedMenu`: у того `addPanel()` ставит `is-menu` (ширина 300 вместо 250), у него одна копия и своя прокрутка `openOver()`. Вместо наследования `BulkMenu` берёт общие части:
- `Panel` — свои классы `tc-panel is-task is-bulk`;
- `pick`;
- `LiftedCopy` — для каждой из своих копий.

Свой код у него остаётся только на то, что у меню выбранных задач своё: несколько копий и заголовок с числом задач.

### 4. Общие подменю: `menu/SectionChooser`, `menu/DatePage`

- **`SectionChooser`** строит подменю «Раздел»:
  - «назад»;
  - список разделов с галочкой у текущего;
  - «без раздела»;
  - «New section».

  Строки и классы те же. Вызывают `TaskMenu` и `BulkMenu`.
- **`DatePage`** строит выбор даты: `MonthPicker` и строку «Remove due date», если у задач есть дата. Вызывают `TaskMenu` и `BulkMenu`. Отличия вызывающих передаются параметрами, а не копиями:
  - выбранный день;
  - что делать при выборе;
  - показывать ли «Remove due date».

  `QuickBar` строит только `MonthPicker`, как сейчас.

### 5. Строка меню с типом вместо строки классов

`menuRow(parent, spec, "tc-menu-row is-tall is-apart")` → `menuRow(parent, { …spec, size: "tall", apart: true })`. Варианты задаются полями:
- `size: "row" | "tall"`;
- `apart?: boolean`;
- `choice?: boolean`;
- `quiet?: boolean`;
- `add?: boolean`;
- `iconSide: "end" | "start"`.

На ту же строку переходят:
- `backRow`: `iconSide: "start"`, размер `tall`;
- строка «Refresh now» в окне источников: `iconSide: "start"`, `tone: "accent"`.

Классы на элементе получаются те же, что сейчас, поэтому CSS не меняется. `tileRows` переезжает из `TaskMenu` в `MenuPanel` к `tileGroup`: им пользуются три меню.

### 6. Ручки таймлайна: `Grips.attach(parent, onGrip)`

Одна сборка ручек `tc-grip is-start/is-end` вместо двух одинаковых: `Timeline` и `DragController`.

## Тесты

- **Существующие тесты меню** (`TaskMenu`, `BulkMenu`, `GroupMenu`, `SourcesPopover`, `QuickBar`, `LiftedMenu`) проходят без изменения ожиданий поведения.
- **Новые:**
  - `Panel`: `pick` закрывает и выполняет ровно один раз, второе нажатие во время закрытия ничего не делает;
  - `SectionChooser` и `DatePage`: строки и классы;
  - `pinTo`.
- **Тест на копии.** Подменю «Раздел» и «Дата» строятся только в своих модулях. Строковый литерал `"Remove due date"` встречается в коде `src/ui` один раз. Комментарии не считаются.

## Не входит

- Любое видимое изменение и изменение поведения.
- Подложка (`Overlay`) — она уже общая.

## Проверка

1. Тесты, сборка, линтер.
2. Каталог экранов до и после: попиксельно одинаково.
3. Руками в тестовом Obsidian, телефон и Mac. Каждое окно открывается, выбирает и закрывается тремя способами: выбором, тапом мимо, Escape.
   - меню задачи и каждое его подменю: раздел, дата, подтверждение удаления;
   - меню события;
   - меню раздела;
   - меню выбранных задач и его подменю;
   - окно источников;
   - начало описания;
   - панели полосы быстрого ввода (раздел, дата).

## Итог

Реализовано 04.11 в ветке `design-4-panels` по плану `plans/2026-11-04-design-4-panels.md`: коммит состояний каталога, коммит плана и по коммиту на задачу.

- `dom.pinTo(el, rect, { width?, height? })`. На нём копии `GroupMenu`, `BulkMenu`, `SourcesPopover`, копия `LiftedMenu`, стопка подзадач и строка поля в `TaskMenu`.
- `kit/Panel`: `Panel.over(overlay, spec, onLevel)` и `Panel.inside(holder, spec)`, `show`, `place`, `pick`, `replace`. На нём панели `LiftedMenu` (меню задачи и события), `BulkMenu`, `GroupMenu`, окно источников, начало описания и панели полосы быстрого ввода.
- `kit/Picks`: «закрыть, потом выполнить» одним объектом на меню. Первое нажатие закрывает и выполняет, любое следующее, пока меню гаснет, ничего не делает. Раньше второе нажатие во время затухания выполняло действие ещё раз.
- `kit/LiftedCopy`: `LiftedCopy.over(overlay, copy, onLevel).pin(rect, size)`. На нём `tc-lifted`, `is-head`, `is-selected`, `tc-seg-copy`.
- `menu/SectionChooser` (`sectionChooser`) и `menu/DatePage` (`datePage`): подменю «Раздел» и «Дата» для `TaskMenu` и `BulkMenu`. `SectionChoice` переехал в `SectionChooser`, `TaskMenu` его реэкспортирует. `QuickBar` строит только `MonthPicker`, как раньше.
- `menuRow(parent, spec)` с полями `root`, `size`, `apart`, `choice`, `quiet`, `add`, `iconSide`, `cls`. `backRow` и «Refresh now» — та же строка. `tileRows` переехал в `MenuPanel`.
- `kit/Grips.attach(parent, { takes, onGrip })`: ручки `Timeline` и копии в `DragController`.
- Тесты: 1353 зелёных, сборка зелёная. Новые: `dom.test.ts` (`pinTo`), `kit/Panel.test.ts` (в том числе «второе нажатие ничего не делает»), `kit/LiftedCopy.test.ts`, `kit/Grips.test.ts`, `SectionChooser.test.ts`, `DatePage.test.ts`, строки меню в `MenuPanel.test.ts` и `menuCopies.test.ts`: `"Remove due date"` в коде `src/ui` один раз, `backRow(…"Section")` только в `SectionChooser`, `new MonthPicker(` только в `DatePage` и `QuickBar`.

Каталог. Добавлены состояния (до рефакторинга, поэтому они есть в эталоне): `bulk`, `bulk-section`, `bulk-picker` (только Mac: выбор ⌘-нажатием есть только на десктопе), `quick-priority`, `quick-place`, `quick-picker`, `block-menu` (меню карточки таймлайна со стопкой подзадач и ручками). Эталон — сборка master в `cat/s4base`, ветка — `cat/s4final`. Совпали все 102 снимка, в том числе в первом прогоне: `diff.py` — `0 differ`.

Пробы касания и iPad, после работы, как и до:

```
$ node scripts/design-catalog/tapcheck.mjs
== main
== menu
== picker
== confirm
== sources
== sheet
== quick
$ TAB=1 node scripts/design-catalog/tapcheck.mjs
== main
== menu
== picker
== confirm
== sources
== sheet
== quick
```

Руками в тестовом Obsidian (Mac): меню задачи закрывается Escape и тапом мимо; меню выбранных задач открывается, подменю «Раздел» показывает галочку у общего раздела, «назад» возвращает к меню, Escape закрывает.

Отступления и решения:
- **Найден и исправлен баг этапа 3.** У «Remove due date» с 0.4.97 отступ 16 вместо 4: правило `.tc-panel .tc-picker-remove` (вес 0,2,0) проигрывало `.tc-panel button.tc-menu-row` (0,2,1). Каталог его не видел: ни в одном состоянии не было задачи с датой. Нашёл тест `styles.test.ts`, когда класс строки стал виден ему через `cls`. Правило теперь `.tc-panel button.tc-picker-remove`, отступ снова 4, как в 0.4.96: подпись встаёт по краю сетки дней. Проверено снимком в тестовом Obsidian, до и после. Это единственное видимое изменение ветки.
- **`FloatingCard` не на `pinTo`.** Он двигается через `transform`, а не `left/top`; ставить его в прямоугольник — другое действие.
- **У `Panel` нет `close(how)`.** Закрывает владелец: оверлей или полоса. `Panel` получает от него `Picks`, а у меню из нескольких окон (`TaskMenu`: панель и верхняя часть, начало описания) `Picks` общий, поэтому одно нажатие закрывает всё меню.
- **Корень строки — поле `root`.** Строка «назад» и «Refresh now» сохраняют свои классы `tc-menu-back` и `tc-source-refresh`, поэтому `size` и `tone` им не ставятся: классы те же, CSS не менялся. `iconSide: "start"` рисует иконку и текст без `span`, как раньше.
- **`Grips.attach` берёт `{ takes, onGrip }`, а не один `onGrip`.** Так нажатие останавливается до действия, в прежнем порядке.
- **У `datePage` нет параметра месяца.** Оба вызывающих открывали месяц выбранного дня или сегодняшний.
- **Каталог:** `quick-*` пишут по одной задаче «Новая задача», как и старое `quick`. Прогоны от этого не расходятся.
