# Projects screen: long-term planning

Status: approved by Max 2026-11-11, being built. Max's own spec, in his words: `2026-11-11-projects-screen-max.md` beside
this file; it and this file are one spec. Boards (approved): `docs/design/canvas/projects-screen/` — `Main` (a project, By
project), `ByStage`, `Drag` (drop onto the tree), `AllStage` (All, By stage), `Nav` (how to get there), `TreeC` (the tree,
variant В), `SubSel` (a subproject chosen), `DeskProj` and `DeskAll` (desktop). Source canvas:
https://claude.ai/artifact/LzBy4xktpJtsJPM7Ppo33G. Variants А, Б and Г of the tree were rejected.
Where this file and the boards disagree, the boards win.

## The idea

The funnel (Inbox / Backlog → Soon → Today → calendar) answers «when» and stays as it is. A new screen, Projects, answers
«what is this for and what do I take next»: the whole project tree on the left, the chosen node's tasks on the right.

## What Max gets

1. **Projects are one thing, nested to any depth.** A result is a nested project. A project is a name kept by the app, not a
   file. A note is optional: a project has none unless Max attaches one, and then only its tree line holds the link
   (never by a name match). A project is made as fast as a section.
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

- Today's projects are notes, and the notes stay: each becomes a top-level project of `## Projects` with its note
  attached, `- Дружба [[Дружба]]`. The project takes the note's name once; from then on they are two names: renaming the
  project leaves the note's file as it is, renaming the file (Obsidian fixes the link on the tree line) leaves the
  project's name. Nothing is written into the notes.
- Tasks' `🗂️ [[Дружба]]` become `🗂️ Дружба`: a task names its project, and the note hangs on the project.
- A name in a task's `🗂️ [[…]]` with no note behind it becomes a project without a note.
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

1. **The project's menu** (lead, 2026-11-11; Max: «на твое усмотрение»). A long press in the tree lifts a project to
   reorder or nest it, so the menu opens elsewhere: a tap on the chosen project's name over the tasks, as a tap on
   «Backlog» opens that column's menu today. Rows: Rename, and Note. Without a note, Note in the plugin opens a search of
   the vault's notes and the picked one is attached (its link written on the tree line). With one, the row shows the note's
   name: a tap opens the note, and the row's Detach takes the link off (the file stays). The iPhone app opens an attached
   note in Obsidian (`obsidian://open`) and cannot attach one: it sees only the tasks file. All, No project and Done have
   no menu.

### Backend (the core's contract)

2. **`## Projects`** is a fixed heading (not a setting), made right after Inbox (at the file's end without Inbox) on the
   first write that has a project to put in it. Its list items that are not task lines are the tree; a tab is as deep
   as two spaces; the tree is written back with the indent it was read with (a tab when it had none), where its first
   item stood; any other line of the section stays where it was. A name met twice (case aside) is the first one, the
   second's subprojects joining it.
3. **The field's place: right after the title, before the labels and every other field**
   (`- [ ] Call 🗂️ Дружба 🗂️ Small talk #label/Fast 📁 📅 …`), not after the labels as the old `🗂️ [[…]]`. Max's phone
   keeps the app of master 0.4.189 until the new app follows, and that core reads a plain field as part of the title and
   writes the title before the labels: in this order every line it rewrites comes back byte for byte.
   `tests/phone/oldAppKeepsProjects.test.ts` runs master's bundle (moves, Done, rename, add, a subtask taken out, a new
   time) on a file of the new format: `## Projects` and every `🗂️` field survive. Until the new app, the old one shows
   the fields inside titles, draws every task under No project, and a subtask it takes out of its parent does not carry
   the parent's projects.
4. **A name runs** to the next `🗂️`, a tag (`#…`) or a field's mark as a word of its own (`📅 ⏰ 🚨 📌 🔕 🔁 📁`, as the
   settings name them), else to the line's end; it is trimmed; the same project twice is once. The old `🗂️ [[Note]]`
   reads as the note's name, an alias or heading left out, and what follows the link stays text. A name typed for a new
   or renamed project (`cleanProjectName`) is put on one line, single spaces, without `[ ]`, a tag's `#` or the mark.
5. **Status, per branch.** Active: an open task of the project or of any subproject is in Now or Soon or has a date or
   a time. Waiting: otherwise, while an open task of the branch waits in Inbox or Backlog, or the branch holds a project
   with no task at all (a new subproject keeps its parent from Done). Done: every task of the branch is closed and every
   subproject is done. Closed tasks count wherever they lie; open ones only in the funnel.
6. **Done in the tree.** A done project leaves its place with its branch and shows under the Done row, which is folded
   until tapped (a tap on the chosen Done opens or closes it); a done subproject of a live project shows there too, at
   the top of its own done branch. Choosing a done project or Done shows the closed tasks; its plus writes nothing; a
   done project is not lifted. A new task brings it back to its place.
7. **The device's screen** is `ProjectsScreenState` `{ selected, mode, folded, doneOpen }`: in the plugin through the
   `ProjectsScreenStore` port (its local storage), in the app as the door answers `projectsScreen`. Nothing chosen: All,
   By project. A node is `"all"`, `"none"`, `"done"` or `"project:<name>"`; a name the tree lost falls back to All; a
   rename carries the choice and the fold to the new name.
8. **A node's tasks** are its open top-level tasks in the funnel (a subtask goes with its card), in funnel order (Today,
   Soon, Inbox, Backlog) then the file's. By project: the node's own first, untitled, then a part for every subproject at
   any depth in the tree's order (`title` its name, `path` and `depth` below the node), an empty part left out; a task of
   two of them is in both. All: a part per live project; No project: one untitled part. By stage: Today (Now), Soon,
   Inbox, Backlog, each with `over` the subproject the task is in (none for the node's own; All: the task's first
   project). The card's `stage`: Today for Now, the date (`DueLabel`) for a Soon task with a day other than today, else
   the list's symbol.
9. **A card dropped on the tree** replaces the project it was shown under (`ProjectsCard.from`: the part's project, By
   stage the one `over` names or the node) and keeps the others; on No project it loses that one; All and Done take no
   drop; a subtask's key names its top task. Its place in the funnel never changes.
10. **The plus let go on the tasks** writes at the end of Inbox with that part's project (By project), at the end of that
    stage's list with the node's project (By stage; Today is Now, dated today), or at the end of Inbox with the node's
    project outside any part; nothing in Done. Inbox first, because a task named in a project is not yet sorted in time.
11. **The plus or a lifted project in the tree** lands by `projectsGap(rows, gap, depth, lifted)`: a gap's depth runs from
    the row below's to one deeper than the row above's (a shift to the right nests), the lifted project's branch left
    out; let go deeper than a folded row, it goes last into its branch. A new project is chosen at once. A taken name
    makes nothing (`createProject` answers null); a rename to a taken name writes nothing (false), never merges.
12. **The Project page** holds the whole tree in its order (`depth` its indent), done projects too, a check on each project
    every task has; a pick toggles it for all (`toggleProject`), No project takes them all off, «New project…» makes a
    top-level project last and checks it (a taken name: that project). The row's value: «Дружба», «Дружба +1», «No
    project», or empty when the tasks differ. The quick entry's button stays one project: a rename writes it only when
    the button was touched, then the task's projects become that one.
13. **The one move is a write of its own, as tidying is.** Whenever the core reads the file (the plugin's start, a change
    from outside, every screen, the door's reads) and the file awaits the move (an old `🗂️ [[…]]` field or a `🎯` line
    anywhere, a `## Projects` written by hand stopping nothing; or no `## Projects` while a note that was a project or a
    task's project waits to go in it), the move is part of today's tidying: written at once, before any action, and no
    step of undo (Max can't take the migration back by Cmd+Z). So every action, and every key the screen hands out, works
    on the moved file. The move: the notes the host knows (the plugin's `Projects` port by the old Project tag, the app's
    `context.projects`) by name, a project of that name already in the tree getting the note, then each name a task
    gives; only the lines with an old field or the mark are rewritten; the mark is the settings' old `resultMark` (`🎯`),
    a priority after it read as the priority. The move waits until the host's notes are complete (the `Projects` port's
    `ready()`: the plugin's metadata cache resolved; the door takes `context.projects` as complete), since a note missing
    then would never be attached. To a file with a tree already (old fields written later: by hand, or the app of 0.4.189)
    it attaches only the notes an old field names, never a note a tree line holds already, so a renamed project gets no
    empty twin. Every `## Projects` of the file (Sync may merge two) reads as one tree, the first name winning, and is
    written back as one under the first heading.
14. **Every action's write puts the tasks' projects in the tree**, one the tree lacks last at its top.
15. **The next step** is any folded task's with an open subtask, on its card and its timeline block (the block now only
    while folded, as the card); `TaskCard.semibold` went with results.
16. **Search** gives each hit `projectPath`, its first project's path in the tree.
17. **The note.** The menu's `note` names the attached note by its link's last part; the app opens it with
    `projects.noteUrl(link, vault)` (`obsidian://open?vault=…&file=…`, an alias or heading left out). Attaching is the
    plugin's (its note search, then `setProjectNote(name, link)`); a link typed with `[[ ]]` is taken without them.
18. **The old settings** `projectTag` and `resultMark` stay in `data.json`, read only by the move; the settings form has
    neither field and the door neither setter (removed in the final pass, with every other stub of the old model).
19. **The wheel** is `SCREEN_PLACES` with Projects first, left of Inbox, a place of its own (`SHOWN_LISTS.projects` `[]`),
    and `stepScreen` walks it: back from Inbox and Soon, or from Done, to Projects; on from Projects to Inbox. While the
    frontends were built it stood apart as `WHEEL_PLACES`/`stepWheel`; the final pass folded it in. `swipeLanding` is
    untouched.
20. **A card held over a folded row** opens it by `unfoldProjectNode`, the choice kept. A tap reads the file first, so a
    tap before any screen was read still folds the chosen node.
21. **Grey rows**: `ProjectsRow.muted` for a waiting project, a done one, No project and Done; All and an active project
    are not. **`projects()`** is the tree's projects for the quick entry's button. **`toggleProject`** answers the tasks as
    they then stand, found by their ids.
22. **A menu's Project page reads no file.** `ScreenView.projectTree` is the tree's projects in its order; a frontend
    hands it in as `MenuScreen.projects` with every `tasks.menu` and `tasks.bulkMenu`, the plugin and the app alike, so the
    app's menus stay asked over the settings alone. Left out, the plugin's service takes the tree of the file it read
    last and the door the tree of `tasks` when handed in.

53. **Review round (core).** A task of two parts is two cards: `ProjectsCard.id` is unique per drawn card and
    `ProjectsCard.drop` (`{ key, from }`) is what `dropOnProject(cards, to)` takes, so a drop replaces the project of the
    very card let go. `canDrop` is false for a closed task (under Done). The hover delay over a folded row is
    `PROJECTS_HOVER_MS` (600: the core had no hold delay of the day arrows to reuse), a sideways step `PROJECTS_INDENT`
    (12), and `projectsDrop(rows, gap, shift, lifted?)` keeps a lifted project's own depth until the finger shifts a step.
    A typed name loses the field marks standing as words; `isBlankProjectName` is the Create button's rule. Search finds
    a task by any of its projects.

### Obsidian frontend

23. **The wheel at Projects** (board Nav). The window stays two icons wide with the folder alone in its middle: the
    other icons are hidden inside it, Inbox beside it in the track at full size, Soon a step smaller. At Done, which has
    no icon, the window now holds Inbox alone in its middle the same way (it stood half empty, a step left of Inbox).
    The wheel keeps the plugin's own icons (the folder is the card's project mark; Inbox, Backlog, Soon, Now as today),
    not the boards' slightly different drawings of them.
24. **Done is never seen on a swipe.** Done waits left of Inbox where Projects slides in: it is hidden except at its own
    place (the search) and while the window leaves it.
25. **The tree's width.** The divider sets it as the day list's divider sets the list's (same bounds, the same hold to
    the middle), kept per device in the plugin's own view settings (`treeWidth`, never synced). Until dragged: half the
    window on the phone; on the desktop the column of DeskProj (300 px of tree, 20 px from the view's edge).
26. **Grey names** follow `ProjectsRow.muted` (core decision 21): No project and Done always, as the boards draw them.
27. **The right side of a card.** By project the stage's mark (or the date, for a dated Soon task) takes the date's
    place, the card's own due date is not drawn beside it; By stage the card shows its date as in any list.
28. **A folded task in By stage**: its two-line card shows the subproject (folder mark and name) on the small line and
    its next step under it; the folded task's own title shows in By project.
29. **A folded task's small line has no symbol.** The target was the result's mark; every folded task now shows its
    next step, and the small line is its own title alone.
30. **The Project page keeps its checks open.** A project tapped is toggled and the page is drawn again for the next
    one; No project takes every project off and closes. Each project stands a tree indent (12 px) further in per level.
    The checks are drawn from the tasks `toggleProject` answers.
31. **The project menu** (decision 1) in the plugin: the title stays over the blur in its own size; Rename types the new
    name in place of the title (the section name's capsule); «Attach note…» (a plus) opens Obsidian's fuzzy search of
    the vault's notes and attaches the pick as the link Obsidian writes from the tasks file; with a note, its name (the
    open-file arrow) opens it in a new tab and Detach (a cross) takes it off.
32. **The plus on the Projects screen** has no quick bar: it opens the section name's capsule — at the gap of the tree
    («Project name»), or after the part's last card among the tasks («New task»; a priority's prefix typed first still
    sets it). A tap on the plus there opens the task field at the end of the tasks (`ProjectsView.newTask`).
33. **The depth of a gap in the tree.** The plus takes the depth of where the finger stands, a step per tree indent
    (12 px) from the tree's left edge. A lifted project keeps its own depth until the finger shifts sideways, a level per
    indent either way: let go where it was lifted, it stays where it was (it used to nest a level deeper). Both within
    `projectsLevels`.
34. **A lifted project** is its row on the float's ground with the lift shadow; its place in the tree dims.
35. **The search path** shows only in a search opened from the Projects screen, on the card's small line after the
    folder mark, the names joined by « › »; the card's folder mark is left out there (the path says it), and so is the
    description's line.
36. **The card's folder mark and the full screen's project line** open the Projects screen on that project
    (`selectProjectNode`), the wheel turning there.
37. **A wide card held by its far side** (a desktop list, the tasks of the Projects screen): the float under the finger is
    held by its middle once the grab lies further right than the float reaches; it used to hang far left of the finger.
38. **A card held over a folded row** opens it after a long press's time (the Long press setting), the tree alone drawn
    again so the card carried from the tasks stays under the finger; leaving the row before then opens nothing.
39. **Over the tree the carried card rides above the finger.** Held over the tree, the card leaves its stretched,
    whole-title look for its own capsule (the float's 190 px, the title fading) and stands 16 px above the finger, its
    middle over it, so the row it will land on, filled with the drop's colour, and the plus's or a lifted project's drop
    line stay in sight under the finger. Back over the tasks it is the whole card held where it was grabbed. A lifted
    project rides 16 px below the finger instead: its drop line sits between rows, and the row above the line is the one
    it would nest under, so that row and the line stay seen. The plus already stands aside of the finger and keeps doing so.

### iPhone app (frontend-swift)

41. **(Obsolete since Decision 22: menus carry `projects`.)** **The Project page is read over the tasks file when it opens.** The app draws a card's menu over the settings alone
    (no file per card), and such a menu's `project.options` hold only the task's own projects. The Project row is drawn
    from that menu (its value is right), and its page is asked again, over the file, as it opens (`tasks.bulkMenu` of the
    tasks) — the whole tree. The New Task sheet's `capture.project` is read over the file too.
42. **A subproject on a Project page in the app's menus** shows its parent's name as the row's subtitle, not an indent:
    an iOS menu row has no indent, and one faked with spaces wraps a long name back under its parent.
43. **No vault scan on the phone.** The app hands the door no `context.projects`: projects are the tree, and the one
    move made by the app (if it writes first) makes each `🗂️ [[Note]]` a project without its note attached; the plugin,
    which knows the notes, attaches them when it moves first. Max's plugin is released first, so the move is its.
44. **The Projects tab** is the ribbon's first place, the whole screen wide, left of Inbox: a swipe right from Inbox
    goes there, one place as every swipe (`RibbonColumns(projects:)`; Inbox and Soon still split the screen in half). A
    tab moves the ribbon by the scroll view's own animation, which a finger stops where it is, and the tab bar follows
    the ribbon whatever moves it.
45. **The plus on the Projects page** asks a name in an alert, as New Section and New Project do: let go on the tasks,
    «New Task» for the part it is let go in (`newTask` of that part, else the view's); let go in the tree, «New
    Project» for the gap the line shows, at the depth the finger stands at, one level per 24 points past the tree's edge.
    A lifted project keeps its own depth until the finger shifts, a level per 24 points either way. Both are kept
    within `projectsLevels`. The app's typed-in-place field belongs to the funnel's lists.
46. **The project menu in the app** (Decision 1): Rename; with a note, a «Note» group holding the note's name (opens it
    in Obsidian, `projects.noteUrl`) and Detach; without one, Rename alone, as the app cannot attach.
47. **By stage on the app's card**: the subproject small over the title after a folder (`ProjectsCard.over`); on a folded
    task it takes the small line's place, the next step's title staying the title.
48. **The stage's symbol** on a card By project is the tab bar's: sun Today, hourglass Soon, tray Inbox, an archive box
    Backlog; a date is the usual date corner.
49. **A card's folder mark and the full screen's project line** open the Projects tab on that project
    (`tasks.selectProjectNode`).
50. **Search opened from the Projects tab** shows each find's `projectPath` under its title, «Дружба › iPhone», in the
    line where the project's name stands otherwise.
51. **The tree's width** is the divider's, kept on the device, within the bounds the core gives a list beside the
    calendar (`rules.listWidths`), as Today's divider.
52. **Over the tree the carried copy rides above the finger** (16 points over it, gliding there as the finger enters
    the tree and back as it leaves): a card's target is the row under the finger, lit in the drop's colour, and a lifted
    project's or the plus's is the line under it; neither may be covered. Elsewhere the copy stays where the finger took
    it. The card keeps its own width; a lifted project's own row stays as its faded place.
54. **Review round (app).** A task shown in two parts is two cards keyed by `ProjectsCard.id`, each dropped by its own
    `ProjectsCard.drop` (`tasks.dropOnProject([card.drop], node)`); `canDrop` is the core's alone. The tree's depth is
    `rules.projectsDrop` with the finger's sideways way: since the lift for a lifted project (it keeps its depth until
    the finger shifts a `PROJECTS_INDENT`, 12 pt), from the row above the gap's depth for the plus (the depth the finger
    stands at). A held card opens a folded row after `PROJECTS_HOVER_MS` (600). This replaces the 24 pt steps of 45.
55. **A lifted project rides 16 pt below the finger** (cards still above it over the tree), as the plugin's 39: its line
    and the row above the line stay seen. Replaces the lifted-project half of 52.
56. **The plus held over the tasks shows the drop line** after the last card of the part under the finger (over the
    first part above them all), as the plugin's; let go, the alert asks the task's name for that part.
57. **The plus held in the tree** finds gaps only from before the first project to before No project: never above All
    nor among Done's rows.
58. **A tap on the plus on the Projects tab** opens the New Task sheet with the chosen node's project
    (`ProjectsView.newTask.project`), as the plugin's tap writes it there.
59. **The Project page of a task's menu stays open after a pick**, drawn again with the new checks; No project and «New
    project…» close it, as the plugin's 30. The quick entry's button and the New Task sheet pick one project and close.
60. **Blank names** follow the core: the alert's Add is off for `tasks.isBlankProjectName` (a project, a rename) or
    `tasks.isBlank` (a task), never the app's own trim.
