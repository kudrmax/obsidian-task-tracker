import { type FocusEvent, useRef } from "react";
import type { ProjectPage } from "../port";
import { Row, RowGroup } from "./MenuRows";
import { ObsidianEditor } from "./ObsidianEditor";

/**
 * A Project page's choices, the menu's and the bar's alike (F122, F123, F187; the plugin's `projectChooser`), as the port
 * offers them (the core's `MenuProject`): the tree in its order, a subproject a step further in, a check on each the
 * task has, one that can't be picked dim; No project last, checked as the page says.
 */
export function ProjectRows({ page, onToggle, onNone }: { readonly page: ProjectPage; readonly onToggle: (name: string) => void; readonly onNone: () => void }) {
	return (
		<RowGroup
			rows={[
				...page.options.map((option) => ({ label: option.name, icon: option.on ? ("check" as const) : undefined, choice: true, disabled: option.disabled, depth: option.depth, className: "tc-project-option", onPick: () => onToggle(option.name) })),
				{ label: page.noneLabel, icon: page.none ? ("check" as const) : undefined, choice: true, quiet: true, onPick: onNone },
			]}
		/>
	);
}

/** «New project…», apart under the projects as New section is (F220). */
export function NewProjectRow({ label, onPick }: { readonly label: string; readonly onPick: () => void }) {
	return <Row label={label} icon="plus" className="is-apart is-add tc-new-project" onPick={onPick} />;
}

/**
 * «New project…»'s name, in place of the projects (F220; the plugin's `projectNamePage`): the way back, then one line in a
 * capsule ringed in the accent, «Project name» while empty, the caret in it. Enter ends it with the name, Escape and the
 * way back with none; it ends once.
 * `onLeave`: the focus went elsewhere before it ended.
 */
export function ProjectNameField({ onEnd, onLeave }: { readonly onEnd: (name: string | null) => void; readonly onLeave?: (event: FocusEvent<HTMLDivElement>) => void }) {
	return <NameField back="New project" placeholder="Project name" className="tc-project-name" onEnd={onEnd} onLeave={onLeave} />;
}

/** New section's name, in place of the sections (F121), as «New project…»'s is: the way back «New section», «Section name» while empty. */
export function SectionNameField({ onEnd }: { readonly onEnd: (name: string | null) => void }) {
	return <NameField back="New section" placeholder="Section name" className="tc-project-name tc-section-name" onEnd={onEnd} />;
}

/** A name typed in a menu's page (a new project's, a new section's): the way back, then the one line ringed in the accent. */
function NameField({ back, placeholder, className, onEnd, onLeave }: { readonly back: string; readonly placeholder: string; readonly className: string; readonly onEnd: (name: string | null) => void; readonly onLeave?: (event: FocusEvent<HTMLDivElement>) => void }) {
	const ended = useRef(false);
	const end = (name: string | null) => {
		if (ended.current) return;
		ended.current = true;
		onEnd(name);
	};
	return (
		<div>
			<Row label={back} icon="chevronLeft" className="tc-menu-back" lead onPick={() => end(null)} />
			<div className={`tc-menu-group ${className}`}>
				<ObsidianEditor text="" className="tc-quick-field tc-title-field tc-project-name-field" placeholder={placeholder} onEnter={end} onEscape={() => end(null)} onLeave={onLeave ? (event) => (ended.current ? undefined : onLeave(event)) : undefined} />
			</div>
		</div>
	);
}
