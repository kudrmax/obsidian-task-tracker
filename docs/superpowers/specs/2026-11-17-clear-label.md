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

- **Backend: the contract's names.** `CLEAR_COLOR = "clear"` and `LabelColor = PriorityColor | "clear"` in
  `core/domain/Label.ts`, re-exported by `contracts.ts`; `LabelLevel.color` is a `LabelColor`; `PriorityColor` is
  unchanged, so `"clear"` never reaches a priority, `shadesOf` or `inkOf`. The door gives `CLEAR_COLOR` in
  `rules.constants`.
- **Backend: swatches per group.** `SettingsForm.levelSwatches` (the six presets) and `SettingsForm.labelSwatches` (the
  presets, then `"clear"`); a frontend draws the list it is given. `PRIORITY_COLORS` stays the presets.
- **Backend: validating a label's colour.** `usableLabelColor(color)` (contracts, `rules.usableLabelColor`): a
  `usableColor` or `"clear"`. `usableColor("clear")` stays false, so a priority saved as clear reads as no usable colour.
  Settings load keeps every saved colour as before; nothing is rewritten.
- **Backend: an emptied code field.** `typedColour` answers `null` for empty or blank text (writes nothing, the field
  shows the colour's code again, empty for a clear label). Typing never makes a label clear: No colour is picked from
  the swatches. A code typed for a clear label writes that colour.
- **Backend: Add label** picks the first preset no label has, else the first preset; never clear.
- **Obsidian: the No colour swatch.** A circle the size of the others, no fill, outlined and struck through bottom-left
  to top-right in the muted grey (the standard «no fill» swatch), between the six presets and the rainbow «any colour»
  circle, as `labelSwatches` orders it. Chosen, it is ringed as the others, the ring in the strong ink (it has no colour of
  its own to ring in). The rainbow circle is not lit for a clear label; its picker starts at its default.
- **Obsidian: a clear label's row.** The sample card is the plain card (`--tc-card-bg`, the time in the muted grey), the
  code field empty. A code typed in it previews that colour at once and is written on leaving the field, as for any label;
  a code that does not read puts the plain card and the empty field back.
- **Obsidian: a clear label's menu tile.** Untinted: the label icon outlined in the text colour, as the status tiles
  draw theirs. On: the neutral «on» of the quick panel's place tiles (`--tc-place-on-bg`, ringed in the strong ink) and
  the cross badge in the strong ink, since a tap takes it off as for any label. The same in the task menu, the bulk menu
  and the quick bar's label panel (one drawing function, `tileGroup`).
- **Obsidian: phone label rows** (found while checking). Obsidian's phone margin on the row's grip pushed a label row's
  bin onto a line of its own (a label name is wider than a priority prefix); the grip's margin is zeroed on the phone, so
  name, card and bin share the first line as in the priority rows. Not caused by this feature; fixed in the same branch.
- **Swift: whether a colour paints is the core's.** `TaskBoard.markInk`, `markShades`, `markPaints` (`apple/Core`,
  `MarkInk.swift`) ask `rules.usableColor` before `inkOf`/`shadesOf`: a clear label (or any colour the core can't draw)
  has no ink and no shades, so nothing in the app turns `"clear"` into a hex. The No Color swatch is recognised by
  `rules.constants().CLEAR_COLOR`, never a literal.
- **Swift: No Color on the Labels page** is the last swatch of the form's `labelSwatches`, drawn as the system's
  `circle.slash` in the secondary label colour at the circles' size, ringed when chosen as they are; VoiceOver «No
  Color». Priorities draw `levelSwatches`, so they never get it. The system colour well beside it shows an empty well
  for a clear label; a colour picked there writes that colour.
- **Swift: a clear label's tile and quick-entry row** use the outline `tag` symbol untinted (the menu's own ink, as its
  uncoloured rows), in place of the filled `tag.fill` a coloured label has; on/off are drawn as for any tile.
- **Swift: a plain sample card on the Labels page** is the board's plain card resolved at the screen's base level: the
  settings sheet's raised rows would otherwise lift it to their own colour and hide it in dark.
