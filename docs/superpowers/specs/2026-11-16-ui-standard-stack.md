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
| Phone vs desktop | CSS media and container queries for layout; the platform as a prop; dnd-kit's touch and pointer sensors for input. The ribbon: on the phone it follows the finger (@use-gesture) and lands by the core's `rules.swipeLanding`; on the Mac trackpad it is a pager, the standard web way for trackpads (fullPage.js's acceleration rule): the start of each stroke turns one place at once on a short Motion spring, a stroke during the spring adds one more place from where the ribbon stands, the momentum tail moves nothing. No intermediate states on the trackpad (Max, 2026-11-17). Browsers give no finger-lift signal on macOS; CSS scroll-snap, Embla with wheel-gestures and follow-and-guess (Lethargy) all failed his real swipes in stage 0. |
| Menus and popups | One `Menu`/`Popover` component on Floating UI; its items come ready from the core. |
| Input fields | Obsidian's editor embedded as one `ObsidianEditor` component: it owns the editor instance, reports text through callbacks, and is the only component allowed to hold a DOM ref. |
| Keyboard shortcuts | Obsidian's commands and `Scope`, registered once by the host, dispatch the same actions as taps. No per-component key listeners. |

## The old UI's code

Replaced wholesale, then deleted (`trash`): `obsidian/ui/` motion, drag, layouts, guards and per-place code go. Old and new are never shipped side by side; no flag switches between them. `core/`, the door and the iPhone app stay as they are.

## How a feature is checked

A feature is checked the way Max uses it, in motion, never by numbers the code under test computes about itself. Stage 0 passed a timeline that teleported, flickered and dropped tasks at the wrong hour, because the check compared the code's own pixel-to-minute math with itself, at the initial zoom only.

1. **Scenario first.** Before a feature from the list is built, it gets an end-to-end scenario in the test Obsidian: real gestures at human pace (slow, fast, back and forth, released outside a target, repeated), driven over CDP. It fails before the code exists.
2. **The oracle is what the user sees and means**, read independently of the code: the label or line under the pointer, the card's text on screen, the tasks file on disk. Dropped under «09:00» means the file says 09:00 and the block's top is on that line.
3. **Frame checks shared by every scenario**, on a screencast of every frame: what is under the finger is visible and follows it; nothing vanishes, flickers, doubles or jumps further than the gesture moved; zoom keeps the time under the pointer; no stray selection or highlight; text is never cut mid-line.
4. **States the user reaches**: each scenario also runs zoomed, scrolled to the edges, in a pop-out window, in the phone view, in light and dark.
5. **Someone else looks.** An agent that did not build the feature watches the recording and the frames to find defects, not to confirm. A feature is done when its scenario and the frame checks pass and that agent finds nothing.
6. **Real input, not only synthesized.** A Mac trackpad's swipe (finger phase plus a long momentum tail) can't be faked by hand-written events. Max's real gestures are recorded (wheel and pointer streams with timestamps) and replayed over CDP in every run; every new recording joins the set.
7. **A defect Max finds** first gets a check that catches it, then the fix.

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
4. Delete the old UI, add the lint rule, measure, check both platforms and both themes, release. Before the release, re-check the trackpad pager with Max: it accepted «~95%» in stage 0 (two quick swipes left sometimes turn one place); open a GitHub issue for what remains, with his recordings in `ui-standard-stack/` as evidence.

## Decisions

Gaps decided by the frontends while building, recorded here for the other frontend (`CLAUDE.md`, «Agents»).

1. **The UI's packages** (stage 1, Obsidian). `tests/architecture.test.ts` lets `obsidian/ui` import the stack's packages by their exact entries (`react`, `react-dom/client`, `zustand`, `motion/react`, `@use-gesture/react`, `@tanstack/react-virtual`, …) and nothing else outside `ui` and the contract; a package is added there when a stage starts using it (dnd-kit in stage 2, Floating UI in stage 3).
2. **One store per mounted screen** (stage 1, Obsidian). `obsidian/ui/screen/screenStore.ts`: a Zustand store over `TaskService`, `DayService`, `UndoService`, `CalendarService` and the device's view settings. Reads keep structural sharing by value (an item, a list's model, the view read the same keep their objects), so a card re-renders only when its task changes (unit test «keeps the objects of what a write left alone»). The leaf and the note block mount the same `TaskScreen` through `mountScreen`, differing only by `place`.
3. **Status and folding drawn by attributes** (stage 1, Obsidian). A card carries its task's `status` and `collapsed` as `data-status` / `data-collapsed`; the stylesheet draws the in-progress dot and the folded edge from them. The components compare no task field (`tests/uiDecides.test.ts` stays at its baseline).
4. **Virtualized lists keep the old list's look** (stage 1, Obsidian). Each row of a TanStack Virtual list stands in its own box (`.tc-list-item`, measured by the virtualizer, `gap` = the settings' card gap), the card, header or plate inside it with the same classes and margins as before; the first header of a list has no top margin (`.is-top`).
5. **Scroll positions and the rows' room** (stage 1, Obsidian). Components hold no DOM refs except where a library's documented usage needs one: TanStack Virtual's scroll element, the timeline's scroller (its opening scroll, `DayService.openAt`, set in a layout effect) and the rows' stack, whose height a ResizeObserver reads for the core's `stackedLists`. No element is moved or measured with `getBoundingClientRect`.
6. **The trackpad pager** (stage 1, Obsidian; from stage 0, round six). `obsidian/ui/screen/wheelStrokes.ts` is the stage 0 detector rewritten; its unit test replays Max's recordings offline (every `.expect.json` and the 97 strokes of the long session). `docs/plugin/screen.md` now says the trackpad turns the screen a place per stroke and the fingers on a phone drag it.
7. **The ribbon's columns** (stage 1, Obsidian). The ribbon is one Motion-driven track of the four columns at their widths (half, half, the day list from half to the divider's width as it nears Now–calendar, the timeline); a column's padding follows the side of the window it stands on (`--tc-side`, 0 left to 1 right). Headers ride with their columns.
8. **Not yet live in stage 1** (Obsidian): the plus, «⋯», the view button's menu, a card's menu and drag, a tap on a card's folder (it would set a filter the screen cannot yet clear: the filter's title and cross come in stage 3), the wheel's drag and long press, the projects button, the divider's glide and haptic at the middle (the hold itself is the core's `dividerAt` and works), the day's slide and the neighbouring day drawn under a swipe, a pop-out window check. They are drawn as before and become live in stages 2–3.
9. **A swipe's landing on the phone** (stage 1, Obsidian). `rules.swipeLanding` gets how far the finger took the screen from its place, measured from the finger's own movement, not from the drawn offset: the drawn offset stops at the neighbour (rubber band), and a flick that starts during a landing must still count its whole way (two quick flicks move two places, the second past Now–calendar to tomorrow).
10. **Replays of long sessions** (stage 1, harness). A recording with a hand-made `.expect.json` must settle on exactly its places (days counted past Now–calendar; a stroke during a landing may pass a place without settling on it). One without is held to the pager's rule run offline: at most 3 % of the settled places may lie off that path (stage 0 saw the page find 96–97 of the 97 strokes, wheel events reaching the page in frames).
