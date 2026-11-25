import { memo, useState } from "react";
import type { IconName } from "../../shared/icons";
import { ControlMenu } from "../layers/Layers";
import { useScreen, useScreenApi } from "../store";
import { useHost } from "./host";
import { Icon } from "./Icon";
import { RowGroup } from "./MenuRows";

/** The core's icon of a mode (a Lucide name, the Swift app's symbol) as the design draws it (board «Режим вида внизу»). */
const ICON_OF: Readonly<Record<string, IconName>> = { "columns-2": "columns2", "columns-4": "columns4", "rows-3": "rows", "folder-tree": "byProject" };

const iconOf = (name: string): IconName => ICON_OF[name] ?? "columns2";

/**
 * The view button in the bottom row (F11, board V1): a round button like the plus wearing the chosen mode's icon; a tap
 * opens «View» over it, the modes the port offers with the chosen one checked and, while a project with subprojects is
 * chosen, the Subprojects row as its own group (F13). It hides with the plus while a task is typed or a card carried.
 */
export const ViewButton = memo(function ViewButton() {
	const api = useScreenApi();
	const { layerRoot } = useHost();
	const view = useScreen((s) => s.view);
	const open = useScreen((s) => s.viewMenu);
	const hidden = useScreen((s) => s.entry !== null || s.gesture === "drag");
	const [button, setButton] = useState<HTMLButtonElement | null>(null);
	const icon = <Icon name={iconOf(view.icon)} />;
	const groups = [
		<RowGroup key="modes" rows={view.modes.map((option) => ({ label: option.label, icon: option.checked ? "check" : undefined, choice: true, onPick: () => api.getState().pickViewMode(option.mode) }))} />,
		...(view.subprojects ? [<RowGroup key="subprojects" rows={[{ label: view.subprojects.label, icon: view.subprojects.checked ? "check" : undefined, choice: true, onPick: () => api.getState().toggleSubprojects() }]} />] : []),
	];
	return (
		<>
			<button ref={setButton} type="button" className={`tc-btn is-round is-plain tc-view-btn${hidden ? " is-hidden" : ""}`} aria-label="View" onClick={() => api.getState().openViewMenu()}>
				{icon}
			</button>
			<ControlMenu open={open} onClose={() => api.getState().closeViewMenu()} root={layerRoot} reference={button} label="View" title="View" copy={<div className="tc-btn is-round is-plain tc-view-btn">{icon}</div>} groups={groups} />
		</>
	);
});
