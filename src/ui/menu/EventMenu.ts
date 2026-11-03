import { showWholeEvent } from "../wholeCard";
import { LiftedMenu } from "./LiftedMenu";
import { menuRow } from "./MenuPanel";

export interface EventMenuContext {
	/** The event's block tapped on the timeline; a copy of it stays over the backdrop, showing its whole title. */
	readonly source: HTMLElement;
	/** Apple's Calendar at the event. */
	openInCalendar(): void;
}

/** The event menu: the same blur, copy and panel as the task menu, the copy an event's, the panel one row. */
export class EventMenu extends LiftedMenu {
	static open(context: EventMenuContext): EventMenu {
		return new EventMenu(context);
	}

	private constructor(context: EventMenuContext) {
		super();
		this.openOver(context.source, () => this.build(context));
	}

	private build(context: EventMenuContext): void {
		this.lifted.classList.add("is-block");
		this.lifted.appendChild(context.source.cloneNode(true));
		const copy = this.liftWhole(context.source, showWholeEvent);
		const panel = this.addPanel("is-event");
		menuRow(panel.el, { label: "Open in Calendar", icon: "calendar", size: "tall", onPick: this.pick(() => context.openInCalendar()) });
		this.placeBy(panel.el, copy);
	}
}
