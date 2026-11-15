# First step

Status: approved by Max on 2026-11-15 («Делай»). Plugin only for now; the rule lives in the core, so the iPhone app later
only adds the menu row.

## Why

Max often feels a task can be broken down and today does it by hand: the plus, a new subtask, a drag, a fold. First
step wraps that routine in one action: name the task's first step and see only it on the card. Later an AI (Claude or a
local model) will name the step on a button; it will call **the very same core command** with its text, never write
the file another way. So the command is the feature's centre: one call, a task and a text.

## What Max sees

1. **The row.** In the task menu, group «Правка», right after Add subtask: **First step**. On every open task and
   subtask, at any depth (a subtask is just an indent), in a list, on a day's list and on the timeline. On a folded
   card the row is for the whole task (like the rest of the menu but the status tiles), not for the shown step.
2. **The card folds at once.** The tap closes the menu and, in the same tap, the card becomes the folded card of two
   lines: small on top the task's own title (as a folded card draws it), and the big second line **is the input field**,
   empty, with the cursor in it (so the keyboard rises on the iPhone). It looks like the folded card's step line: same
   font, place and colours, as Rename makes a card its own field. It is clearly not Add subtask: no row appears under
   the task, the step is typed where it will be seen.
3. **Tasks with subtasks.** The step becomes the task's **first** subtask, before every one it has: n subtasks become
   n+1, the new one first. Folded or not before, the same.
4. **Enter** writes the step and the fold (`📁`): the card stays folded and shows the new step (it is the first open
   step). **Escape**, a tap away with the field empty, or Enter on an empty field write nothing: the card goes back to
   how it was (unfolded if it was). A tap away with text writes it, as Enter.
5. **Undo** takes the whole action back in one step: the step goes and the fold is as before.
6. The field gives no next field after Enter: one step at a time.

## The core

- One command in `application`, reached through the task service (and later the door): **first step: the task (its
  key) and the text**. It inserts the text as the first subtask of that task (a plain open subtask line, no fields of
  its own; a subtask's projects are its parent's) and sets the task's fold. Empty or whitespace text writes nothing.
  One undo step. Stale keys are rejected as for every write.
- The menu model decides where the row is (`TaskItem.can` or the menu model, as Add subtask is decided): an open task or
  subtask. The UI only draws it.
- What the folded card shows while typing (the over line) comes from the core as for any folded card, so the UI does
  not compose it.
- Tests for: a task without subtasks, a task with subtasks (goes first), an already folded task, a subtask at depth,
  empty text, undo, a closed task (no row).

## Not now

The AI button, its settings and prompts; the iPhone app's row. Nothing of them is built; the command is shaped so an
AI caller needs only a task key and a text.

## Decisions

(Filled by the agents as they build; each entry carried to both sides by the lead.)

- **Backend, the text.** The step's text is typed as the quick entry types a task: one line, trimmed, a list or
  checkbox marker at its start dropped, a priority prefix (`p1 `) read as the step's priority (the file reads it so
  anyway). A blank text, a priority prefix alone too, writes nothing.
- **Backend, the place.** «Before every subtask» means before the first subtask line of any status, done and given-up
  ones too; the task's description (lines without a checkbox) stays above the subtasks.
- **Backend, where the row is.** `can.firstStep` is true on every open task and subtask; the menu offers `firstStep`
  (right after `subtask`) from a list column (`day`, `soon`, `inbox`, `backlog`) and the timeline only. Not from a
  timeline card's stack (as Add subtask), not from Done, not from the full screen (it shows every subtask unfolded,
  there is no folded card to type on), never in the bulk menu.
- **Backend, the card with the field.** `TaskItem.firstStepCard` is the card the field is drawn as: `over` the task's
  own title, plain (as `card.over` of a folded card), `text`/`title` empty (the field takes the step line), `step` null.
  The same for a task and a subtask at any depth, folded or not.
- **Obsidian, the field.** The field is the quick entry's own field (`QuickField` with the title editor Rename uses), put in
  place of the step line of the tapped card; the card draws `firstStepCard` in place of its title and keeps the rest as
  it stands (counter, project mark, date, the fold's edge). The card, not the field, is ringed in the accent while the
  field is open, as every typing field's capsule is. The empty field shows the hint «First step». No quick bar: the step takes no
  place, section, project or repeat of its own, and a priority is typed as `p1 ` in the text.
- **Obsidian, a long text.** The field wraps and the card grows downward with it, as Rename's field does; after Enter the
  card is the folded card again, its step on one line fading out.
- **Obsidian, the timeline.** A block draws only its step's line (no room for the over line), so on a block that line
  itself becomes the field, the block's place and size kept; a long text grows the block downward over what is under it.
  No over line is drawn on the block while typing. After Enter the block is named by the new step.
- **Obsidian, the screen under the field.** In the tap that picks First step the screen draws the core's
  `firstStepScreen` / `firstStepProjects` once (the list's own fold motion takes the subtasks away; the card element is
  kept, so the field still takes the focus in that tap), then draws nothing else while the field is open (as while a
  section is named); a read that lands meanwhile is drawn through the same transform. After Enter or a tap away it
  draws the file as written, and the typed text stays on the step line until then, so the old card never flashes back.
  Escape, or a blank text the core writes nothing for, draws the screen as read: the subtasks come back with the same
  motion.
- **Obsidian, the row's icon.** First step's row has its own icon: a flight of steps (`M3.5 20h5v-5h5v-5h5V5h2`), right
  after Add subtask's arrow.
- **Backend, the fold at the tap.** The screen while the field is open is the core's: `TaskService.firstStepScreen(view,
  key)` and `firstStepProjects(view, key)` (door: `tasks.firstStepScreen`, `tasks.firstStepProjects`). Synchronous
  transforms of the view already drawn, not a new read option: the field opens in the same tap, so no file is read
  and nothing waits. The task (any list, the timeline, any depth) comes back `collapsed` (its subtask rows leave the
  lists; with no subtask yet the card still shows the fold's edge), `card` = `firstStepCard`, `block` empty with no
  step; on the Projects screen its row and card fold and the rows under it go. The UI passes only the view and the
  key, and draws the read view again when the field closes (Escape or blank: the subtasks come back).
