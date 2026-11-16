# Architect review of revision 11 (read-only agent; text saved by the lead)

Critical
1. Performance: a write re-renders every card. ViewAnswers caches on whole replica identity (runtime/dispatch/ViewAnswers.ts:40-44); every write and every carry target change (carryAt writes projectsScreen, ReplicaCalls.ts:53) recomputes every need (funnelView ~3 ms, ~12 ms at 4x); new TaskItem objects empty the face cache (model/card.ts:66-78), break Card's memo (view/Card.tsx:248), motion reads every row box (drivers/motion.ts:64,145). Principle: render cost scales with what changed. (a) per-need cache keyed by the replica parts it reads; (b) structural sharing: the same object for an unchanged task line (by id+line); (c) every derived structure memoised on inputs, CSS vars written only on difference; (d) a motion cause names the keys it may measure. Budget test: one write at 300 tasks 4x re-renders at most N cards.
2. ROUTES (one Msg kind -> one concern) contradicts rebased/viewsChanged which change many slices (P3; Store.ts:143). Fix: closed class of broadcast runtime events delivered to every pure owner, each returning only its own slice.
3. Note adapter as specified cannot work: whether a note gets a block is a door read (NoteBlocks.ts:75-78); it manages many screens, mode moves, renames, under a 120-line, no-runtime import limit. Fix: adapter mounts one ScreenHost per Markdown view; layoutOf draws nothing when the root need answers "not a project". Memoise/index the project-note check.

High
4. "Kept as is" contradicts owner table: drivers/scroll.ts:43,130-134 rAF+setTimeout; input.ts:281, islands.ts:124 setTimeout. Fix: one frame-clock intent (onFrame, after) owned by Time; fix the kept list.
5. Arithmetic ban misplaces code: press.ts:61,84-91 distance; update/carry.ts:74,213,255 grab offset; pinch zoom, divider snap. Fix: guarantee is "no second drop/width rule" (pureRules + jscpd); Px arithmetic as per-file allowance in the frozen table.
6. Gate-only Layout can't express real differences: search reveal clears filter vs opens full card; find on another day moves day vs opens card (decision 53). Fix: policy enums in Layout, each read by exactly one listed owner through a total Record; ban stays on reading Place/form.
7. Settings tab as Place is a contortion: Obsidian Setting API, 37 controls, Google sign-in, clipboard (ui/SettingsTab.ts:382). Decide: keep Obsidian settings chrome with only its row reorder on the one carry, or scope stage 6 as a redesign.
8. Owner table gaps: addCommand/addRibbonIcon/protocol handlers/registerView/addSettingTab (main.ts:80-103) and how a command reaches the active screen's store; clipboard; visibilitychange/window focus (CalendarScreen.ts:457); document outside-press listeners (:469-472); keyboardWillShow/Hide (ui/Keyboard.ts:13); Capacitor haptics (haptics.ts); external dragover/drop. Fix: plugin-registration row; extend chrome/input/host services rows.

Medium
9. Name ban too broad (block/wide/mobile hit tokens, .mobile-navbar, core's wide). Ban declared identifiers; the type rule is the real guard.
10. Replica identity churn: Replica.update compares by identity (Replica.ts:76); fresh ids/history/projectsScreen objects on reads invalidate every view. Compare by value or door returns same object.
11. Stage realism: stage 3 bundles all guards, 100% mutation, trap, matrix, reshape; note block hostless until stage 5. Fix: mutation floor that only rises; keep note adapter mounted under the UI build constant.
12. God-file risk: layout.ts and carry.ts (8 payloads). Each payload/region a private part; public file only dispatches.

Holds: blocks placed after .cm-contentContainer / .mod-footer (no remount on re-render); a store and session per block; overlay per popout window; Store.dispatch renders synchronously in the user event (iOS keyboard focus).
