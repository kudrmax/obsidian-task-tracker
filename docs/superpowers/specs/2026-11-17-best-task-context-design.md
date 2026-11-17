# Best task: context Max adds after a wrong pick

Status: lead's spec, 2026-11-17. Obsidian on the Mac only (the assistant lives only there; the iPhone app has none).

## Why

Best task sometimes picks a task for a reason Max knows is wrong: the title reads as something big and new, but Max
knows it is small («I'm already signed up to five events, this is the sixth»). Claude can't know that; the prompt is not
at fault. Max wants to tell it right in the answer's popup, keep that note in the task for good, and ask again.

The note is not «for Best task»: it is extra context about the task, for any agent that reads the file.

## What Max sees

1. The answer's popup (title «Best task», the card, Claude's reason) gets a text field under the reason, above the
   buttons: placeholder **What did Claude miss?**. Multi-line field that grows with its text, panel look, same width as
   the card.
2. Field empty: the foot is as today, one **Close**.
   Field with text: the foot holds two pills side by side: **Save** (plain) and **Save and ask again** (strong, the
   main one). Close is gone then; Esc and the backdrop still close the popup without writing anything.
3. **Save**: the text goes into the chosen task's description as its last line, `- Контекст: <text>`, and the popup
   closes. **Save and ask again**: the same, then Best task runs again at once (the ring in «⋯» spins as after a tap on
   the row), and the new answer comes in a new popup. ⌘Enter in the field is Save and ask again.
4. Which task gets the line: the one Claude chose — the step itself when it chose a folded task's next step (the card
   shows the folded task, but the step is what Claude judged), the subtask when it chose a subtask.
5. The line is a plain description line: it shows wherever the description shows, can be edited or deleted like any.
   Several saves add several lines, each at the end.
6. Undo takes the write back, one step.
7. The write fails (the task was closed or removed meanwhile, the file couldn't be written): the popup stays open with
   the text kept, and a line under the field says **Couldn't save to this task.**; details go to the console.
8. Only a `task` answer has the field; a failure's popup has none.

## What Claude is told

- The default Best task prompt gets one sentence: a description line that starts with «Контекст:» is context Max added
  himself, often after an assistant misjudged that task; take it as true and weigh the task with it; it doesn't rule the
  task out.
- The briefing sends descriptions as now: the line reaches Claude as part of the description (of the candidate, of a
  goal, of a step after).
- `docs/plugin/agents.md` tells any agent the same: such a line is Max's own context about the task, to be trusted over a
  guess from the title.

## The core

- `core/domain/description.ts`: the prefix `Контекст: ` as one constant, and the description with a context line added:
  the text trimmed, its line breaks and runs of whitespace joined into single spaces; a blank text adds nothing.
  The line is a top-level point `- Контекст: <text>` after the description's last line (the task's first description
  when it has none).
- `AssistantAction` gets an optional `context` (Best task has it): the field's words — placeholder, Save, Save and ask
  again, the failure line. The `task` outcome carries `context: AssistantContext | null` with these words and the id of
  the task the line goes to (the chosen one, not the drawn card's).
- `AssistantService.addContext(taskId, text): Promise<AssistantContextResult>`: writes through the task service's
  description write (one undo step); result `{ ok: true }` or `{ ok: false, words, detail }`. Blank text writes nothing
  and is ok. Nothing the UI computes: prefix, joining, which task, all in the core.
- Contract changes are additions only.

## Not now

- A field on failure popups; editing the line from the popup; a note on tasks Claude didn't choose.

## Decisions

(Filled by the agents as they build; each entry carried to the other side by the lead.)
