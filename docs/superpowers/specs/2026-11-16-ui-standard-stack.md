# Plugin UI on the standard frontend stack

Supersedes [`2026-11-15-ui-refactor.md`](2026-11-15-ui-refactor.md) (revision 15 and everything before it). That spec designed our own engines; this one replaces them with the libraries every app uses.

## Goal

Max uses the screen every day, on the phone and on the Mac. It must:

- show no visual bugs: no card jumping, doubling, flickering or landing in the wrong place;
- move smoothly: every card that changes place glides there, the same way every time;
- never lag, with a real task file of a few hundred tasks;
- behave the same everywhere: the main screen and the block in a note, phone and desktop.

Five days of hand-written animation, several drag controllers, per-place code and guards against duplication produced the bugs instead. The fix is not a better engine of our own but no engine of our own.

## The stack

| Concern | Choice | Why |
|---|---|---|
| Rendering | **React** (replaces Preact) | The most standard choice; Obsidian's plugin docs show it; no `preact/compat` risk with the libraries below. |
| State | **Zustand**, one store per screen | Components subscribe to a slice by selector, so a changed card re-renders only that card (the 16 ms budget), and the runtime can push into it from outside React. |
| Animation | **Motion** (`motion/react`) | `layout` and `AnimatePresence` animate any position change and any enter/exit with no code of ours. |
| Drag and drop | **dnd-kit** (`@dnd-kit/core`, `@dnd-kit/sortable`) | Sortable lists, moves between columns and sections, droppable time grid, touch/mouse/keyboard sensors, auto-scroll. |
| Popovers, menus | **Floating UI** | Positioning, flipping and dismissal of anything that floats. |
| Long lists | **TanStack Virtual** | Only if measurement shows the need. |
| Layout | **CSS** flex/grid with the `--tc-…` tokens in `styles.css` | Plain class names under the `tc-` prefix; `tests/styles.test.ts` keeps guarding the tokens. |

Settings stays on Obsidian's own `Setting` UI.

## Architecture

```
core door (TaskCalendarPhone, unchanged)
   ↓ calls                       ↑ results
runtime: replica + write queue (obsidian/runtime, unchanged)
   ↓ snapshot                    ↑ actions
screen store (Zustand): state + actions
   ↓ selectors                   ↑ dispatch(action)
components: TaskScreen → Column → TaskList → Card …
   ↓ mounted by
hosts: the main screen leaf, the note block
```

- **Data flows one way.** The UI is a function of the store's state. A user action dispatches an action; the action goes through the runtime's write queue to the core; the new snapshot comes back into the store; React redraws; Motion animates whatever moved.
- **One `<TaskScreen place={…}>`.** The leaf mounts it with `place: "main"`, the note block with `place: "note"` and the subset it shows. They differ only by props, never by code paths.
- **Components never touch the DOM directly**: no element moved, measured or styled by hand.
- **Components never read the platform**: phone or desktop, theme, width come in as props from the host.
- **Components never decide product rules.** What is offered, what a drop writes, where a new task goes, what is overdue: the core decides, through the door (`CLAUDE.md`, «The UI decides nothing»). A component only draws and turns gestures into actions with places and minutes.

## How the stack solves the recurring problems

| Problem | Solved by |
|---|---|
| Card animations | Every card is a `motion` element with `layout` and a stable key (the task id), inside `AnimatePresence`. Drag, keyboard, new task, sync: same animation, because it is driven by the state change, not by its cause. |
| Drag between lists | One `DndContext` per screen. Lists are `SortableContext`s, the time grid is a droppable. The app handles only `onDragEnd` and dispatches one move action. The same serves settings row reordering. |
| Same behaviour in the note and the main screen | Both mount the same `TaskScreen`; only props differ. |
| Phone vs desktop | CSS media and container queries for layout; the platform as a prop; dnd-kit's touch and pointer sensors for input. The ribbon is CSS scroll-snap; where a swipe lands (one place, never two) stays the core's `rules.swipeLanding`. |
| Menus and popups | One `Menu`/`Popover` component on Floating UI; its items come ready from the core. |
| Input fields | Obsidian's editor embedded as one `ObsidianEditor` component: it owns the editor instance, reports text through callbacks, and is the only component allowed to hold a DOM ref. |
| Keyboard shortcuts | Obsidian's commands and `Scope`, registered once by the host, dispatch the same actions as taps. No per-component key listeners. |

## The old UI's code

Replaced wholesale, then deleted (`trash`): `obsidian/ui/` motion, drag, layouts, guards and per-place code go. Old and new are never shipped side by side; no flag switches between them. `obsidian/runtime/`, `core/`, the door and the iPhone app stay as they are.

## Acceptance criteria

- Every behaviour described in `docs/plugin/` works on the phone and on the desktop, in light and dark, checked in the test Obsidian.
- No long task over 16 ms on normal interactions (tap, drag, drop, typing, switching place) with ~300 tasks, measured with the Performance panel over CDP.
- No hand-written animation or drag code. One lint rule over `obsidian/ui/` fails on `animate(`, `getBoundingClientRect` and pointer/touch/mouse event listeners; the only allowed exception is the `ObsidianEditor` component.
- All tests green: core, architecture, styles, `uiDecides`, and `npm run test:apple`.

## Rough stages

1. React, Zustand store over the runtime, `TaskScreen` with static columns and cards, mounted in the leaf and the note block.
2. Motion for layout and enter/exit; dnd-kit for lists, sections, columns and the time grid.
3. Menus, the editor component, keyboard commands, the remaining places and screens from `docs/plugin/`.
4. Delete the old UI, add the lint rule, measure, check both platforms and both themes, release.
