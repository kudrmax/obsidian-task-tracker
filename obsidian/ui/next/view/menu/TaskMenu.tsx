import type { JSX } from "preact";
import type { BlockModel } from "../../model/block";
import { menuCards, menuInput } from "../../model/menuNeeds";
import { kindLabel, type MenuDrawing, type MenuRow, type MenuTile, type PanelModel, type PanelPart, panelModel, type TaskMenuLayer, unitLabel } from "../../model/taskMenu";
import { Card } from "../Card";
import { Icon, NamedIcon } from "../icons";
import { Backdrop } from "../Sheet";

const join = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(" ");

/** A row of a panel: the label, a value or the week's letters beside it, the icon on the right. */
function Row({ row, extra, long }: { readonly row: MenuRow; readonly extra?: string; readonly long: ReadonlySet<string> }): JSX.Element {
	return (
		<button
			class={join("tc-n-btn tc-n-menu-row", row.choice && "tc-n-menu-choice", row.quiet && "tc-n-menu-quiet", row.add && "tc-n-menu-add", row.danger && "tc-n-menu-danger", row.depth !== null && "tc-n-menu-option", extra)}
			disabled={row.disabled}
			data-n-act={row.act}
			data-n-value={row.arg}
			data-n-key={row.depth !== null ? `option/${row.key}` : undefined}
		>
			<span class="tc-n-menu-label">{row.label}</span>
			{row.value !== null ? (
				<span class={long.has(`value:${row.key}`) ? "tc-n-menu-value tc-n-menu-value-long" : "tc-n-menu-value"} data-n-long={`value:${row.key}`}>
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
		</button>
	);
}

function Tile({ tile, wide, long }: { readonly tile: MenuTile; readonly wide: boolean; readonly long: ReadonlySet<string> }): JSX.Element {
	const isLong = long.has(`tile:${tile.key}`);
	return (
		<button class={join("tc-n-btn tc-n-menu-tile", tile.on && "is-on")} disabled={tile.disabled} data-priority={tile.color ?? undefined} data-n-act={tile.act} data-n-value={tile.arg}>
			<NamedIcon name={tile.icon} />
			<span class={join("tc-n-menu-tile-label", isLong ? "tc-n-menu-tile-label-long" : wide && "tc-n-menu-tile-label-wide")} data-n-long={`tile:${tile.key}`}>
				{tile.label}
			</span>
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
				<div class={part.variant === "move" ? "tc-n-menu-tiles tc-n-tiles-move" : "tc-n-menu-tiles"}>
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
			return <Row row={part.row} long={long} extra={part.variant === "apart" ? "tc-n-menu-apart" : part.variant === "pickerRemove" ? "tc-n-picker-remove" : "tc-n-repeat-remove"} />;
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
						<span class={long.has("ask") ? "tc-n-menu-ask-title tc-n-menu-ask-title-long" : "tc-n-menu-ask-title"} data-n-long="ask">
							{part.title}
						</span>
						<span>”?</span>
					</div>
					<div class="tc-n-menu-ask-buttons">
						<button class="tc-n-btn tc-n-pill tc-n-menu-ask-btn" data-n-act="menu:cancelAsk">
							Cancel
						</button>
						<button class={join("tc-n-btn tc-n-pill tc-n-menu-ask-btn", part.danger ? "tc-n-pill-danger" : "tc-n-pill-strong")} aria-label={part.confirm} data-n-act="menu:confirm">
							<NamedIcon name={part.icon} />
							<span class="tc-n-btn-label">{part.confirm}</span>
						</button>
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
							<button key={cell.date} class={join("tc-n-btn tc-n-day", cell.other && "is-other", cell.today && "is-today", cell.selected && "is-selected")} data-n-act="menu:move" data-n-value={cell.date}>
								{cell.label}
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
							<button key={kind} class={join("tc-n-btn tc-n-repeat-seg-btn", kind === draft.kind && "is-on")} aria-pressed={kind === draft.kind} data-n-act="menu:repeat" data-n-value={`kind:${kind}`}>
								{kindLabel(kind)}
							</button>
						))}
					</div>
					<div class="tc-n-repeat-every">
						<span class="tc-n-repeat-every-label">Every</span>
						<button class={join("tc-n-btn tc-n-icon-btn tc-n-repeat-step", !draft.can.fewer && "is-off")} aria-label="Fewer" aria-disabled={!draft.can.fewer} data-n-act="menu:repeat" data-n-value="every:-1">
							<Icon name="minus" />
						</button>
						<span class="tc-n-repeat-count">{draft.every}</span>
						<button class="tc-n-btn tc-n-icon-btn tc-n-repeat-step" aria-label="More" data-n-act="menu:repeat" data-n-value="every:1">
							<Icon name="plus" />
						</button>
					</div>
					<div class="tc-n-repeat-seg" role="group" aria-label="Unit">
						{draft.units.map((unit) => (
							<button key={unit} class={join("tc-n-btn tc-n-repeat-seg-btn", unit === draft.unit && "is-on")} aria-pressed={unit === draft.unit} data-n-act="menu:repeat" data-n-value={`unit:${unit}`}>
								{unitLabel(unit)}
							</button>
						))}
					</div>
					{detail?.kind === "monthDay" ? <div class="tc-n-repeat-month">{detail.words}</div> : null}
					{detail?.kind === "weekdays" ? (
						<div class="tc-n-repeat-week">
							{detail.days.map((day) => (
								<button key={day.day} class={join("tc-n-btn tc-n-repeat-day", day.on && "is-on")} aria-label={day.name} aria-pressed={day.on} data-n-act="menu:repeat" data-n-value={`weekday:${day.day}`}>
									{day.short}
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
						<input type="text" class="tc-n-name-input" placeholder={part.placeholder} enterKeyHint="done" data-n-field="projectName" data-n-enter="menu:newProject" data-n-escape="menu:page" data-n-escape-value="projects" />
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

function panelClass(panel: PanelModel, bulk: boolean): string {
	return join("tc-n-panel tc-n-panel-menu", panel.variant === "picker" && "tc-n-panel-picker", panel.variant === "repeat" && "tc-n-panel-repeat", panel.variant === "repeat" && panel.parts.some((p) => p.kind === "row") && "tc-n-panel-has-remove", bulk && "tc-n-panel-bulk");
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
	const hidden = measuring ? " is-measuring" : "";
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
						listed={false}
						links
						root={join("tc-n-lifted", layer.place?.copy?.stretched && "tc-n-lifted-stretched", layer.place?.copy?.whole && "tc-n-lifted-whole") + hidden}
						attributes={{ ...common, "data-n-part": "lifted" }}
					/>
					{measuring ? <Card rowKey="menu/probe" face={card.face} branch={null} listed={false} root="tc-n-lifted tc-n-lifted-whole tc-n-lifted-probe" attributes={{ "data-n-probe": "whole" }} /> : null}
				</>
			) : (
				drawn.cards.map((picked) => (
					<Card key={picked.key} rowKey={picked.key} face={picked.face} branch={null} listed={false} root={`tc-n-lifted tc-n-lifted-selected${hidden}`} attributes={{ ...common, "data-n-part": "lifted-copy" }} />
				))
			)}
			{above > 0 ? (
				<div class={panelClass(drawn.panel, layer.bulk !== null)} data-n-part="menu-upper" data-n-own="" {...common}>
					{parts.slice(0, above).map((part) => (
						<Part key={part.key} part={part} long={long} />
					))}
				</div>
			) : null}
			<div
				class={panelClass(drawn.panel, layer.bulk !== null) + hidden}
				data-n-part="menu-panel"
				data-n-own=""
				{...common}
				data-n-measure={measuring ? String(layer.seq) : undefined}
				data-n-anchor-key={layer.bulk === null ? layer.id : undefined}
				data-n-anchor={layer.bulk?.at === "over" ? "selectMenu" : undefined}
				data-n-beside={layer.bulk?.at === "beside" ? layer.bulk.key : undefined}
				data-n-keep={layer.keepAbove !== null ? String(layer.keepAbove) : undefined}
				data-n-split={splits ? "" : undefined}
			>
				{parts.slice(above).map((part) => (
					<Part key={part.key} part={part} long={long} />
				))}
			</div>
			</div>
			{measuring ? <div class="tc-n-safe-probe" data-n-probe="safe" /> : null}
		</>
	);
}
