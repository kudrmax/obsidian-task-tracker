# Projects screen: long-term planning

Status: plan, waiting for Max's yes. Max's spec: «Спека — экран Projects» (2026-11-11). Boards: the canvas «Проекты: дерево
и задачи» (https://claude.ai/artifact/LzBy4xktpJtsJPM7Ppo33G): pages «Экран», «Дерево: варианты» → variant В, «Десктоп».
Where this file and the boards disagree, the boards win.

## The idea

The funnel (Inbox / Backlog → Soon → Today → calendar) answers «when» and stays as it is. A new screen, Projects, answers
«what is this for and what do I take next»: the whole project tree on the left, the chosen node's tasks on the right.

## What Max gets

1. **Projects are one thing, nested to any depth.** A result is a nested project. A project is a name kept by the app; a
   note is optional (a note of the same name is the project's note). A project is made as fast as a section.
2. **A task may have several projects.** It shows in each of them; its place in the funnel is one.
3. **A project's status is computed, never set:** active — a task in Today, Soon or with a date; waiting — open tasks only
   in Backlog and Inbox (grey name); done — every task done, the project goes to Done, a new task brings it back; a new
   empty project waits until its first task.
4. **Inbox and project are independent.** A task in Inbox may already have a project.
5. **A folded task with subtasks shows its next open subtask** — every such task, at any depth (a subtask with subtasks
   too), as a result does today. Results go entirely: `🎯`, Make result / Make task, the Add to result page and the
   Result mark setting.
6. **Grouping by project inside the funnel's columns goes** (groups in Backlog and Soon, Group by project). The folder mark
   on the card stays.
7. **The Projects screen** exactly as Max's spec and the boards: wheel position left of Inbox (plugin), a Projects tab left
   of Inbox (iPhone), the tree (variant В), the divider, By project / By stage, drag onto the tree, the Project page with
   checks and «New project…», the plus into the tree or the tasks, the path in search, the desktop board.

Done when: each item works in the plugin (phone view and desktop, light and dark) and in the iPhone app, seen on screen.

## How it is stored (the core's decision)

Constraint: `TODOs Tasks.md` stays the only truth, everything works by hand and offline (the app reads only that file).

- **The tree is a heading of the tasks file, `## Projects`, a nested list of plain names**, after Inbox:

  ```
  ## Projects
  - Окружение в Сербии
    - Где знакомиться
      - Приложения для знакомств
    - Свидание
  - Дружба [[Моя заметка о дружбе]]
    - Small talk
  ```

  Order of lines = the manual order; indent (two spaces or a tab) = nesting. A line is a plain list item, not a task.
  **A project is not a file.** Its name is plain text, never a wikilink (`[[…]]` is a note in Obsidian). Only a project
  Max attached a note to carries that note's link after its name, on its tree line alone; tasks never carry links.
- **Names are unique in the tree** (case and Unicode composition aside, as today's `projectKey`). The task names its
  project by name only; the path comes from the tree. «New project…» with a taken name offers that project.
- **A task's projects: one `🗂️` field per project**, `🗂️ Дружба 🗂️ Small talk`, written in the field's place today. A
  name runs to the next field's mark or the line's end. Today's `🗂️ [[Дружба]]` is read as `Дружба` and rewritten plain
  by the one-time move. A subtask's projects are its parent's, as today.
- **A task's project missing from the tree** (typed by hand) is shown as a top-level project at the tree's end and written
  into the tree on the next write the app makes anyway; nothing is lost.
- **Status, Done, waiting** are computed from the tasks every time; nothing about them is stored.

## The new projects replace the old ones completely (Max, 2026-11-11)

Nothing of the old model stays, in the core, the plugin, the app or docs/plugin:

- the project tag and the Project tag setting; projects found from notes (the `Projects` port, the metadata cache);
- «New project…» making or tagging a note, and a project being a note at all: a project is a name in the tree; a note
  is attached only by its link on the tree line;
- the block at the end of a project note (the screen filtered to the project) and the app's project view: the Projects
  screen is the one place of a project;
- the groups by project in Backlog and Soon, Group by project, the drop on a column title «by project», the per-project
  section actions;
- results: `🎯`, the Result mark setting, Make result / Make task, Add to result, New result….

Only the data carries over, by the one-time move below.

## Moving to the new model (once, by the core, on the first write)

- Today's projects (notes with `#project`, and the names in tasks' `🗂️`) become the top level of `## Projects`, by name;
  nothing is written into the notes.
- The two `🎯` lines in Max's file (`МТС`, `iPhone`) lose the mark and stay tasks with subtasks: under item 5 they show
  their next step as before. They don't become projects: a result was a task, and the spec makes a task with subtasks
  show its next step anyway. Max moves one into the tree by hand if he wants it as a project.

## Stages

Each stage ends in tests, an on-screen check and a merge, as CLAUDE.md «Agents» says.

1. **Core** (`backend`): the `## Projects` tree (read, write, reorder, nest, rename, create), several projects per task,
   the computed status, the tree model, the By project / By stage models, the drop targets on the tree, the Project page
   with checks and «New project…», the plus into the tree and into the tasks, the search path, the next subtask for every
   task, the removal of results and of grouping, the one-time move, the door functions; docs/plugin's file.md and
   agents.md.
2. **Frontends at once**, each in its own worktree from the core's branch: `frontend-obsidian` (wheel position, screen,
   desktop board, drags, docs/plugin screen.md and tasks.md), `frontend-swift` (Projects tab, screen, drags).
3. **Review** (`reviewer`), then the lead checks both platforms on screen (test Obsidian phone + desktop, light + dark; the
   iPhone app in a simulator), merges, releases the plugin and installs the app.

## Decisions

(Filled by the agents as they go.)
