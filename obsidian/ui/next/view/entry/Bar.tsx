import type { JSX } from "preact";
import type { EntryModel } from "../../model/entry";
import { type BarTile, barTiles, placeIcon } from "../../model/entry";
import { Icon, type IconName } from "../icons";

/** A button of the bar: what a tap on it is (`bar:<act>`), its value. A press on the bar never takes the focus from the field. */
function BarButton({ act, value, icon, label, title, classes, disabled, data }: { readonly act: string; readonly value?: string; readonly icon: IconName; readonly label: string; readonly title?: string; readonly classes?: string; readonly disabled?: boolean; readonly data?: Readonly<Record<string, string>> }): JSX.Element {
	return (
		<button class={classes ? `tc-n-btn tc-n-bar-btn ${classes}` : "tc-n-btn tc-n-bar-btn"} aria-label={label} title={title ?? label} data-n-act={`bar:${act}`} data-n-value={value} disabled={disabled} {...data}>
			<Icon name={icon} />
		</button>
	);
}

function Tiles({ tiles }: { readonly tiles: readonly (readonly BarTile[])[] }): JSX.Element {
	return (
		<div class="tc-n-tiles">
			{tiles.map((row, i) => (
				<div key={i} class="tc-n-tile-row">
					{row.map((tile) => (
						<button key={tile.label} class={tile.on ? "tc-n-btn tc-n-tile is-on" : "tc-n-btn tc-n-tile"} data-priority={tile.color ?? undefined} disabled={tile.disabled} data-n-act={`bar:${tile.act}`} data-n-value={tile.value}>
							<Icon name={tile.icon} />
							<span class="tc-n-tile-label">{tile.label}</span>
						</button>
					))}
				</div>
			))}
		</div>
	);
}

/**
 * The bar of a task being typed (the old screen's `QuickBar`): the shifts, the section's switch, the flag, the project,
 * the repeat and the place. On the phone it lies over the keyboard; on the desktop it is a capsule by the field, the
 * section's switch in its own capsule under the field's left edge, both stood there by `motion` (`data-n-place`).
 */
export function Bar({ entry, wide, placeTitle, listName }: { readonly entry: EntryModel; readonly wide: boolean; readonly placeTitle: string; readonly listName: (list: string) => string }): JSX.Element | null {
	const state = entry.state;
	if (!state) return null;
	const section = state.section === true;
	const panel = entry.panel;
	const sectionButton = state.section === null ? null : <BarButton act="section" icon="section" label="Section" title="Section (⌥Tab)" classes={section ? "tc-n-bar-section is-set" : "tc-n-bar-section"} />;
	const tint = state.marks.tint;
	const tiles = barTiles(state, panel, listName);
	return (
		<>
			{wide && sectionButton ? (
				<div class="tc-n-mode" data-n-keep-focus="" data-n-place="field" data-n-how="mode">
					{sectionButton}
				</div>
			) : null}
			{wide && section ? null : (
				<div class={wide ? "tc-n-bar tc-n-bar-desk" : "tc-n-bar"} data-n-keep-focus="" data-n-place={wide ? "field" : undefined} data-n-how={wide ? "beside" : undefined}>
					{wide ? null : sectionButton}
					{state.indents ? (
						<span class="tc-n-bar-shifts">
							<BarButton act="outdent" icon="outdent" label="Move out" title="Move out (Shift+Tab)" disabled={!state.canOutdent} />
							<BarButton act="indent" icon="indent" label="Move in" title="Move in (Tab)" disabled={!state.canIndent} />
						</span>
					) : null}
					<span class="tc-n-bar-spacer" />
					{state.markable ? <BarButton act="panel" value="priority" icon="priority" label="Priority" classes={[tint ? "is-set" : "", panel === "priority" ? "is-open" : ""].filter(Boolean).join(" ")} data={tint ? { "data-priority": tint } : undefined} /> : null}
					{state.project ? <BarButton act="panel" value="project" icon="project" label="Project" classes={["tc-n-bar-project", state.project.lit ? "is-set" : "", panel === "project" ? "is-open" : ""].filter(Boolean).join(" ")} /> : null}
					{state.repeatable ? <BarButton act="panel" value="repeat" icon="repeat" label="Repeat" classes={[state.repeat ? "is-set" : "", panel === "repeat" ? "is-open" : ""].filter(Boolean).join(" ")} /> : null}
					{state.place ? (
						<button class={panel === "place" ? "tc-n-btn tc-n-bar-place is-open" : "tc-n-btn tc-n-bar-place"} aria-label="Place" title="Place" data-n-act="bar:panel" data-n-value="place">
							<Icon name={placeIcon(state.place)} />
							<span class="tc-n-bar-place-label">{placeTitle}</span>
						</button>
					) : null}
					{tiles.length > 0 ? (
						<div class="tc-n-bar-panel" data-n-panel="">
							{tiles.map((group, i) => (
								<Tiles key={i} tiles={group} />
							))}
						</div>
					) : null}
				</div>
			)}
		</>
	);
}
