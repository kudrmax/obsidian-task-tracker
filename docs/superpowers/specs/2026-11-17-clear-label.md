# Clear label: a label with no colour

Status: lead's spec, 2026-11-17. Core, the Obsidian plugin and the iPhone app.

## Why

Max marks some tasks with a label only as a fact for a tool, not for his eyes: today the Best task's **Skip label**
(«за эту задачу сейчас не взяться»). Every label must have a colour today, so such a task changes colour on the screen.
He wants a label he puts on a task while the card looks exactly as it would without it.

## Max's requests

1. A label may have no colour (clear). Nothing else about a label changes: its tag in the file, its place in the menu,
   toggling it, Best task's Label and Skip label rows, the label rules (a task has a priority or labels, not both).
2. A card carrying a clear label looks as if it did not carry it: a card with only clear labels is a plain card; a card
   with Focus and a clear label is painted Focus alone (stripes/blend count only coloured labels).

## What Max sees

- **Settings → Labels** (plugin) / **Labels** page (app): a label's colour choices get one more, **No colour**, after
  the six presets. Picked: the row's sample card is a plain card, the colour code field is empty. Priorities don't get
  it: a priority is a colour.
- **Add label** never picks No colour: the first free colour, as today.
- **The task menu's label tiles**: a clear label's tile is drawn as an uncoloured tile (as the menu's neutral tiles),
  on/off shown as for any tile. Same in the bulk menu and the quick-entry label chips/swatches.
- **A card** on every list, the timeline, the folded card, Best task's popup, the widget: no trace of a clear label.
- Undo, sync to the phone, the Swift capsule: no difference from today but the colour.

## The contract

- The colour of a label may be `"clear"` (a named constant in the core). Settings load keeps it for labels; for a
  priority it reads as not usable (as today an unknown colour does).
- `TaskItem.colors` never has a clear label's colour; `MOST_CARD_COLORS` counts coloured labels only.
- Settings service: `recolourLabel(index, "clear")` sets it; the settings form gives each colour group the swatches it
  offers ready (labels: presets + clear; priorities: presets), so no frontend decides whether a group has No colour.
- The menu model's label tile carries its colour as today, `"clear"` included; the frontends draw `"clear"` as no tint.
- The phone door: whatever the app reads (form, tiles, items) carries `"clear"` as a plain string; nothing renamed.

## Decisions

(Filled by the agents: a gap they found and how they decided it.)
