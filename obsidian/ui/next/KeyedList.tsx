import { Component, type ComponentChildren } from "preact";
import { slides, type Cause } from "./motion";

export interface KeyedListProps<T> {
	readonly id: string;
	readonly rows: readonly T[];
	readonly keyOf: (row: T) => string;
	readonly cause: Cause;
	readonly row: (row: T) => ComponentChildren;
	readonly duration: number;
}

type Tops = Map<string, number>;

/**
 * A list drawn by key. Rows slide from where they stood only when the state's cause lets this list move; any other
 * change draws the rows in place. Positions are read once before and once after the drawing, never during motion.
 */
export class KeyedList<T> extends Component<KeyedListProps<T>> {
	private host: HTMLElement | null = null;

	override getSnapshotBeforeUpdate(): Tops | null {
		return slides(this.props.cause, this.props.id) ? this.tops() : null;
	}

	override componentDidUpdate(_previous: KeyedListProps<T>, _state: unknown, before: Tops | null): void {
		if (!before) return;
		for (const [key, top] of this.tops()) {
			const was = before.get(key);
			if (was === undefined || was === top) continue;
			this.nodeOf(key)?.animate([{ transform: `translateY(${was - top}px)` }, { transform: "none" }], { duration: this.props.duration, easing: "ease-out" });
		}
	}

	override render(props: KeyedListProps<T>) {
		return (
			<div class="tc-list" ref={(node) => {
				this.host = node;
			}}>
				{props.rows.map((row) => (
					<div class="tc-row" key={props.keyOf(row)} data-key={props.keyOf(row)}>
						{props.row(row)}
					</div>
				))}
			</div>
		);
	}

	private tops(): Tops {
		const tops: Tops = new Map();
		for (const node of this.host?.children ?? []) {
			const key = (node as HTMLElement).dataset.key;
			if (key !== undefined) tops.set(key, node.getBoundingClientRect().top);
		}
		return tops;
	}

	private nodeOf(key: string): HTMLElement | null {
		return this.host?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? null;
	}
}
