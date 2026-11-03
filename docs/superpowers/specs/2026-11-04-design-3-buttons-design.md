# Этап 3. Кнопки и иконки — компоненты

Дата: 2026-11-04. Обзор этапов: `2026-11-04-design-overview.md`. Находки: `2026-11-04-design-audit.md`, разделы 2, 3, 7.

## Цель

В коде одна кнопка. Сейчас кнопку каждый раз собирают руками: элемент, `aria-label`, иконка, обработчик. Таких сборок около 12. После этапа кнопку создаёт компонент, а вид задаётся параметром. Иконки берутся из одного набора, а не из трёх фабрик с дублями.

**Пиксели и поведение не меняются.** Каталог экранов до и после совпадает попиксельно. Нажатия, жесты, `aria-label` и `title` те же.

## Решения

### 1. Папка `src/ui/kit/`

Общие объекты интерфейса. От остального `ui` их отличают два правила:
- они не знают про задачи и экраны;
- они импортируют только `dom.ts` и `design.ts`.

### 2. Иконки: `kit/icons.ts`

Сейчас три фабрики: `icons.ts`, `menu/menuIcons.ts`, `sources/sourceIcons.ts`, и мост `tileIcon`. Они сливаются в одну:
- **Одна карта путей.** `IconName` — объединение всех имён. Каждый рисунок записан один раз:
  - `cancel` и `cross` — одно имя, `cross`;
  - `description`, `section` и `plus` — по одной записи.
- **Одна функция** `icon(name: IconName, options?: { filled?: boolean }): SVGSVGElement`. Она умеет пути с заливкой: они есть у иконок меню.
- **Атрибуты не меняются.** `viewBox`, атрибуты и классы, которые сейчас ставят три фабрики, остаются как есть, чтобы CSS их находил. Если у фабрик были разные классы на `<svg>`, `icon()` берёт класс параметром.
- **Старые файлы удаляются.** Их импорты переводятся на `kit/icons.ts`.

### 3. Кнопка: `kit/Button.ts`

```ts
type ButtonKind = "round" | "icon" | "bar" | "text" | "pill" | "swatch";
type ButtonTone = "plain" | "accent" | "quiet" | "strong" | "danger";

interface ButtonSpec {
	readonly kind: ButtonKind;
	readonly tone?: ButtonTone;
	readonly label: string;          // aria-label, а у text/pill ещё и видимый текст
	readonly icon?: IconName;
	readonly text?: string;          // видимая подпись рядом с иконкой (место на полосе, кнопка вопроса)
	readonly title?: string;
	readonly cls?: string;           // класс назначения: tc-plus, tc-undo, tc-arrow… — CSS позиции и назначения
	readonly onPress: (e: MouseEvent) => void;
}

class Button {
	static create(parent: HTMLElement, spec: ButtonSpec): Button;
	readonly el: HTMLButtonElement;
	setOn(on: boolean): void;        // is-on
	setOff(off: boolean): void;      // is-off (отмене нечего отменять)
	setHidden(hidden: boolean): void;// is-hidden
	setText(text: string): void;
	setIcon(name: IconName): void;
}
```

Классы на элементе: `tc-btn is-<kind> is-<tone>` и класс назначения. CSS этапа 1 уже держит общий сброс, круглую кнопку и нажатие группами селекторов. На этом этапе группы становятся классами:
- общий сброс → `.tc-btn`;
- круглая кнопка → `.tc-btn.is-round`;
- нажатие → `.tc-btn:active`;
- наведение и фокус (этап 2) → `.tc-btn`.

Классы назначения остаются только для позиции и того, что у кнопки своё: цвет плюса, размер стрелки месяца. Тест в `styles.test.ts` проверяет, что сброс кнопки и затемнение при нажатии объявлены только на `.tc-btn`.

**Кто переходит на кнопку:**

| Вид | Где сейчас |
|---|---|
| `round` | плюс (`PlusButton`), отмена (`UndoButton`). Плюс под пальцем (`PlusFloat`) и кольцо (`PlusRing`) — не кнопки, но берут вид `tc-btn is-round` без обработчика. Для этого есть функция `roundShape(parent, icon, tone)`. |
| `icon` | стрелки дня (`ColumnHeaders`), стрелки месяца (`MonthPicker`). Два одинаковых метода `arrow()` уходят. |
| `bar` | «влево» и «вправо», флажок, место на полосе быстрого ввода (`QuickBar`). Вид на десктопе по-прежнему через `.is-desk` на полосе. |
| `text` | Close, Edit, Cancel и Save на экране описания (`DescriptionSheet`). Два класса `tc-sheet-cancel/submit` → `tone: "plain" \| "strong"`. |
| `pill` | кнопки вопроса в меню (`askGroup`): Cancel и подтверждение, тон `danger` или `strong`. Кнопка «Create file» на экране «нет файла». |
| `swatch` | цвета уровней в настройках (`SettingsTab`). Становится настоящим `<button>`: работает с клавиатуры. |

Ручка разделителя (`Divider`) — не кнопка. Она становится `span` с `role="separator"`: тянут её за полосу, нажатие на неё ничего не делает.

### 4. Мелочи из аудита

- **`FloatingCard` создаёт элементы через `el()`.** Сейчас — через `Object.assign(document.createElement…)`.
- **Точка «в работе» на таймлайне** рисуется через `showProgressDot` (`TaskCard.ts`). Сейчас она нарисована руками в `Timeline`.
- **`TaskCalendarView` прячет элемент классом `is-hidden`**, а не `style.display = "none"`. Правило `.is-hidden` в CSS уже есть или добавляется. `TaskMenu` — так же, вместо `style.visibility = "hidden"` (класс `is-invisible`).
- **`el` импортируется под своим именем.** Сейчас в `Timeline`, `MonthPicker` и `Divider` он импортирован как `make`.

### 5. Тесты

- **`tests/ui/kit/Button.test.ts`.** Проверяет:
  - классы для каждого вида и тона;
  - `aria-label`;
  - иконка на месте;
  - `onPress` на клик;
  - `setOn`, `setOff`, `setHidden`.
- **`tests/ui/kit/icons.test.ts`.** Проверяет:
  - каждое имя рисуется;
  - в карте нет двух одинаковых путей под разными именами.
- **Старые тесты.** Те, что искали кнопки по старым классам, ищут по классу назначения. Классы назначения остаются.

## Не входит

- Окна, поднятые копии и подменю — этап 4.
- Любое видимое изменение.

## Проверка

1. Тесты, сборка, линтер.
2. Каталог экранов до и после: попиксельно одинаково.
3. Руками в тестовом Obsidian, телефон и Mac. Каждый вид кнопки нажимается и делает то же, что делал:
   - плюс: тап и тяга;
   - отмена;
   - стрелки дня и месяца;
   - кнопки полосы;
   - экран описания: Close, Edit, Save;
   - вопрос: Delete;
   - цвет в настройках, мышью и с клавиатуры.

## Итог

(заполняется после реализации)
