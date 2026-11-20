import { type CSSProperties, memo, useState } from "react";
import { PROPERTY } from "../../design";
import type { IconName } from "../../kit/icons";
import { BarPanel, FieldBar } from "../layers/Layers";
import type { EntryBar, PlaceId } from "../port";
import { useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { MonthGrid, TileGroup, tileRows } from "./TaskMenu";

type PanelKind = "priority" | "project" | "where" | "date";

const PLACE_ICONS: Readonly<Record<PlaceId, IconName>> = { inbox: "inbox", backlog: "backlog", soon: "soon", now: "now", date: "calendar" };

/**
 * The bar of a task being typed (F184–F189; the design's «Быстрый ввод»: «Полоса», «Панели над полосой», «Десктоп: капсула
 * у поля»): the level buttons, the priority flag, the project and the place, each shown as the port's answer for the field
 * says. On the phone it lies over the keyboard, the level buttons on the left, the rest on the right, its panels opening
 * over it; on the Mac the same buttons are a capsule by the field. One panel at a time. The bar decides nothing: it shows
 * the port's answer and sends back what was tapped.
 */
export const QuickBar = memo(function QuickBar() {
	const api = useScreenApi();
	const { desk, layerRoot } = useHost();
	const entry = useScreen((s) => s.entry);
	const draft = useScreen((s) => s.draft);
	const text = useScreen((s) => s.entryText);
	const [panel, setPanel] = useState<PanelKind | null>(null);
	const [flagEl, setFlagEl] = useState<HTMLElement | null>(null);
	const [projectEl, setProjectEl] = useState<HTMLElement | null>(null);
	const [whereEl, setWhereEl] = useState<HTMLElement | null>(null);
	if (!entry) return null;
	const bar: EntryBar = api.getState().entryBar(entry, draft, text);
	const toggle = (kind: PanelKind) => setPanel((open) => (open === kind || (open === "date" && kind === "where") ? null : kind));
	const close = () => setPanel(null);
	return (
		<FieldBar desk={desk} over={entry.stack ? layerRoot : null} className="tc-quick-bar is-engine">
			{(side, capsule) => {
				const away = side === "under" ? "under" : "over";
				return (
					<>
						{/* Hidden, not left out, where the field has no levels: the capsule's rule beside them goes with them (the plugin's CSS). */}
						<span className="tc-bar-shifts" hidden={!bar.indents}>
							<button type="button" className="tc-btn is-bar is-plain tc-bar-shift tc-bar-outdent" aria-label="Move out" title="Move out (Shift+Tab)" hidden={!bar.indents} disabled={!bar.canOutdent} onClick={() => api.getState().indentEntry(-1)}>
								<Icon name="outdent" />
							</button>
							<button type="button" className="tc-btn is-bar is-plain tc-bar-shift tc-bar-indent" aria-label="Move in" title="Move in (Tab)" hidden={!bar.indents} disabled={!bar.canIndent} onClick={() => api.getState().indentEntry(1)}>
								<Icon name="indent" />
							</button>
						</span>
						<span className="tc-bar-spacer" />
						<button ref={setFlagEl} type="button" className={`tc-btn is-bar is-plain tc-bar-flag${bar.tint ? " is-set" : ""}`} data-priority={bar.tint ?? undefined} aria-label="Priority" title="Priority" onClick={() => toggle("priority")}>
							<Icon name="priority" />
						</button>
						{bar.projects ? (
							<button ref={setProjectEl} type="button" className={`tc-btn is-bar is-plain tc-bar-project${bar.projects.lit ? " is-set" : ""}`} aria-label="Project" title="Project" aria-pressed={bar.projects.lit} onClick={() => toggle("project")}>
								<Icon name="project" />
							</button>
						) : null}
						{bar.where ? (
							<button ref={setWhereEl} type="button" className="tc-btn is-bar is-plain tc-bar-place" aria-label="Place" title="Place" onClick={() => toggle("where")}>
								<Icon name={PLACE_ICONS[bar.where.id]} />
								<span className="tc-btn-label">{bar.where.title}</span>
							</button>
						) : null}
						<BarPanel open={panel === "priority"} onClose={close} reference={flagEl} capsule={desk ? capsule : null} away={away} className="is-flag">
							<TileGroup kind="is-priority" rows={tileRows(bar.levels.map((level) => ({ label: level.prefix, icon: "priority" as const, color: level.color, on: level.on, onPick: () => (api.getState().draftLevel(level.prefix), close()) })))} />
						</BarPanel>
						<BarPanel open={panel === "project" && bar.projects !== null} onClose={close} reference={projectEl} capsule={desk ? capsule : null} away={away} className="is-project">
							<div className="tc-menu-group">
								{bar.projects?.options.map((option) => (
									<button key={option.name} type="button" className="tc-btn tc-menu-row is-choice tc-project-option" style={{ [PROPERTY.level]: String(option.depth) } as CSSProperties} disabled={option.folder} onClick={() => (api.getState().draftProject(option.name), close())}>
										<span className="tc-menu-label">{option.name}</span>
										{option.on ? <Icon name="check" /> : null}
									</button>
								))}
								<button type="button" className="tc-btn tc-menu-row is-choice is-quiet" onClick={() => (api.getState().draftProject(null), close())}>
									<span className="tc-menu-label">No project</span>
									{bar.projects && !bar.projects.lit ? <Icon name="check" /> : null}
								</button>
							</div>
							<button type="button" className="tc-btn tc-menu-row is-apart is-add tc-new-project" onClick={close}>
								<span className="tc-menu-label">New project…</span>
								<Icon name="plus" />
							</button>
						</BarPanel>
						<BarPanel open={panel === "where"} onClose={close} reference={whereEl} capsule={desk ? capsule : null} away={away} className="is-place">
							<TileGroup kind="is-place" rows={[bar.places.map((choice) => ({ label: choice.title, icon: PLACE_ICONS[choice.id], on: choice.on, onPick: () => (choice.id === "date" ? setPanel("date") : (api.getState().entryPlace(choice.id, null), close())) }))]} />
						</BarPanel>
						<BarPanel open={panel === "date"} onClose={close} reference={whereEl} capsule={desk ? capsule : null} away={away} className="is-picker">
							<MonthGrid today={bar.date.today} picked={bar.date.picked} onPick={(date) => (api.getState().entryPlace("date", date), close())} />
						</BarPanel>
					</>
				);
			}}
		</FieldBar>
	);
});
