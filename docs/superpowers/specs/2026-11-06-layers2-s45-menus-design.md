# S4 «Меню задачи» и S5 «Массовые действия»

Ревью `layers-review-2`, пакеты S4 и S5. Меню одной задачи и меню выбранных решали сами, что предложить, что погашено и что запишет нажатие. Оба меню теперь рисуют одну модель из application; меню одной задачи — та же модель для одной задачи.

## Что переезжает

| Было | Правило | Куда |
|---|---|---|
| `TaskMenu.statusTiles`: `item.repeat !== null && item.repeatable` | Stop есть у задачи с повтором, которая может повторяться | `TaskItem.can.stop` |
| `TaskMenu.editRows`: `item.description === null` | Add description только без описания | `TaskItem.can.addDescription` |
| `TaskCalendarView.fold`: `item.subtasks.length === 0` | свернуть можно задачу с открытой подзадачей | `TaskItem.can.fold` |
| `TaskMenu.nextPriority`, `BulkMenu.bulkNextPriority` | тап по уровню, стоящему у всех (кому можно ставить приоритет), снимает его; иначе ставит всем | `TaskService.togglePriority(keys, prefix)` |
| `TaskMenu.nextLabels`, `BulkMenu.bulkNextLabels` | метка, стоящая у всех без приоритета, снимается; иначе добавляется в конец тем, у кого её нет; задачи с приоритетом не трогаются | `TaskService.toggleLabel(keys, name)` — отвечает задачами, как они теперь стоят |
| `BulkController`: `can.removeDue ? null : item.dueDate` | Remove due date снимает срок только у тех, у кого его можно снять, остальных пропускает | `TaskService.removeDue(keys)` |
| `quickMoves.moveTiles`, `BulkMenu.bulkMoveTiles` | Today, Tomorrow (день считается здесь), Pick a date; без дня, на котором задача уже стоит; у выбранных — объединение в порядке Today, Tomorrow, Pick a date; сделанную никуда | `TaskMenuModel.moves` |
| `priorityTiles`, `bulkLevelTiles`, `labelTiles`, `bulkLabelTiles`, `bulkProgress`, `bulkCanRemoveDue`, общий срок в `BulkMenu.showPicker`, общий раздел в `TaskCalendarView.bulkSections` | что горит, что погашено, что ставит In progress, есть ли Remove due date, какой день отмечен в календаре, какие разделы и какой отмечен | `TaskService.menu(items, today, offer)` → `TaskMenuModel` |
| `BulkController.carried`: `other.subtree.includes(p.card)` (по DOM) | выбранная подзадача под выбранным родителем едет с ним, а не отдельно | `TaskService.carried(lifted, picked)` по ключам |
| `TaskCalendarView.showGroupMenu`: `name === null` | у «Без раздела» нет меню | `ListGroup.can.rename`, `ListGroup.can.remove` |
| `TaskCalendarView.renameInPlace`: `to && to !== name` | пустое или то же имя ничего не пишет | `renameGroup` отвечает `true`, когда записал; экран перерисовывается, когда нет |

## Новые члены контракта

- `TaskItem.can.stop`, `.addDescription`, `.fold`
- `ListGroup.can: { rename, remove }`
- `TaskMenuModel`, `MenuLevel`, `MenuLabel`, `QuickMove`, `QuickMoveId`, `MenuSections`
- `TaskService.menu(items, today, offer?)`, `togglePriority(keys, prefix)`, `toggleLabel(keys, name)`, `removeDue(keys)`, `carried(lifted, picked)`
- `TaskService.renameGroup(...)`: `Promise<boolean>` (было `Promise<void>`)

Правила живут в `src/application/menus.ts` (чистые функции над `TaskItem`): модель и переключатели пользуются одними и теми же, поэтому то, что горит, и то, что запишет нажатие, не расходятся.

## Остаётся в интерфейсе

- Слова плиток и строк (Done, Stop progress, Notification…) — их выбирает фронтенд, контракт отдаёт виды (`QuickMoveId`, следующий статус, `ReminderKind`).
- «Add subtask» нет у подзадачи в стопке календарного меню: это свойство места, где открыто меню (в стопке нет места для поля), а не задачи; та же подзадача на весь экран подзадачу получает. Поэтому `can.addSubtask` не заводится.
- Повтор (панель и его умолчания) — пакет S8.

## Не меняется

Что видит пользователь и что получает файл. Одно исправление: в массовом меню уровень приоритета раньше горел, только если он стоял у всех выбранных, включая задачи с метками, у которых приоритета быть не может. С такой задачей в выборке уровень не загорался и не снимался повторным тапом. Теперь уровень считается, как метки: по задачам, которым можно ставить приоритет.
