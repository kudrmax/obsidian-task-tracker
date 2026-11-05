# Блок 3 «Приоритет в тексте задачи»

Обзор: `2026-11-05-layers-overview.md`. Пакет ревью P3.

## Цель

Как префикс приоритета читается из текста, какие уровни годятся и что такое «пустой ввод» — одно правило в домене. UI спрашивает сервис.

## Где сейчас

- `ui/quick/QuickField.ts:39–41` `levelOfText`: `text.startsWith(`${prefix} `)` — ровно один пробел. Домен (`domain/TaskLine.ts` `FIRST_WORD_RE = /^(\S+)\s+(\S.*)$/`, `priorityOf`) принимает любой пробельный символ и требует непустой текст после префикса. Используется в `QuickField.ts`, `QuickEntryController.ts` (`levelOf`, выбор уровня).
- `ui/quick/QuickEntry.ts` `blank`: пусто = нет текста или только префикс. У сервиса пусто = `text.trim() === ""`.
- `ui/quick/QuickEntryController.ts` выбор уровня в панели срезает набранный префикс и ставит выбранный.
- `usableLevels(settings.priorities)` в `TaskCalendarView.ts`, `QuickEntryController.ts`, `QuickBar.ts`; сервис делает то же в `TaskServiceImpl`.
- `PriorityLevel`/`PriorityColor`/`PRIORITY_COLORS` импортируются из `settings.ts` в десяти файлах UI.

## Что сделать

```ts
// domain/Priority.ts
export function priorityOfText(text: string, prefixes: readonly string[]): { priority: string | null; text: string };
export function isBlankTitle(text: string, prefixes: readonly string[]): boolean;
/** `text` with `prefix` first in place of the one it had; null takes it off. */
export function withPriority(text: string, prefix: string | null, prefixes: readonly string[]): string;

// contracts.ts
export type { PriorityLevel, PriorityColor };
export { PRIORITY_COLORS };
interface TaskService {
  /** The levels that mark tasks, in the settings' order: one-word prefixes, the first of two alike. */
  priorityLevels(): readonly PriorityLevel[];
  /** The level a typed title starts with and the title without it, as the file will read it. */
  parseTitle(text: string): { readonly text: string; readonly priority: PriorityLevel | null };
  /** Nothing to write: no text, or a level's prefix alone. */
  isBlank(text: string): boolean;
  withPriority(text: string, prefix: string | null): string;
}
```

- `TaskLine.priorityOf` переходит на `priorityOfText` (тот же разбор).
- Сервис использует `isBlankTitle` для всех созданий: строка из одного префикса больше не создаёт задачу «p1» и в сервисе. Через UI это и сейчас невозможно (UI отсекает раньше), так что для пользователя ничего не меняется.
- UI: `levelOfText`, `usableLevels`, собственный `blank` и срезание префикса удаляются; поле ввода спрашивает `parseTitle`/`isBlank`/`withPriority`, меню и панель берут `priorityLevels()`. Импорты `PriorityLevel`/`PriorityColor`/`PRIORITY_COLORS` в UI идут на контракты (кроме вкладки настроек — блок 10).
- Демо-сервис: те же методы через доменные функции.

## Поведение

Одно выравнивание: поле ввода узнаёт префикс так же, как файл (`p1⇥текст`, `p1  текст` теперь подсвечиваются как приоритет, как их и читает файл). Набрать таб или двойной пробел на телефоне практически нельзя; на Mac это совпадение поля с тем, что окажется в файле. Остальное — как было: `p1 ` — пусто, выбор уровня в панели заменяет набранный.

## Готово, когда

- В `src/ui` нет `levelOfText`, `usableLevels`, `startsWith(` по префиксу.
- Тест: для набора строк (`"p1 x"`, `"p1\tx"`, `"p1  x"`, `"p1 "`, `"p1"`, `"p1x"`, `"x"`) поле ввода и файл отвечают одинаково.
- Страж: строки `settings` для перечисленных файлов UI вычеркнуты.
- `npm test`, `npm run build`, `npm run build:demo`; проверка в Obsidian: набор `p1 задача` на телефоне и Mac подсвечивает уровень, выбор уровня в панели работает.
