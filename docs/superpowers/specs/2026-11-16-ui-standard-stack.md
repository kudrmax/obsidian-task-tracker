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
| Rendering | **React** (replaces the hand-written DOM code in `obsidian/ui/`) | The most standard choice; Obsidian's plugin docs show it; every library below is made for it. |
| State | **Zustand**, one store per screen | Components subscribe to a slice by selector, so a changed card re-renders only that card (the 16 ms budget), and file changes from outside can be pushed into it from outside React. |
| Animation | **Motion** (`motion/react`) | `layout` and `AnimatePresence` animate any position change and any enter/exit with no code of ours. |
| Drag and drop | **dnd-kit**, the classic documented line (`@dnd-kit/core`, `@dnd-kit/sortable`, `@dnd-kit/modifiers`) | Sortable lists, moves between columns and sections, droppable time grid, touch/mouse/keyboard sensors with a delay for long press, auto-scroll, snap modifiers. |
| Gestures that are not drag and drop | **@use-gesture/react** with **Motion** springs | Ribbon and day swipes (drag and wheel), divider drag, timeline pinch zoom, resizing a task on the timeline: one hook per gesture, no pointer listeners of ours. |
| Popovers, menus | **Floating UI** | Positioning, flipping and dismissal of anything that floats. |
| Long lists | **TanStack Virtual** | Every task column, as stage 0 measured: only the visible cards are mounted. |
| Layout | **CSS** flex/grid with the `--tc-…` tokens in `styles.css` | Plain class names under the `tc-` prefix; `tests/styles.test.ts` keeps guarding the tokens. |

Settings stays on Obsidian's own `Setting` UI.

## Architecture

```
core: TaskService (core/application/contracts.ts, unchanged)
   ↓ reads                       ↑ writes
screen store (Zustand): state + actions
   ↓ selectors                   ↑ dispatch(action)
components: TaskScreen → Column → TaskList → Card …
   ↓ mounted by
hosts: the main screen leaf, the note block
```

- **Data flows one way.** The UI is a function of the store's state. A user action dispatches an action; the action calls `TaskService`; the new reads come back into the store; React redraws; Motion animates whatever moved.
- **One `<TaskScreen place={…}>`.** The leaf mounts it with `place: "main"`, the note block with `place: "note"` and the subset it shows. They differ only by props, never by code paths.
- **Components never touch the DOM directly**: no element moved, measured or styled by hand.
- **Components never read the platform**: phone or desktop, theme, width come in as props from the host.
- **Components never decide product rules.** What is offered, what a drop writes, where a new task goes, what is overdue: the core decides, through the door (`CLAUDE.md`, «The UI decides nothing»). A component only draws and turns gestures into actions with places and minutes.

## How the stack solves the recurring problems

| Problem | Solved by |
|---|---|
| Card animations | Every card is a `motion` element with `layout` and a stable key (the task id), inside `AnimatePresence`. Drag, keyboard, new task, sync: same animation, because it is driven by the state change, not by its cause. The card being dragged is shown in dnd-kit's `DragOverlay` and has layout animation off, so the two libraries never move the same element. |
| Drag between lists | One `DndContext` per screen. Lists are `SortableContext`s, the time grid is a droppable with a snap modifier to the zoom's step. The app handles only `onDragEnd` and dispatches one move action. The same serves settings row reordering. The project tree nests by a sideways move, as dnd-kit's documented sortable tree does. |
| Swipes, divider, day slide, resize | @use-gesture reports the gesture; the core decides where it lands (`rules.swipeLanding`: one swipe, one place); a Motion spring takes the ribbon or the divider there. The day changes through `AnimatePresence` with a direction. Resizing a task is `useDrag` on its handle, the new length from the core. |
| Fading cards at the scroll edge | CSS `mask-image`, switched by a class the list sets from its scroll position. |
| Same behaviour in the note and the main screen | Both mount the same `TaskScreen`; only props differ. |
| Phone vs desktop | CSS media and container queries for layout; the platform as a prop; dnd-kit's touch and pointer sensors for input. The ribbon moves by @use-gesture and a Motion spring, bounded to one place each way; where a swipe lands (one place, never two) stays the core's `rules.swipeLanding` (CSS scroll-snap failed stage 0: it ignores short flicks and the core's landing). |
| Menus and popups | One `Menu`/`Popover` component on Floating UI; its items come ready from the core. |
| Input fields | Obsidian's editor embedded as one `ObsidianEditor` component: it owns the editor instance, reports text through callbacks, and is the only component allowed to hold a DOM ref. |
| Keyboard shortcuts | Obsidian's commands and `Scope`, registered once by the host, dispatch the same actions as taps. No per-component key listeners. |

## The old UI's code

Replaced wholesale, then deleted (`trash`): `obsidian/ui/` motion, drag, layouts, guards and per-place code go. Old and new are never shipped side by side; no flag switches between them. `core/`, the door and the iPhone app stay as they are.

## Acceptance criteria

- Every behaviour described in `docs/plugin/` works on the phone and on the desktop, in light and dark, checked in the test Obsidian.
- No long task over 16 ms on normal interactions (tap, drag frames, drop, typing, switching place, a move by command) with ~300 tasks, measured with the Performance panel over CDP. The one exception is lifting a card: one task under 33 ms (two frames) on the Mac. Stage 0 showed no drag library used as documented lifts within one frame (dnd-kit measures every drop target at activation).
- No hand-written animation, drag or gesture code. One lint rule over `obsidian/ui/` fails on `animate(`, `getBoundingClientRect` and `addEventListener`; React's own handlers (`onClick`, `onDoubleClick`, `onContextMenu`) are fine. The only exception is the `ObsidianEditor` component. Gestures come from dnd-kit and @use-gesture.
- Works in Obsidian's pop-out windows (the libraries get that window's document) and on iOS (long-press drag without the system text menu or page scroll fighting it).
- All tests green: core, architecture, styles, `uiDecides`, and `npm run test:apple`.

## What is built

The features are listed in [`2026-11-16-ui-standard-stack-features.md`](2026-11-16-ui-standard-stack-features.md), numbered. Every stage names the features it builds; a feature is done when it works on the phone and the desktop. The list is the scope: nothing is checked "afterwards" to find what got lost.

## Stages

0. **Blockers first** (done: [`ui-standard-stack/stage0.md`](ui-standard-stack/stage0.md); its «Recommended configuration» and integration rules are how stages 1–3 use the libraries; Obsidian's phone view is checked again on that configuration in stage 2). A throwaway test frontend on the stack, with real data, proved every risk before a feature is built: drag together with card animation, selective re-render and the 16 ms budget with ~300 tasks, the timeline (snap, resize, pinch), the ribbon swipe, the divider, menus, the embedded editor, pop-out windows, Obsidian's phone view, long-press drag in iOS WebKit, bundle size. Results in `ui-standard-stack/stage0.md`. A library that fails is swapped for its standard alternative here, not worked around later.
1. React, Zustand store over `TaskService`, `TaskScreen` with static columns and cards, mounted in the leaf and the note block.
2. Motion for layout and enter/exit; dnd-kit for lists, sections, columns and the time grid.
3. Menus, the editor component, keyboard commands, the remaining places and screens.
4. Delete the old UI, add the lint rule, measure, check both platforms and both themes, release.
