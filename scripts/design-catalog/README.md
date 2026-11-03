# Каталог экранов

Снимает каждый экран Task Calendar в тестовом Obsidian: телефон 390×844 или окно Mac 1280×820, тёмную или светлую тему. Нужен, чтобы сравнивать сборки попиксельно. Рефакторинг, который обещает «картинка не меняется», проверяется так: снимки до и после должны совпасть.

## Как запускать

1. Тестовый Obsidian со своим профилем и scratch-хранилищем, на свободном порту отладки (CLAUDE.md, «Trying a build»):

   ```bash
   open -n -a Obsidian --args --user-data-dir=<scratch>/obsidian-user --remote-debugging-port=9345
   ```

2. Сборка, которую снимаем, лежит в `.obsidian/plugins/task-calendar/` хранилища. После копирования плагин нужно перезагрузить.
3. Снять все четыре вида:

   ```bash
   for p in phone mac; do for t in dark light; do PORT=9345 node scripts/design-catalog/catalog.mjs <out> $p $t; done; done
   ```

4. Сравнить две папки:

   ```bash
   python3 scripts/design-catalog/diff.py <before> <after>
   ```

## Что делает скрипт

- **Записывает в `tasks.md` хранилища эталон** из этой папки. Если хранилище нужно сохранить, сделайте его копию заранее.
- **Останавливает часы страницы на 03.11.2026, 12:00.** Таймлайн и полоска текущего времени стоят на месте, поэтому два прогона одной сборки совпадают полностью.
- **Открывает экран плагина заново** и проходит по состояниям: каждое открывается, снимается и закрывается. Наведение, нажатие и фокус задаются через CDP `CSS.forcePseudoState`.

## Состояния

Перечислены в `states` в `catalog.mjs`:

| Где | Состояния |
|---|---|
| Везде | `main`, `soon`, `inbox`, `menu`, `section`, `picker`, `confirm`, `group`, `sources`, `sheet`, `quick`, `drag`, `undo`, `settings`, `active-handle` |
| Только Mac | `hover-row`, `hover-plus`, `active-tile`, `focus-arrow`, `hover-tile-on`, `hover-day`, `focus-row`, `focus-seg`, `hover-sheet` |
| Только телефон | `active-row` |

`hover-tile-on` ставит карточке первый уровень приоритета через меню и снимает его на выходе.

Новое состояние добавляется туда же: как в него попасть и как из него выйти.

## Tap and iPad probe

`node scripts/design-catalog/tapcheck.mjs` switches the test Obsidian to the phone view and, in the main screen, the task menu, the date picker, the delete question, the sources window, the description and the quick bar, gives every visible plugin button Obsidian's tap mark `.mobile-tap` and prints each button whose ground, shadow or padding changes. `TAB=1` does the same with the body marked `.is-tablet` (Obsidian's iPad button padding). Each button is read with its transitions off: Obsidian's buttons ease their ground, and a read at once would still see the old one. An empty state means no button changed.
