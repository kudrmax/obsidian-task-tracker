# Layers 3, R1: the menus decide nothing

The final layers review found the task menu, the bulk menu, the bulk controller and the view still deciding what a menu
offers. Each decision moves into `src/application/menus.ts` behind `TaskService.menu` / `bulkMenu`, so the TS UI and the
Swift UI only draw `TaskMenuModel`.

## What moves where

| Decision (before) | Now |
| --- | --- |
| Status tiles: Done, progress, Won't do always; Stop by `can.stop` (TaskMenu `statusTiles`) | `TaskMenuModel.statuses: MenuStatus[]` (`id`, `confirm`) |
| Progress tile naming (`progressLabel`), tile → status (Won't do → cancelled) | `MenuStatusId` names the tile (`inProgress` / `stopProgress`); `TaskService.pickStatus(keys, id)` writes it (`tileStatus`) |
| Rename / Reminder / Add description / Repeat / Section / Add subtask rows; no Add subtask from a stack | `TaskMenuModel.edits: MenuEditId[]`, decided with `MenuFrom` |
| Which picks ask first (single: Won't do, Stop, Delete; bulk: none) | `MenuStatus.confirm`, `TaskMenuModel.remove.confirm` |
| Bulk: raw `TaskStep[]` for status, postpone, remove | `pickStatus`, `postponeAll` (only where `can.postpone`), `removeAll` |
| When sections are offered (`sectionColumn` by DOM, `cards.every(...)`) | `menu(item, from, screen)` / `bulkMenu(picked, screen)`; `menuOffer` uses `columnSections` |
| Section page's check: single `name === current`, bulk `shared && name === current` | `MenuSections.options` (`name`, `checked`), `create` for New section |
| Bug: bulk drew an empty move group | drawn only with moves |

## New contract members

`MenuFrom`, `PickedTask`, `MenuScreen`, `MenuStatusId`, `MenuStatus`, `MenuEditId`, `MenuSectionOption`;
`TaskMenuModel.statuses/edits/remove` (the old `progress` goes: the progress tile's id carries it); `MenuSections.options/create`
(`shared` goes); `TaskChange` `{ kind: "stop" }`; `TaskService.menu(item, from, screen)` (was `menu(items, today, offer)`),
`bulkMenu`, `pickStatus`, `postponeAll`, `removeAll`. `TaskCalendarPhone` is untouched.

## Same as before

Every menu offers exactly what it did; the single menu asks before Won't do, Stop and Delete, the bulk one before nothing
and has no Stop; a label tap keeps the menu (and the selection), any other pick closes it and ends the selection.
