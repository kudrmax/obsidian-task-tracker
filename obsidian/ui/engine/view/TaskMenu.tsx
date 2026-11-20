import { memo, type MouseEvent as ReactMouseEvent, type ReactNode, useContext, useEffect, useRef, useState } from "react";
import type { IconName } from "../../kit/icons";
import { MenuLayer, mouseClick, secondaryClick, useAnchor } from "../layers/Layers";
import { monthGrid, monthOf, monthTitle } from "../layout/month";
import type { ListPlaceId, MenuAction, MenuActionGroup, MenuStatusId, ReminderKind, TaskMenuActionId, TaskMenuModel } from "../port";
import { type Asking, type Layer, useScreen, useScreenApi } from "../store";
import { type BlockLook, CardInsides, PressedLook } from "./Card";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { EntryField } from "./QuickAdd";
import { paintStyle } from "./Timeline";

/** A status tile's words and icon, by the status it writes: the progress tile is In progress, or Stop progress on a task in progress. */
const STATUS_LOOKS: Readonly<Record<MenuStatusId, { readonly label: string; readonly icon: IconName }>> = {
	done: { label: "Done", icon: "done" },
	inProgress: { label: "In progress", icon: "progress" },
	stopProgress: { label: "Stop progress", icon: "progress" },
	wontDo: { label: "Won’t do", icon: "wontdo" },
	stop: { label: "Stop", icon: "stop" },
};

/** A list's icon, as the place tiles of the bar and of Pick a date show it. */
export const PLACE_ICONS: Readonly<Record<ListPlaceId | "date", IconName>> = { inbox: "inbox", backlog: "backlog", soon: "soon", now: "now", date: "calendar" };

/** An action as the menu offers it now (the core's `MenuAction`). */
type Offered = MenuActionGroup<TaskMenuActionId>["actions"][number];

interface MenuSteps {
	menuPage(page: Layer["page"]): void;
	ask(what: Asking | null): void;
	startRename(): void;
	startSubtask(): void;
	pick(action: MenuAction): void;
}

interface ActionLook {
	readonly label: string;
	readonly icon: IconName;
	/**
	 * In the rows group, drawn as a tile (icon over label) in a row of tiles named so, not as a list row (Max, 2026-11-20):
	 * First step and Subtask side by side (both make a subtask), Open full screen and Open in Obsidian under them.
	 */
	readonly tile?: "steps" | "opens";
	readonly onPick: (action: Offered, steps: MenuSteps) => void;
}

/** A tap that leaves the menu for the action's own screen, part 2's: on the stand it closes the menu and writes nothing. */
const leave = (action: Offered, steps: MenuSteps) => steps.pick({ kind: "row", id: action.id });
const day = (action: Offered, steps: MenuSteps) => steps.pick({ kind: "date", date: action.date });

/**
 * Each action of a task's menu: its words and icon, and what a tap does (task actions spec, Decision 95). Exhaustive over
 * the ids the core's table places in the menu: a new action does not compile here until it gets its look. The level and
 * label actions are their groups' tiles, drawn from the model's levels and labels.
 */
const MENU_ACTIONS: Readonly<Record<TaskMenuActionId, ActionLook | { readonly tiles: "levels" | "labels" }>> = {
	done: { label: "Done", icon: "done", onPick: status },
	progress: { label: "In progress", icon: "progress", onPick: status },
	wontDo: { label: "Won’t do", icon: "wontdo", onPick: status },
	stop: { label: "Stop", icon: "stop", onPick: status },
	level: { tiles: "levels" },
	label: { tiles: "labels" },
	today: { label: "Today", icon: "now", onPick: day },
	tomorrow: { label: "Tomorrow", icon: "tomorrow", onPick: day },
	pickDate: { label: "Pick a date", icon: "calendar", onPick: (_, steps) => steps.menuPage("picker") },
	repeat: { label: "Repeat", icon: "repeat", onPick: leave },
	reminder: { label: "Reminder", icon: "reminder", onPick: (_, steps) => steps.menuPage("reminders") },
	rename: { label: "Rename", icon: "rename", onPick: (_, steps) => steps.startRename() },
	description: { label: "Notes", icon: "description", onPick: leave },
	project: { label: "Project", icon: "project", onPick: leave },
	section: { label: "Section", icon: "section", onPick: leave },
	subtask: { label: "Subtask", icon: "subtask", onPick: (_, steps) => steps.startSubtask(), tile: "steps" },
	firstStep: { label: "First step", icon: "firstStep", onPick: leave, tile: "steps" },
	openFull: { label: "Open full screen", icon: "fullScreen", onPick: leave, tile: "opens" },
	openInObsidian: { label: "Open in Obsidian", icon: "openFile", onPick: leave, tile: "opens" },
	delete: { label: "Delete", icon: "delete", onPick: (action, steps) => (action.asks ? steps.ask("delete") : steps.pick({ kind: "delete" })) },
};

/** A status tile asks first where the core says so, else writes the status it carries. */
function status(action: Offered, steps: MenuSteps): void {
	if (!action.status) return;
	if (action.asks) steps.ask(action.status);
	else steps.pick({ kind: "status", id: action.status });
}

/** The look of an action drawn as a tile or a row; a status tile is named for the status it writes. */
function lookOf(action: Offered): ActionLook | null {
	const look = MENU_ACTIONS[action.id];
	if ("tiles" in look) return null;
	return action.status ? { ...look, ...STATUS_LOOKS[action.status] } : look;
}

const REMINDER_NAMES: Readonly<Record<ReminderKind, string>> = { live: "Live Activity", notification: "Notification", alarm: "Alarm", none: "Off" };
const WEEKDAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const TILES_PER_ROW = 3;

/** Tiles in rows of at most three, as even as they go: four make two and two, five three and two (the design's levels). */
export function tileRows<T>(tiles: readonly T[]): readonly (readonly T[])[] {
	if (tiles.length === 0) return [];
	const perRow = Math.ceil(tiles.length / Math.ceil(tiles.length / TILES_PER_ROW));
	const rows: T[][] = [];
	for (let i = 0; i < tiles.length; i += perRow) rows.push(tiles.slice(i, i + perRow));
	return rows;
}

/**
 * The menu of a task or an event (F110–F133, the design's «Меню задачи», «Подтверждение», «Срок: выбор даты», «Меню
 * события»): what the port offers, drawn as the plugin draws it, each tap sent back to the port. It stays drawn as it was
 * while it fades out.
 */
export const TaskMenu = memo(function TaskMenu() {
	const api = useScreenApi();
	const { layerRoot } = useHost();
	const anchor = useAnchor();
	const look = useContext(PressedLook);
	const layer = useScreen((s) => s.layer);
	/** A field typed in the menu itself: a stack's card renamed in its place, or a new subtask at the stack's end (F108). */
	const typing = useScreen((s) => (s.entry?.stack ? (s.entry.renaming === null ? "subtask" : "rename") : null));
	const last = useRef<{ layer: Layer; reference: Element | null; look: BlockLook | null; seq: number; panelBy: Element | null } | null>(null);
	const was = useRef<Layer | null>(null);
	/** Opened afresh: from the element pressed now; another page or a question of the same menu keeps it. */
	if (layer && layer !== was.current) {
		const fresh = was.current === null || !last.current;
		/** A subtask's menu over its task's (F107) takes the sheet as it stands: the copy and the stack stay, the panel goes by the card pressed in the stack. */
		const other = !fresh && was.current !== null && was.current.id !== layer.id;
		last.current = fresh ? { layer, reference: anchor.current, look: look.current, seq: (last.current?.seq ?? 0) + 1, panelBy: null } : other && last.current ? { ...last.current, layer, panelBy: anchor.current } : { ...last.current!, layer };
	}
	was.current = layer;
	const shown = last.current;
	if (!shown) return null;
	const { model } = shown.layer;
	const pick = (action: MenuAction) => api.getState().pick(action);
	const { groups, copyAt } = model.kind === "event" ? { groups: [<RowGroup key="open" rows={[{ label: "Open in Calendar", icon: "calendar", onPick: () => pick({ kind: "row", id: "calendar" }) }]} />], copyAt: undefined } : taskGroups(shown.layer, typing !== null, model, { ...api.getState(), pick });
	return (
		<MenuLayer
			key={shown.seq}
			open={layer !== null}
			onClose={() => api.getState().closeLayer()}
			onPressAgain={(at) => api.getState().pressAgain(at)}
			escapes={typing === null}
			root={layerRoot}
			reference={shown.reference}
			panelBy={shown.layer.stack ? shown.panelBy : null}
			label={model.kind === "event" ? "Event menu" : "Task menu"}
			over={
				<>
					<MenuCopy id={shown.layer.stack?.of ?? shown.layer.id} look={shown.look} onPress={(e) => api.getState().pressCopy(mouseClick(e))} />
					{shown.layer.stack ? (
						<Stack ids={shown.layer.stack.ids} typing={false} renaming={typing === "rename" ? shown.layer.id : null} pressed={shown.layer.id} />
					) : model.kind === "task" && (model.subtasks.length > 0 || typing === "subtask") ? (
						<Stack ids={model.subtasks} typing={typing === "subtask"} renaming={null} pressed={null} />
					) : null}
				</>
			}
			groups={groups}
			copyAt={copyAt}
			panelClass={model.kind === "event" ? "is-event" : shown.layer.page === "picker" ? "is-task is-picker" : "is-task"}
			page={`${shown.layer.id}:${shown.layer.page}`}
			keepWidth={model.kind === "event"}
			holdSplit={shown.layer.asking !== null}
			peek={model.kind === "task" && model.peek !== null && typing === null ? { content: <PeekText text={model.peek} />, onPress: () => pick({ kind: "row", id: "openFull" }) } : undefined}
		/>
	);
});

/** The groups of a task's menu on its page (the menu itself, Pick a date, the Reminder kinds), and how many stand before the copy. */
function taskGroups(layer: Layer, typing: boolean, model: TaskMenuModel, steps: MenuSteps): { readonly groups: readonly ReactNode[]; readonly copyAt: number | undefined } {
	const { pick } = steps;
	/** Typing in the menu: the panel gives its room to the field (the plugin's `giveToField`). */
	if (typing) return { groups: [], copyAt: undefined };
	if (layer.page === "picker")
		return {
			groups: [
				...(model.places.length > 0 ? [<TileGroup key="places" kind="is-place" rows={[model.places.map((list) => ({ label: list.title, icon: PLACE_ICONS[list.id], on: list.on, onPick: () => pick({ kind: "sendTo", list: list.id }) }))]} />] : []),
				<MonthPage key={`month-${layer.id}`} model={model} pick={pick} />,
				...(model.date.removable ? [<Row key="remove" label="Remove due date" icon="removeDue" className="tc-picker-remove" onPick={() => pick({ kind: "date", date: null })} />] : []),
			],
			copyAt: undefined,
		};
	if (layer.page === "reminders")
		return {
			groups: [
				<Row key="back" label="Reminder" icon="chevronLeft" className="tc-menu-back" lead onPick={() => steps.menuPage("menu")} />,
				<RowGroup key="kinds" rows={model.reminders.map((r) => ({ label: REMINDER_NAMES[r.kind], icon: r.checked ? "check" : undefined, choice: true, quiet: r.kind === "none", onPick: () => pick({ kind: "reminder", reminder: r.kind }) }))} />,
			],
			copyAt: undefined,
		};
	const asking = layer.asking;
	const groups: ReactNode[] = [];
	let copyAt: number | undefined;
	const tile = (action: Offered) => {
		const look = lookOf(action);
		return look ? [{ label: look.label, icon: look.icon, disabled: action.disabled, focus: layer.asked !== null && layer.asked === (action.status ?? (action.id === "delete" ? "delete" : null)), onPick: () => look.onPick(action, steps) }] : [];
	};
	for (const { group, actions } of model.layout) {
		switch (group) {
			case "statuses":
				if (asking !== null && asking !== "delete") groups.push(<Ask key={group} what={asking} title={model.statusTitle} onCancel={() => steps.ask(null)} onConfirm={() => pick({ kind: "status", id: asking })} />);
				else groups.push(<TileGroup key={group} kind={actions.length > 3 ? "is-status is-four" : "is-status"} rows={[actions.flatMap(tile)]} />);
				break;
			case "levels":
				groups.push(<TileGroup key={group} kind="is-priority" rows={tileRows(model.levels.map((level) => ({ label: level.prefix, icon: "priority" as const, color: level.color, on: level.on, disabled: actions[0]?.disabled, onPick: () => pick({ kind: "priority", prefix: level.prefix }) })))} />);
				break;
			case "labels":
				groups.push(<TileGroup key={group} kind="is-priority is-label" rows={tileRows(model.labels.map((label) => ({ label: label.name, icon: "label" as const, color: label.color, on: label.on, disabled: actions[0]?.disabled, onPick: () => pick({ kind: "label", name: label.name }) })))} />);
				break;
			case "copy":
				copyAt = groups.length;
				break;
			case "when":
				groups.push(<TileGroup key={group} kind="is-move is-when" rows={tileRows(actions.flatMap(tile))} />);
				break;
			case "edit":
				groups.push(<TileGroup key={group} kind="is-edit" rows={[actions.flatMap(tile)]} />);
				break;
			case "rows":
				{
					const listed = actions.filter((action) => lookOf(action)?.tile === undefined);
					const tileRow = (name: "steps" | "opens") => actions.filter((action) => lookOf(action)?.tile === name).flatMap(tile);
					const tiled = [tileRow("steps"), tileRow("opens")].filter((row) => row.length > 0);
					if (listed.length > 0) groups.push(<RowGroup key={group} rows={listed.flatMap((action) => tile(action).map(({ focus: _, ...spec }) => spec))} />);
					if (tiled.length > 0) groups.push(<TileGroup key={`${group}-tiles`} kind="is-edit is-open" rows={tiled} />);
				}
				break;
			case "remove":
				if (asking === "delete") groups.push(<Ask key={group} what="delete" title={model.title} onCancel={() => steps.ask(null)} onConfirm={() => pick({ kind: "delete" })} />);
				else for (const action of actions) {
					const look = lookOf(action);
					if (look) groups.push(<Row key={group} label={look.label} icon={look.icon} className="is-danger is-apart" focus={layer.asked === "delete"} onPick={() => look.onPick(action, steps)} />);
				}
				break;
		}
	}
	return { groups, copyAt };
}

/**
 * A tile's label, whole inside its tile with room at both sides (Max, 2026-11-20: a word never presses on a tile's
 * border): a label too long for its tile is drawn smaller until it fits, never cut. The stylesheet measures it (`tc-tile-fit`,
 * a hidden copy at a known fraction of the size and container units), so no size is read from the page.
 */
function TileLabel({ text }: { readonly text: string }) {
	return (
		<span className="tc-tile-fit">
			<span className="tc-tile-room">
				<span className="tc-menu-tile-label">{text}</span>
			</span>
			<span className="tc-tile-probe" aria-hidden="true" data-text={text} />
		</span>
	);
}

export interface TileSpec {
	readonly label: string;
	readonly icon: IconName;
	/** A level's colour: its icon and, while the task has it, its ground. */
	readonly color?: string;
	readonly on?: boolean;
	readonly disabled?: boolean;
	/** Takes the focus as it mounts: what asked a question taken back by Cancel. */
	readonly focus?: boolean;
	readonly onPick: () => void;
}

/** A group of tiles row by row: the icon over the label; the level the task has carries a badge with a cross, a tap taking it off. */
export function TileGroup({ kind, rows }: { readonly kind: string; readonly rows: readonly (readonly TileSpec[])[] }) {
	return (
		<div className={`tc-menu-tiles ${kind}`}>
			{rows.map((row, i) => (
				<div key={i} className="tc-menu-tile-row">
					{row.map((tile) => (
						<button key={tile.label} type="button" role="menuitem" className={`tc-btn tc-menu-tile${tile.on ? " is-on" : ""}`} data-priority={tile.color} disabled={tile.disabled} autoFocus={tile.focus} onClick={tile.onPick}>
							<Icon name={tile.icon} />
							<TileLabel text={tile.label} />
							{tile.on && tile.color ? (
								<span className="tc-menu-badge">
									<Icon name="cross" />
								</span>
							) : null}
						</button>
					))}
				</div>
			))}
		</div>
	);
}

export interface RowSpec {
	readonly label: string;
	readonly icon?: IconName;
	readonly value?: string;
	readonly disabled?: boolean;
	/** One of a list to choose from: its check in the accent. */
	readonly choice?: boolean;
	readonly quiet?: boolean;
	/** Takes the focus as it mounts: what asked a question taken back by Cancel. */
	readonly focus?: boolean;
	readonly onPick: () => void;
}

export function RowGroup({ rows }: { readonly rows: readonly RowSpec[] }) {
	return (
		<div className="tc-menu-group">
			{rows.map((row) => (
				<Row key={row.label} {...row} />
			))}
		</div>
	);
}

/** A row: the label, a value beside it, the icon on the right; or, as the way back, the icon leading the label. */
function Row({ label, icon, value, disabled, choice, quiet, focus, onPick, className = "", lead = false }: RowSpec & { readonly className?: string; readonly lead?: boolean }) {
	const root = className.includes("tc-menu-back") ? className : `tc-menu-row ${className}`;
	return (
		<button type="button" role="menuitem" className={`tc-btn ${root}${choice ? " is-choice" : ""}${quiet ? " is-quiet" : ""}`.trim()} disabled={disabled} autoFocus={focus} onClick={onPick}>
			{lead ? (
				<>
					{icon ? <Icon name={icon} /> : null}
					{label}
				</>
			) : (
				<>
					<span className="tc-menu-label">{label}</span>
					{value ? <span className="tc-menu-value">{value}</span> : null}
					{icon ? <Icon name={icon} /> : null}
				</>
			)}
		</button>
	);
}

/**
 * A question in place of what asked it (the design's «Подтверждение»): one line naming the task, then Cancel and the
 * confirming button, Delete's in the danger colour. The confirming button takes the focus, so Enter on the Mac confirms.
 */
function Ask({ what, title, onCancel, onConfirm }: { readonly what: Asking; readonly title: string; readonly onCancel: () => void; readonly onConfirm: () => void }) {
	const { label, icon }: { readonly label: string; readonly icon: IconName } = what === "delete" ? { label: "Delete", icon: "delete" } : STATUS_LOOKS[what];
	return (
		<div className="tc-menu-ask">
			<div className="tc-menu-ask-question">
				<span>{`${label} “`}</span>
				<span className="tc-menu-ask-title">{title}</span>
				<span>”?</span>
			</div>
			<div className="tc-menu-ask-buttons">
				<button type="button" className="tc-btn is-pill is-plain tc-menu-ask-btn" onClick={onCancel}>
					Cancel
				</button>
				<button type="button" className={`tc-btn is-pill ${what === "delete" ? "is-danger" : "is-strong"} tc-menu-ask-btn`} autoFocus onClick={onConfirm}>
					<Icon name={icon} />
					<span className="tc-btn-label">{label}</span>
				</button>
			</div>
		</div>
	);
}

/** Pick a date (F116): the month of the task's day (today's without one), six weeks from Monday, arrows to the months around it. */
function MonthPage({ model, pick }: { readonly model: TaskMenuModel; readonly pick: (action: MenuAction) => void }) {
	return <MonthGrid today={model.date.today} picked={model.date.picked} onPick={(date) => pick({ kind: "date", date })} />;
}

/** The month picker of the menu and the bar (the plugin's `MonthPicker`). */
export function MonthGrid({ today, picked, onPick }: { readonly today: string; readonly picked: string | null; readonly onPick: (date: string) => void }) {
	const [month, setMonth] = useState(() => monthOf(picked ?? today));
	return (
		<div className="tc-picker">
			<div className="tc-picker-head">
				<span className="tc-picker-title">{monthTitle(month)}</span>
				<div className="tc-picker-nav">
					<button type="button" className="tc-btn is-icon is-accent tc-picker-arrow tc-picker-prev" aria-label="Previous month" onClick={() => setMonth(monthOf(month, -1))}>
						<Icon name="chevronLeft" />
					</button>
					<button type="button" className="tc-btn is-icon is-accent tc-picker-arrow tc-picker-next" aria-label="Next month" onClick={() => setMonth(monthOf(month, 1))}>
						<Icon name="chevronRight" />
					</button>
				</div>
			</div>
			<div className="tc-picker-grid">
				{WEEKDAYS.map((name) => (
					<span key={name} className="tc-weekday">
						{name}
					</span>
				))}
				{monthGrid(month).map((cell) => (
					<button key={cell.date} type="button" data-date={cell.date} className={`tc-btn tc-day${cell.other ? " is-other" : ""}${cell.date === today ? " is-today" : ""}${cell.date === picked ? " is-selected" : ""}`} onClick={() => onPick(cell.date)}>
						{cell.day}
					</button>
				))}
			</div>
		</div>
	);
}

/**
 * The copy of what was pressed over the backdrop, unchanged but for its whole title (the design's «Полная карточка»): a
 * list's card, a calendar's block in its look there, or an event (F90).
 */
function MenuCopy({ id, look, onPress }: { readonly id: string; readonly look: BlockLook | null; readonly onPress: (event: ReactMouseEvent) => void }) {
	const face = useScreen((s) => s.shown.cards[id]);
	const block = useScreen((s) => s.shown.day.blocks.find((b) => b.id === id));
	const event = useScreen((s) => s.shown.day.events.find((e) => e.id === id) ?? s.shown.day.allDay.find((e) => e.id === id));
	const selected = useScreen((s) => s.selected === id);
	if (event)
		return (
			<div className="tc-lifted is-block is-whole" data-lifted={id} onClick={onPress}>
				<div className={`tc-event${event.past ? " is-past" : ""}`} style={paintStyle(event.paint)}>
					<div className="tc-event-bar" />
					<div className="tc-event-body">
						<div className="tc-item-title">{event.title}</div>
					</div>
				</div>
			</div>
		);
	if (!face) return null;
	if (block)
		return (
			<div className="tc-lifted is-block is-whole" data-lifted={id} onClick={onPress}>
				<div className={`tc-block-card${selected ? " is-selected" : ""}`} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined}>
					<CardInsides face={face} block={look ?? { step: block.step, corner: null, pill: null, clock: block.clock }} />
				</div>
			</div>
		);
	return (
		<div className="tc-lifted is-whole" data-lifted={id} onClick={onPress} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined}>
			<CardInsides face={face} />
		</div>
	);
}

/** The start of a task's description, drawn by Obsidian (the design's «Описание задачи»: the panel's text is Obsidian's markdown). */
function PeekText({ text }: { readonly text: string }) {
	const { markdown, sourcePath } = useHost();
	const el = useRef<HTMLDivElement>(null);
	useEffect(() => (el.current ? markdown(text, el.current, sourcePath) : undefined), [markdown, text, sourcePath]);
	return <div ref={el} className="tc-desc-text markdown-rendered" />;
}

/**
 * A calendar task's open subtasks between its copy and the panel (F107; the design's «Подзадачи», variant C): cards at the
 * copy's width, a tap on one opening its own menu in the same sheet; with Add subtask, a field for a new one last (F108).
 */
function Stack({ ids, typing, renaming, pressed }: { readonly ids: readonly string[]; readonly typing: boolean; readonly renaming: string | null; readonly pressed: string | null }) {
	const api = useScreenApi();
	const anchor = useAnchor();
	const look = useContext(PressedLook);
	const entrySeq = useScreen((s) => s.entrySeq);
	return (
		<div className={`tc-menu-subtasks${pressed ? " is-handed" : ""}`}>
			{ids.map((id) =>
				id === renaming ? (
					<EntryField key={`rename-${entrySeq}`} />
				) : (
				<StackCard
					key={id}
					id={id}
					pressed={id === pressed}
					onPress={(card, clicked) => {
						anchor.current = card;
						look.current = null;
						api.getState().openMenu(id, "stack", false, clicked);
					}}
				/>
				),
			)}
			{typing ? (
				<EntryField key={entrySeq} />
			) : null}
		</div>
	);
}

function StackCard({ id, pressed, onPress }: { readonly id: string; readonly pressed: boolean; readonly onPress: (card: HTMLElement, clicked: number | null) => void }) {
	const face = useScreen((s) => s.shown.cards[id]);
	if (!face) return null;
	return (
		<div className={`tc-card${pressed ? " is-pressed" : ""}`} data-stack={id} data-status={face.inProgress ? "inProgress" : "open"} data-priority={face.color ?? undefined} onClick={(e) => onPress(e.currentTarget, mouseClick(e))} onContextMenu={(e) => secondaryClick(e) && onPress(e.currentTarget, null)}>
			<CardInsides face={face} />
		</div>
	);
}
