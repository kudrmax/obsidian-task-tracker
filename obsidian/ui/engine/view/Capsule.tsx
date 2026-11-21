import { memo } from "react";
import { useScreen, useScreenApi } from "../store";
import { Icon } from "./Icon";

/**
 * The capsule opposite the plus (the design's «Отмена» and «Поиск»; F259, F267): two cells, Undo taking the screen's last
 * action back, its icon dim while there is none, and «⋯», off until its menu comes (step 7, Decision 132). It hides with
 * the plus: while a task is typed, a card or the plus is carried.
 */
export const Capsule = memo(function Capsule() {
	const api = useScreenApi();
	const canUndo = useScreen((s) => s.canUndo);
	const hidden = useScreen((s) => s.entry !== null || s.gesture === "drag");
	return (
		<div className={`tc-capsule${hidden ? " is-hidden" : ""}`}>
			<button type="button" className={`tc-btn is-icon is-plain tc-undo${canUndo ? "" : " is-off"}`} aria-label="Undo" title="Undo" aria-disabled={!canUndo} onClick={() => api.getState().undo()}>
				<Icon name="undo" />
			</button>
			<button type="button" className="tc-btn is-icon is-plain tc-more-open is-off" aria-label="More" title="More" aria-disabled>
				<Icon name="more" />
			</button>
		</div>
	);
});
