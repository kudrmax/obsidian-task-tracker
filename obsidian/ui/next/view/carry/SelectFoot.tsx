import type { JSX } from "preact";
import { Icon } from "../icons";

/** Select tasks' foot (board «Выбор задач»): the capsule with the cross that stops and how many are picked, and the actions button where the plus stood, dim while none is picked. */
export function SelectFoot({ picked }: { readonly picked: number }): JSX.Element {
	return (
		<>
			<div class="tc-n-capsule" data-n-anchor="capsule">
				<button class="tc-n-btn tc-n-select-exit" aria-label="Stop selecting" data-n-act="selectStop">
					<Icon name="cross" />
				</button>
				<button class={picked === 0 ? "tc-n-btn tc-n-select-num is-off" : "tc-n-btn tc-n-select-num"} aria-label="Picked tasks" data-n-act="selectActions">
					{String(picked)}
				</button>
			</div>
			<button class={picked === 0 ? "tc-n-btn tc-n-round tc-n-select-menu is-off" : "tc-n-btn tc-n-round tc-n-select-menu"} aria-label="Actions for selected tasks" data-n-anchor="select" data-n-act="selectActions">
				<Icon name="more" />
			</button>
		</>
	);
}
