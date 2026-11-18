import { createStore, type StoreApi } from "zustand/vanilla";
import type { Aim, Drag, Lifted } from "./drag/dragState";
import { targetOf } from "./drag/listDrag";
import { stepFrom } from "./mechanics/ribbon";
import type { ListId, Place, Screen, ScreenPort } from "./port";

export interface ScreenState {
	/** What the port shows, each part kept as the same object while it reads the same: a card draws again only when it changed. */
	readonly screen: Screen;
	/** A drag under way, or the thing let go waiting for its copy to land; null otherwise. */
	readonly drag: Drag | null;
}

export interface ScreenActions {
	/** Reads the port again: after a write, an edit from outside, another day. */
	refresh(): void;
	setPlace(place: Place): void;
	/** A swipe, the wheel or a trackpad stroke: one step along the row of screens (`stepFrom`), another place or another day. */
	step(shift: -1 | 1): boolean;
	stepDay(shift: -1 | 1): void;
	toToday(): void;
	saveShare(share: number): void;
	undo(): Promise<void>;
	createFile(): Promise<void>;
	/** A finger lifts a card, a block or a section: a card's own place stays its gap until the finger aims elsewhere. */
	lift(lifted: Lifted): void;
	aim(aim: Aim): void;
	/**
	 * Let go: the screen the drop leaves (the port's `preview`) is drawn at once and written through the port; the list keeps
	 * the gap until the copy has landed in it. Aiming at the card's own place or nowhere, nothing is written.
	 */
	release(): Promise<void>;
	cancel(): void;
	/** The carried copy has landed. */
	landed(): void;
	dispose(): void;
}

export type ScreenStore = StoreApi<ScreenState & ScreenActions>;

/** `next`, or `prev` when the two read the same: what a selector sees unchanged keeps its identity. */
export function shared<T>(prev: T | undefined, next: T): T {
	return prev !== undefined && JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
}

/** A screen read anew, every part that reads as drawn kept as drawn. */
export function share(prev: Screen | null, next: Screen): Screen {
	if (!prev) return next;
	const cards = Object.fromEntries(Object.entries(next.cards).map(([id, card]) => [id, shared(prev.cards[id], card)]));
	const lists = Object.fromEntries((Object.keys(next.lists) as ListId[]).map((id) => [id, shared(prev.lists[id], next.lists[id])])) as Screen["lists"];
	const projects = next.projects && prev.projects ? shared(prev.projects, next.projects) : next.projects;
	const same = shared(prev, { ...next, cards: prev.cards, lists: prev.lists, projects: prev.projects, day: prev.day, look: prev.look });
	if (same === prev && shared(prev.cards, cards) === prev.cards && shared(prev.lists, lists) === prev.lists && projects === prev.projects && shared(prev.day, next.day) === prev.day && shared(prev.look, next.look) === prev.look) return prev;
	return { ...next, cards, lists, projects, day: shared(prev.day, next.day), look: shared(prev.look, next.look) };
}

/**
 * The screen's one store over its port: the port's reads with structural sharing, the drag under way, the actions that
 * write through the port. A change from outside comes in by the port's subscription.
 */
export function createScreenStore(port: ScreenPort): ScreenStore {
	const store = createStore<ScreenState & ScreenActions>()((set, get) => {
		/** A drop's step done (its screen drawn, its copy landed): once both are, the drag is over. */
		const settle = (step: { drawn?: boolean; flown?: boolean }) => {
			const drag = get().drag;
			if (!drag) return;
			const next: Drag = { ...drag, phase: "dropping", drawn: drag.drawn || step.drawn === true, flown: drag.flown || step.flown === true };
			set({ drag: next.drawn && next.flown ? null : next });
		};
		const take = (screen: Screen) => set({ screen: share(get().screen, screen) });

		return {
			screen: port.read(),
			drag: null,

			refresh() {
				take(port.read());
			},

			setPlace(place) {
				if (place !== get().screen.place) port.setPlace(place);
			},

			step(shift) {
				const { place, day } = get().screen;
				const to = stepFrom(place, day.isToday, shift);
				if (!to) return false;
				if (to.place !== place) port.setPlace(to.place);
				if (to.day !== 0) port.showDay(to.day);
				return true;
			},

			stepDay: (shift) => port.showDay(shift),
			toToday: () => port.showDay(null),
			saveShare: (value) => port.setListShare(value),
			undo: () => port.undo(),
			createFile: () => port.createFile(),

			lift(lifted) {
				const aim: Aim = lifted.kind === "task" && lifted.home ? { kind: "gap", list: lifted.home.list, gap: lifted.home.gap } : { kind: "home" };
				set({ drag: { lifted, aim, phase: "carry", drawn: false, flown: false } });
			},

			aim(aim) {
				const drag = get().drag;
				if (!drag || drag.phase !== "carry" || JSON.stringify(drag.aim) === JSON.stringify(aim)) return;
				set({ drag: { ...drag, aim } });
			},

			async release() {
				const drag = get().drag;
				if (!drag || drag.phase !== "carry") return;
				const { lifted, aim } = drag;
				set({ drag: { ...drag, phase: "dropping" } });
				if (lifted.kind === "section") {
					const sections = get().screen.lists[lifted.list].sections.filter((section) => section.id !== lifted.section);
					if (aim.kind === "slot" && aim.slot !== lifted.home) await port.moveSection(lifted.list, lifted.section, sections[aim.slot]?.id ?? null);
					settle({ drawn: true });
					return;
				}
				const target = targetOf(lifted, aim, get().screen.lists);
				if (!target) {
					settle({ drawn: true });
					return;
				}
				take(port.preview(lifted.id, target));
				settle({ drawn: true });
				await port.drop(lifted.id, target);
			},

			cancel() {
				if (get().drag?.phase === "carry") settle({ drawn: true });
			},

			landed() {
				settle({ flown: true });
			},

			dispose() {
				unsubscribe();
			},
		};
	});
	const unsubscribe = port.subscribe(() => store.getState().refresh());
	return store;
}
