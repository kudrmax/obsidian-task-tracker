import { type CSSProperties, memo, type ReactNode, useRef, useState } from "react";
import { PROPERTY } from "../../design";
import { BarPanel, FieldBar } from "../layers/Layers";
import type { EntryBar, EntryBarGroup, FieldActionId, ListId } from "../port";
import { type BarPanelKind as PanelKind, useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { MonthGrid, PLACE_ICONS, TileGroup, tileRows } from "./TaskMenu";

/** A button of the bar as the port offers it now: off, lit. */
type BarAction = EntryBarGroup["actions"][number];

interface BarSteps {
	readonly api: ReturnType<typeof useScreenApi>;
	readonly bar: EntryBar;
	toggle(kind: PanelKind): void;
	close(): void;
	/** Where the button that opens a panel is: the panel stands by it. */
	hold(kind: PanelKind): (el: HTMLElement | null) => void;
}

/**
 * Each button of the field's bar (task actions spec, Decision 100): how it is drawn and what a tap does. Exhaustive over
 * the ids the core's table places on the bar: a new action does not compile here until it gets its look. The level and
 * label actions are one flag button, its panel holding both.
 */
const BAR_BUTTONS: Readonly<Record<FieldActionId, (action: BarAction, steps: BarSteps) => ReactNode>> = {
	newSection: (action, { api }) => (
		<BarButton key="newSection" action={action} cls="tc-bar-section" label="New section" title="New section (⌥Tab)" icon="newSection" onPress={() => api.getState().toggleSection()} />
	),
	outdent: (action, { api }) => <BarButton key="outdent" action={action} cls="tc-bar-shift tc-bar-outdent" label="Move out" title="Move out (Shift+Tab)" icon="outdent" onPress={() => api.getState().indentEntry(-1)} />,
	indent: (action, { api }) => <BarButton key="indent" action={action} cls="tc-bar-shift tc-bar-indent" label="Move in" title="Move in (Tab)" icon="indent" onPress={() => api.getState().indentEntry(1)} />,
	level: (action, { bar, toggle, hold }) => (
		<button key="flag" ref={hold("priority")} type="button" className={`tc-btn is-bar is-plain tc-bar-flag${bar.tint ? " is-set" : ""}`} data-priority={bar.tint ?? undefined} aria-label="Priority" title="Priority" disabled={action.disabled} onClick={() => toggle("priority")}>
			<Icon name="priority" />
		</button>
	),
	label: () => null,
	project: (action, { toggle, hold }) => <BarButton key="project" action={action} cls="tc-bar-project" label="Project" title="Project" icon="project" hold={hold("project")} onPress={() => toggle("project")} />,
	repeat: (action, { close }) => <BarButton key="repeat" action={action} cls="tc-bar-repeat" label="Repeat" title="Repeat" icon="repeat" onPress={close} />,
	description: (action, { api, close }) => <BarButton key="description" action={action} cls="tc-bar-description" label="Description" title="Description" icon="description" onPress={() => (close(), api.getState().openDescription())} />,
	pickDate: (action, { bar, toggle, hold }) =>
		bar.where ? (
			<button key="where" ref={hold("where")} type="button" className="tc-btn is-bar is-plain tc-bar-place" aria-label="Place" title="Place" disabled={action.disabled} onClick={() => toggle("where")}>
				<Icon name={PLACE_ICONS[bar.where.id]} />
				<span className="tc-btn-label">{bar.where.title}</span>
			</button>
		) : null,
};

function BarButton({ action, cls, label, title, icon, hold, onPress }: { readonly action: BarAction; readonly cls: string; readonly label: string; readonly title: string; readonly icon: Parameters<typeof Icon>[0]["name"]; readonly hold?: (el: HTMLElement | null) => void; readonly onPress: () => void }) {
	return (
		<button ref={hold} type="button" className={`tc-btn is-bar is-plain ${cls}${action.lit ? " is-set" : ""}`} aria-label={label} title={title} aria-pressed={action.lit} disabled={action.disabled} onClick={onPress}>
			<Icon name={icon} />
		</button>
	);
}

/**
 * The bar of a task being typed (F184–F189; the design's «Быстрый ввод»: «Полоса», «Панели над полосой», «Десктоп: капсула
 * у поля»): its buttons group by group as the port answers from the core's table (`EntryBar.bar`). On the phone it lies
 * over the keyboard, the new section switch and the level buttons on the left, the rest on the right, its panels opening
 * over it; on the Mac the same buttons are a capsule by the field. One panel at a time. The bar decides nothing: it shows
 * the port's answer and sends back what was tapped.
 */
export const QuickBar = memo(function QuickBar({ reach }: { readonly reach: readonly ListId[] }) {
	const api = useScreenApi();
	const { desk, layerRoot } = useHost();
	const entry = useScreen((s) => s.entry);
	const draft = useScreen((s) => s.draft);
	const text = useScreen((s) => s.entryText);
	/** The bar is the port's answer for the screen as read: a task written above the field may let it go a level in. */
	useScreen((s) => s.read);
	const panel = useScreen((s) => s.entryPanel);
	const setPanel = (next: PanelKind | null) => api.getState().showEntryPanel(next);
	const [anchors, setAnchors] = useState<Partial<Record<PanelKind, HTMLElement | null>>>({});
	/** One ref callback per panel's button, kept across renders: a button gone clears its anchor, as a state setter used as a ref does. */
	const holders = useRef<Partial<Record<PanelKind, (el: HTMLElement | null) => void>>>({});
	if (!entry) return null;
	const bar = api.getState().entryBar(entry, draft, text);
	const toggle = (kind: PanelKind) => setPanel(panel === kind || (panel === "date" && kind === "where") ? null : kind);
	const close = () => setPanel(null);
	const hold = (kind: PanelKind) => (holders.current[kind] ??= (el: HTMLElement | null) => setAnchors((was) => (was[kind] === el ? was : { ...was, [kind]: el })));
	const steps: BarSteps = { api, bar, toggle, close, hold };
	const drawn = (groups: readonly EntryBarGroup[]) => groups.flatMap(({ actions }) => actions.map((action) => BAR_BUTTONS[action.id](action, steps)));
	const mode = bar.bar.filter(({ group }) => group === "mode");
	const shifts = bar.bar.find(({ group }) => group === "shifts");
	const right = bar.bar.filter(({ group }) => group !== "mode" && group !== "shifts");
	return (
		<FieldBar desk={desk} over={entry.stack ? layerRoot : null} className="tc-quick-bar is-engine">
			{(side, capsule) => {
				const away = side === "under" ? "under" : "over";
				return (
					<>
						{drawn(mode)}
						{/* Hidden, not left out, where the field has no levels: the capsule's rule beside them goes with them (the plugin's CSS). */}
						<span className="tc-bar-shifts" hidden={!shifts}>
							{shifts ? shifts.actions.map((action) => BAR_BUTTONS[action.id](action, steps)) : null}
						</span>
						<span className="tc-bar-spacer" />
						{drawn(right)}
						<BarPanel open={panel === "priority"} onClose={close} reference={anchors.priority ?? null} capsule={desk ? capsule : null} away={away} className="is-flag">
							<TileGroup kind="is-priority" rows={tileRows(bar.levels.map((level) => ({ label: level.prefix, icon: "priority" as const, color: level.color, on: level.on, onPick: () => (api.getState().draftLevel(level.prefix), close()) })))} />
						</BarPanel>
						<BarPanel open={panel === "project"} onClose={close} reference={anchors.project ?? null} capsule={desk ? capsule : null} away={away} className="is-project">
							<div className="tc-menu-group">
								{bar.projects.map((option) => (
									<button key={option.name} type="button" className="tc-btn tc-menu-row is-choice tc-project-option" style={{ [PROPERTY.level]: String(option.depth) } as CSSProperties} disabled={option.folder && !option.on} onClick={() => api.getState().toggleProject(option.name)}>
										<span className="tc-menu-label">{option.name}</span>
										{option.on ? <Icon name="check" /> : null}
									</button>
								))}
								<button type="button" className="tc-btn tc-menu-row is-choice is-quiet" onClick={() => (api.getState().clearProjects(), close())}>
									<span className="tc-menu-label">No project</span>
									{bar.projects.some((option) => option.on) ? null : <Icon name="check" />}
								</button>
							</div>
							<button type="button" className="tc-btn tc-menu-row is-apart is-add tc-new-project" onClick={close}>
								<span className="tc-menu-label">New project…</span>
								<Icon name="plus" />
							</button>
						</BarPanel>
						<BarPanel open={panel === "where"} onClose={close} reference={anchors.where ?? null} capsule={desk ? capsule : null} away={away} className="is-place">
							<TileGroup kind="is-place" rows={[bar.places.map((choice) => ({ label: choice.title, icon: PLACE_ICONS[choice.id], on: choice.on, onPick: () => (choice.id === "date" ? setPanel("date") : (api.getState().entryPlace(choice.id, null, reach), close())) }))]} />
						</BarPanel>
						<BarPanel open={panel === "date"} onClose={close} reference={anchors.where ?? null} capsule={desk ? capsule : null} away={away} className="is-picker">
							<MonthGrid today={bar.date.today} picked={bar.date.picked} onPick={(date) => (api.getState().entryPlace("date", date, reach), close())} />
						</BarPanel>
					</>
				);
			}}
		</FieldBar>
	);
});
