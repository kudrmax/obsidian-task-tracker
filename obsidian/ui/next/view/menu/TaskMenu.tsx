import type { ComponentChildren, JSX } from "preact";
import type { BlockModel } from "../../model/block";
import { menuCards, menuInput } from "../../model/menuNeeds";
import { kindLabel, type MenuDrawing, type MenuRow, type MenuTile, type PanelModel, type PanelPart, panelModel, type TaskMenuLayer, unitLabel } from "../../model/taskMenu";
import { Card } from "../Card";
import { Icon, NamedIcon } from "../icons";
import { Backdrop } from "../Sheet";

/** Where a row stands and how it is laid out: each its own kind of row, the same row's look beside. */
type RowPlace = "plain" | "choice" | "option" | "apart" | "pickerRemove" | "repeatRemove";

function rowPlace(row: MenuRow, place: "apart" | "pickerRemove" | "repeatRemove" | null): RowPlace {
	if (place !== null) return place;
	if (row.depth !== null) return "option";
	return row.choice ? "choice" : "plain";
}

/** A row of a panel: the label, a value or the week's letters beside it, the icon on the right. */
function Row({ row, place = null, long }: { readonly row: MenuRow; readonly place?: "apart" | "pickerRemove" | "repeatRemove" | null; readonly long: ReadonlySet<string> }): JSX.Element {
	const inside = (
		<>
			<span class="tc-n-menu-label">{row.label}</span>
			{row.value !== null ? (
				<span class={long.has(`value:${row.key}`) ? "tc-n-menu-value is-long" : "tc-n-menu-value"} data-n-long={`value:${row.key}`}>
					{row.value}
				</span>
			) : null}
			{row.days ? (
				<span class="tc-n-menu-week">
					{row.days.map((day, i) => (
						<span key={i} class={day.on ? "tc-n-menu-weekday is-on" : "tc-n-menu-weekday"}>
							{day.letter}
						</span>
					))}
				</span>
			) : null}
			<NamedIcon name={row.icon} />
		</>
	);
	const look = { disabled: row.disabled, "data-n-act": row.act, "data-n-value": row.arg, "data-n-key": row.depth !== null ? `option/${row.key}` : undefined };
	switch (rowPlace(row, place)) {
		case "plain":
			return (
				<button class={`tc-n-btn tc-n-menu-row ${row.quiet ? "is-quiet" : ""} ${row.add ? "is-add" : ""} ${row.danger ? "is-danger" : ""}`} {...look}>
					{inside}
				</button>
			);
		case "choice":
			return (
				<button class={`tc-n-btn tc-n-menu-row tc-n-menu-choice ${row.quiet ? "is-quiet" : ""} ${row.add ? "is-add" : ""} ${row.danger ? "is-danger" : ""}`} {...look}>
					{inside}
				</button>
			);
		case "option":
			return (
				<button class={`tc-n-btn tc-n-menu-row tc-n-menu-choice tc-n-menu-option ${row.quiet ? "is-quiet" : ""} ${row.add ? "is-add" : ""} ${row.danger ? "is-danger" : ""}`} {...look}>
					{inside}
				</button>
			);
		case "apart":
			return (
				<button class={`tc-n-btn tc-n-menu-row tc-n-menu-apart ${row.quiet ? "is-quiet" : ""} ${row.add ? "is-add" : ""} ${row.danger ? "is-danger" : ""}`} {...look}>
					{inside}
				</button>
			);
		case "pickerRemove":
			return (
				<button class={`tc-n-btn tc-n-menu-row tc-n-picker-remove ${row.quiet ? "is-quiet" : ""} ${row.add ? "is-add" : ""} ${row.danger ? "is-danger" : ""}`} {...look}>
					{inside}
				</button>
			);
		case "repeatRemove":
			return (
				<button class={`tc-n-btn tc-n-menu-row tc-n-repeat-remove ${row.quiet ? "is-quiet" : ""} ${row.add ? "is-add" : ""} ${row.danger ? "is-danger" : ""}`} {...look}>
					{inside}
				</button>
			);
	}
}

function Tile({ tile, wide, long }: { readonly tile: MenuTile; readonly wide: boolean; readonly long: ReadonlySet<string> }): JSX.Element {
	const isLong = long.has(`tile:${tile.key}`);
	return (
		<button class={tile.on ? "tc-n-btn tc-n-menu-tile is-on" : "tc-n-btn tc-n-menu-tile"} disabled={tile.disabled} data-priority={tile.color ?? undefined} data-n-act={tile.act} data-n-value={tile.arg}>
			<NamedIcon name={tile.icon} />
			{wide && !isLong ? (
				<span class="tc-n-menu-tile-label tc-n-menu-tile-label-wide" data-n-long={`tile:${tile.key}`}>
					{tile.label}
				</span>
			) : (
				<span class={isLong ? "tc-n-menu-tile-label is-long" : "tc-n-menu-tile-label"} data-n-long={`tile:${tile.key}`}>
					{tile.label}
				</span>
			)}
			{tile.badge && tile.color ? (
				<span class="tc-n-menu-badge">
					<Icon name="cross" />
				</span>
			) : null}
		</button>
	);
}

/** One top-level part of the panel, as the model words it. */
function Part({ part, long }: { readonly part: PanelPart; readonly long: ReadonlySet<string> }): JSX.Element {
	switch (part.kind) {
		case "title":
			return <div class="tc-n-menu-title">{part.text}</div>;
		case "tiles":
			return (
				<div class={part.variant === "move" ? "tc-n-menu-tiles is-move" : "tc-n-menu-tiles"}>
					{part.rows.map((tiles, i) => (
						<div key={i} class="tc-n-menu-tile-row">
							{tiles.map((tile) => (
								<Tile key={tile.key} tile={tile} wide={part.four} long={long} />
							))}
						</div>
					))}
				</div>
			);
		case "rows":
			return (
				<div class="tc-n-menu-group">
					{part.rows.map((row) => (
						<Row key={row.key} row={row} long={long} />
					))}
				</div>
			);
		case "row":
			return <Row row={part.row} long={long} place={part.variant} />;
		case "back":
			return (
				<button class="tc-n-btn tc-n-menu-back" data-n-act={part.act} data-n-value={part.arg}>
					<Icon name="chevronLeft" />
					{part.title}
				</button>
			);
		case "ask":
			return (
				<div class="tc-n-menu-ask">
					<div class="tc-n-menu-ask-question">
						<span>{`${part.verb} “`}</span>
						<span class={long.has("ask") ? "tc-n-menu-ask-title is-long" : "tc-n-menu-ask-title"} data-n-long="ask">
							{part.title}
						</span>
						<span>”?</span>
					</div>
					<div class="tc-n-menu-ask-buttons">
						<button class="tc-n-btn tc-n-pill tc-n-menu-ask-btn" data-n-act="menu:cancelAsk">
							Cancel
						</button>
						{part.danger ? (
							<button class="tc-n-btn tc-n-pill tc-n-menu-ask-btn tc-n-pill-danger" aria-label={part.confirm} data-n-act="menu:confirm">
								<NamedIcon name={part.icon} />
								<span class="tc-n-btn-label">{part.confirm}</span>
							</button>
						) : (
							<button class="tc-n-btn tc-n-pill tc-n-menu-ask-btn tc-n-pill-strong" aria-label={part.confirm} data-n-act="menu:confirm">
								<NamedIcon name={part.icon} />
								<span class="tc-n-btn-label">{part.confirm}</span>
							</button>
						)}
					</div>
				</div>
			);
		case "picker":
			return (
				<div class="tc-n-picker">
					<div class="tc-n-picker-head">
						<span class="tc-n-picker-title">{part.title}</span>
						<div class="tc-n-picker-nav">
							<button class="tc-n-btn tc-n-icon-btn tc-n-picker-arrow" aria-label="Previous month" data-n-act="menu:month" data-n-value="-1">
								<Icon name="chevronLeft" />
							</button>
							<button class="tc-n-btn tc-n-icon-btn tc-n-picker-arrow" aria-label="Next month" data-n-act="menu:month" data-n-value="1">
								<Icon name="chevronRight" />
							</button>
						</div>
					</div>
					<div class="tc-n-picker-grid">
						{part.weekdays.map((name) => (
							<span key={name} class="tc-n-weekday">
								{name}
							</span>
						))}
						{part.cells.map((cell) => (
							<button key={cell.date} class={`tc-n-btn tc-n-day ${cell.other ? "is-other" : ""} ${cell.today ? "is-today" : ""} ${cell.selected ? "is-selected" : ""}`} data-n-act="menu:move" data-n-value={cell.date}>
								{cell.today || cell.selected ? <span class="tc-n-day-strong">{cell.label}</span> : cell.label}
							</button>
						))}
					</div>
				</div>
			);
		case "repeat": {
			const { draft, detail } = part;
			return (
				<>
					<div class="tc-n-repeat-seg" role="group" aria-label="Repeat kind">
						{draft.kinds.map((kind) => (
							<button key={kind} class={kind === draft.kind ? "tc-n-btn tc-n-repeat-seg-btn is-on" : "tc-n-btn tc-n-repeat-seg-btn"} aria-pressed={kind === draft.kind} data-n-act="menu:repeat" data-n-value={`kind:${kind}`}>
								{kindLabel(kind)}
							</button>
						))}
					</div>
					<div class="tc-n-repeat-every">
						<span class="tc-n-repeat-every-label">Every</span>
						<button class={draft.can.fewer ? "tc-n-btn tc-n-icon-btn tc-n-repeat-step" : "tc-n-btn tc-n-icon-btn tc-n-repeat-step is-off"} aria-label="Fewer" aria-disabled={!draft.can.fewer} data-n-act="menu:repeat" data-n-value="every:-1">
							<Icon name="minus" />
						</button>
						<span class="tc-n-repeat-count">{draft.every}</span>
						<button class="tc-n-btn tc-n-icon-btn tc-n-repeat-step" aria-label="More" data-n-act="menu:repeat" data-n-value="every:1">
							<Icon name="plus" />
						</button>
					</div>
					<div class="tc-n-repeat-seg" role="group" aria-label="Unit">
						{draft.units.map((unit) => (
							<button key={unit} class={unit === draft.unit ? "tc-n-btn tc-n-repeat-seg-btn is-on" : "tc-n-btn tc-n-repeat-seg-btn"} aria-pressed={unit === draft.unit} data-n-act="menu:repeat" data-n-value={`unit:${unit}`}>
								{unitLabel(unit)}
							</button>
						))}
					</div>
					{detail?.kind === "monthDay" ? <div class="tc-n-repeat-month">{detail.words}</div> : null}
					{detail?.kind === "weekdays" ? (
						<div class="tc-n-repeat-week">
							{detail.days.map((day) => (
								<button key={day.day} class={day.on ? "tc-n-btn tc-n-repeat-day is-on" : "tc-n-btn tc-n-repeat-day"} aria-label={day.name} aria-pressed={day.on} data-n-act="menu:repeat" data-n-value={`weekday:${day.day}`}>
									{day.on ? <span class="tc-n-repeat-day-on">{day.short}</span> : day.short}
								</button>
							))}
						</div>
					) : null}
				</>
			);
		}
		case "name":
			return (
				<div class="tc-n-menu-group tc-n-project-name">
					<div class="tc-n-name-field">
						<input type="text" class="tc-n-name-input" placeholder=" " aria-label={part.placeholder} enterKeyHint="done" data-n-field="projectName" data-n-enter="menu:newProject" data-n-escape="menu:page" data-n-escape-value="projects" />
						<span class="tc-n-name-hint">{part.placeholder}</span>
					</div>
				</div>
			);
	}
}

interface MenuProps {
	readonly model: BlockModel;
	readonly layer: TaskMenuLayer;
	readonly index: number;
}

/** What the menu draws: as it stands, or as it stood when its close began (`frozen`). */
function drawingOf(model: BlockModel, layer: TaskMenuLayer): MenuDrawing | null {
	if (layer.frozen) return layer.frozen;
	const input = menuInput(model, layer);
	const cards = menuCards(model, layer);
	return input && cards ? { panel: panelModel(layer, input), cards: cards.map((card) => ({ key: card.key, face: card.face })) } : null;
}

/** The panel's box: a menu's, the date page's, the repeat page's (with Remove repeat at its foot, or without): each laid out its own way. */
function PanelBox({ panel, measuring, attributes, children }: { readonly panel: PanelModel; readonly measuring: boolean; readonly attributes: Readonly<Record<string, string | undefined>>; readonly children: ComponentChildren }): JSX.Element {
	switch (panel.variant) {
		case "menu":
			return (
				<div class={measuring ? "tc-n-panel tc-n-panel-menu is-measuring" : "tc-n-panel tc-n-panel-menu"} {...attributes}>
					{children}
				</div>
			);
		case "picker":
			return (
				<div class={measuring ? "tc-n-panel tc-n-panel-menu tc-n-panel-picker is-measuring" : "tc-n-panel tc-n-panel-menu tc-n-panel-picker"} {...attributes}>
					{children}
				</div>
			);
		case "repeat":
			return panel.parts.some((p) => p.kind === "row") ? (
				<div class={measuring ? "tc-n-panel tc-n-panel-menu tc-n-panel-repeat tc-n-panel-has-remove is-measuring" : "tc-n-panel tc-n-panel-menu tc-n-panel-repeat tc-n-panel-has-remove"} {...attributes}>
					{children}
				</div>
			) : (
				<div class={measuring ? "tc-n-panel tc-n-panel-menu tc-n-panel-repeat is-measuring" : "tc-n-panel tc-n-panel-menu tc-n-panel-repeat"} {...attributes}>
					{children}
				</div>
			);
	}
}

/**
 * A task's menu (the old screen's `TaskMenu`) or the bulk menu (`BulkMenu`) in the overlay host: the sheet; the copy of
 * the card over it, grown to show its whole title, its links pressable (the bulk menu: each picked card where it stands);
 * the panel under the copy, or over it, its first groups over it and the rest under it when it fits on neither side.
 * Where each part stands is `motion`'s (it measures, the model keeps what it measured).
 */
export function TaskMenu({ model, layer, index }: MenuProps): JSX.Element | null {
	const drawn = drawingOf(model, layer);
	if (!drawn) return null;
	const closing = layer.closing;
	const place = layer.place?.seq === layer.seq ? layer.place : null;
	const measuring = !closing && place === null;
	const long = new Set(layer.place?.long ?? []);
	const parts = drawn.panel.parts;
	const above = place && place.above < parts.length ? place.above : 0;
	const common = { "data-n-layer": String(index), ...(closing ? { "data-n-closing": "" } : {}) };
	const splits = drawn.panel.variant === "menu" && layer.bulk === null;
	const [card] = drawn.cards;
	return (
		<>
			<Backdrop layer={index} closing={closing} />
			<div class="tc-n-level">
			{layer.bulk === null && card ? (
				<>
					<Card
						rowKey={`menu/${card.key}`}
						face={card.face}
						branch={null}
						as={layer.place?.copy?.whole ? "whole" : "lifted"}
						states={{ stretched: layer.place?.copy?.stretched === true, measuring }}
						links
						attributes={{ ...common, "data-n-part": "lifted" }}
					/>
					{measuring ? <Card rowKey="menu/probe" face={card.face} branch={null} as="probe" attributes={{ "data-n-probe": "whole" }} /> : null}
				</>
			) : (
				drawn.cards.map((picked) => (
					<Card key={picked.key} rowKey={picked.key} face={picked.face} branch={null} as="lifted" states={{ selected: true, measuring }} attributes={{ ...common, "data-n-part": "lifted-copy" }} />
				))
			)}
			{above > 0 ? (
				<PanelBox panel={drawn.panel} measuring={false} attributes={{ "data-n-part": "menu-upper", "data-n-own": "", ...common }}>
					{parts.slice(0, above).map((part) => (
						<Part key={part.key} part={part} long={long} />
					))}
				</PanelBox>
			) : null}
			<PanelBox
				panel={drawn.panel}
				measuring={measuring}
				attributes={{
					"data-n-part": "menu-panel",
					"data-n-own": "",
					...common,
					"data-n-measure": measuring ? String(layer.seq) : undefined,
					"data-n-anchor-key": layer.bulk === null ? layer.id : undefined,
					"data-n-anchor": layer.bulk?.at === "over" ? "selectMenu" : undefined,
					"data-n-beside": layer.bulk?.at === "beside" ? layer.bulk.key : undefined,
					"data-n-keep": layer.keepAbove !== null ? String(layer.keepAbove) : undefined,
					"data-n-split": splits ? "" : undefined,
				}}
			>
				{parts.slice(above).map((part) => (
					<Part key={part.key} part={part} long={long} />
				))}
			</PanelBox>
			</div>
			{measuring ? <div class="tc-n-safe-probe" data-n-probe="safe" /> : null}
		</>
	);
}
