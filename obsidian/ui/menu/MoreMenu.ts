import type { AssistantOffer } from "../../../core/application/contracts";
import { tokenPx } from "../design";
import { isIconName } from "../kit/icons";
import { LiftedCopy } from "../kit/LiftedCopy";
import { Panel } from "../kit/Panel";
import { menuGroup, menuRoom, type MenuRowSpec, placePanel } from "./MenuPanel";
import { type CloseHow, Overlay } from "./Overlay";

/** The assistant's rows of «⋯»: as the core offers them now, and when that changes (a run starts or ends). */
export interface AssistantMenuRows {
	offers(): readonly AssistantOffer[];
	onChange(listener: () => void): () => void;
	/** A row that isn't running: its run starts. */
	press(actionId: string): void;
	/** A running row (Stop): its run stops; nothing happens when it has ended meanwhile. */
	stop(actionId: string): void;
}

export interface MoreMenuOptions {
	/** The bottom capsule: a copy of it stays over the backdrop, and the panel stands over it, by its left edge. */
	readonly anchor: HTMLElement;
	/** Search: its window takes over the sheet «⋯» stands on (`sheet` gives it), so one sheet stays under both. */
	onSearch(sheet: (onClose: (how: CloseHow) => void) => Overlay): void;
	onSelect(): void;
	/** The assistant's rows here: none where no model is served. */
	readonly assistant?: AssistantMenuRows;
}

/** An assistant's row as offered: its label and icon for its state; while it runs, the spinning ring in the icon's place. */
function assistantRow(offer: AssistantOffer, onPick: () => void): MenuRowSpec {
	return { label: offer.label, icon: isIconName(offer.icon) ? offer.icon : undefined, busy: offer.running, cls: "tc-assistant-row", onPick };
}

/**
 * What «⋯» opens over the capsule: Search and Select tasks, then the assistant's rows. While it is open the assistant's
 * rows follow the core: a run that ends turns Stop back into its button, so a stale Stop is never there to tap.
 */
export class MoreMenu {
	private readonly overlay: Overlay;
	private unsubscribe: () => void = () => undefined;

	static open(opts: MoreMenuOptions): MoreMenu {
		return new MoreMenu(opts);
	}

	private constructor(opts: MoreMenuOptions) {
		this.overlay = new Overlay(() => this.close(), opts.anchor);
		const rect = opts.anchor.getBoundingClientRect();
		const copy = LiftedCopy.over(this.overlay, opts.anchor.cloneNode(true) as HTMLElement, false);
		copy.el.classList.add("tc-control-copy");
		copy.pin(rect);
		const panel = Panel.over(this.overlay, { root: "tc-panel", cls: "is-more", place: (p) => placePanel(p, rect, tokenPx(p, "--tc-menu-gap"), menuRoom()) }, false);
		const assistant = opts.assistant;
		const rows = (): MenuRowSpec[] =>
			(assistant?.offers() ?? []).map((offer) =>
				assistantRow(
					offer,
					panel.pick(() => (offer.running ? assistant!.stop(offer.actionId) : assistant!.press(offer.actionId))),
				),
			);
		const draw = () =>
			panel.replace((p) =>
				menuGroup(p, [
					{
						label: "Search",
						icon: "search",
						onPick: this.overlay.picks.handOff(() => {
							this.unsubscribe();
							opts.onSearch((onClose) => this.overlay.handOver(onClose));
						}),
					},
					{ label: "Select tasks", icon: "select", onPick: panel.pick(() => opts.onSelect()) },
					...rows(),
				]),
			);
		draw();
		if (assistant) {
			this.unsubscribe = assistant.onChange(() => {
				if (this.overlay.isClosed) return;
				draw();
				copy.el.replaceChildren(...[...opts.anchor.childNodes].map((node) => node.cloneNode(true)));
			});
		}
		this.overlay.show();
	}

	close(): void {
		this.unsubscribe();
		void this.overlay.close();
	}
}
