import { memo } from "react";
import { useScreen, useScreenApi } from "../store";
import { Icon } from "./Icon";

/**
 * The capsule opposite the plus (the design's «Отмена»; F259, F267): Undo takes the screen's last action back, its icon
 * dim while there is none, the button staying where it is. It hides with the plus. «⋯» joins it with its menu (Decision 132).
 */
export const Capsule = memo(function Capsule() {
	const api = useScreenApi();
	const canUndo = useScreen((s) => s.canUndo);
	return (
		<div className="tc-capsule">
			<button type="button" className={`tc-btn is-icon is-plain tc-undo${canUndo ? "" : " is-off"}`} aria-label="Undo" title="Undo" onClick={() => api.getState().undo()}>
				<Icon name="undo" />
			</button>
		</div>
	);
});
