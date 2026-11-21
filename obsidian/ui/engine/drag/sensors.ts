import { MouseSensor, type MouseSensorOptions, type PointerActivationConstraint, PointerSensor, type PointerSensorOptions, type SensorInstance, type SensorProps, TouchSensor, type TouchSensorOptions, type UniqueIdentifier } from "@dnd-kit/core";

/**
 * The drag's sensors as dnd-kit's custom sensors are made (its «Sensors» docs: a class implementing `SensorInstance` with
 * static `activators`), over dnd-kit's own mouse, touch and pointer sensors and their activation constraints, nothing of
 * theirs reached past their public constructor:
 *
 * - nothing is lifted while a pinch, a resize or the divider holds the pointer (`busy`, the activators' filter);
 * - the mouse lifts a card once it moved, or once held still for the long press (then, let go unmoved, the card's menu
 *   opens, as the plugin's mouse long tap does); on empty calendar time only the hold lifts the new task's place, and a
 *   mouse that moves first is no long tap; the plus only by moving, so a still click opens its field;
 * - a finger lifts a card by the long press; a second finger landing while it waits makes the press part of a pinch, and
 *   it is forgotten (the plugin's `LongPress`, told by the screen: `TouchPresses.fingerDown`);
 * - the plus moves at once under a finger (the old plugin's F175), started by the pointer events of a touch on it, so the
 *   sensors never listen to the same event (dnd-kit keeps one listener per event name).
 */

/** The plus is carried by this id: on its button, and as a row of the list it is over. */
export const PLUS = "plus";

/**
 * Empty time on the calendar is carried as a new task's place (F101): a long press there (the mouse held still too) lifts
 * it at that minute. A press on something of its own there (a block, an event, a dot, a field) is that thing's.
 */
export const NEW_SLOT = "new-slot";

/** The long press: held still this long, within this tolerance (the plugin's). */
export const LONG_PRESS_MS = 250;
export const LONG_PRESS_TOLERANCE_PX = 5;
/** The mouse lifts a card, and a finger the plus, once it moved this far. */
const MOVE_PX = 4;

/** The gestures that hold the pointer against a drag (a drag takes it from the ribbon: its long press proved the ribbon still). */
export const holdsPointer = (gesture: string | null): boolean => gesture === "zoom" || gesture === "resize" || gesture === "divider";

/** A press the screen holds: the touch waiting out its long press, forgotten when a second finger lands; a card carried by a touch. */
export class TouchPresses {
	waiting: (() => void) | null = null;
	carrying = false;

	/** A finger landed: with another already down, the press waiting is part of a pinch, and forgotten. */
	fingerDown(touches: number): void {
		if (touches > 1) this.waiting?.();
	}
}

/** Our sensors' options besides dnd-kit's: whether another gesture holds the pointer now, and the touches the screen tells of. */
export interface PressOptions {
	readonly busy: () => boolean;
	readonly presses: TouchPresses;
}

/** What dnd-kit tells a sensor's activator besides the event: the draggable it would lift. */
type ActivatorContext = { readonly active: { readonly id: UniqueIdentifier } };

/** Whether a touch starts on the plus: it moves at once, a card only after the long press. */
const onPlus = (event: Event): boolean => (event.target as Element | null)?.closest?.("[data-plus]") != null;
const ownPress = (event: Event, context: ActivatorContext | undefined): boolean => context?.active.id === NEW_SLOT && (event.target as Element | null)?.closest?.("[data-own-press]") != null;
/** Our options, carried in dnd-kit's options object of each sensor. */
const ours = (options: unknown): PressOptions => options as PressOptions;
const free = (options: unknown): boolean => !ours(options).busy();

/** How the mouse lifts what it presses. */
function mouseConstraint(active: UniqueIdentifier): PointerActivationConstraint {
	if (active === PLUS) return { distance: MOVE_PX };
	if (active === NEW_SLOT) return { delay: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE_PX };
	return { delay: LONG_PRESS_MS, tolerance: Number.POSITIVE_INFINITY, distance: MOVE_PX };
}

export class PressMouseSensor extends MouseSensor {
	static override activators = MouseSensor.activators.map((activator) => ({ ...activator, handler: (event: Parameters<typeof activator.handler>[0], options: Parameters<typeof activator.handler>[1], context?: ActivatorContext) => free(options) && !ownPress(event.nativeEvent, context) && activator.handler(event, options) }));
	constructor(props: SensorProps<MouseSensorOptions>) {
		let started = false;
		/** A press that meets both the distance and the delay is started by each (dnd-kit leaves the delay's timer running once the distance started it): the drag starts once. */
		const onStart: typeof props.onStart = (at) => {
			if (started) return;
			started = true;
			props.onStart(at);
		};
		super({ ...props, options: { ...props.options, activationConstraint: mouseConstraint(props.active) }, onStart });
	}
}

/** A card's long press under a finger: dnd-kit's touch sensor, forgotten when a second finger lands while it waits. */
export class PressTouchSensor implements SensorInstance {
	static activators = TouchSensor.activators.map((activator) => ({ ...activator, handler: (event: Parameters<typeof activator.handler>[0], options: Parameters<typeof activator.handler>[1], context?: ActivatorContext) => free(options) && !onPlus(event.nativeEvent) && !ownPress(event.nativeEvent, context) && activator.handler(event, options) }));
	autoScrollEnabled = true;

	constructor(props: SensorProps<TouchSensorOptions>) {
		const { presses } = ours(props.options);
		const activation = { delay: LONG_PRESS_MS, tolerance: LONG_PRESS_TOLERANCE_PX };
		let live = true;
		const settle = () => {
			live = false;
			if (presses.waiting === forget) presses.waiting = null;
			presses.carrying = false;
		};
		const forget = () => {
			if (!live) return;
			settle();
			props.onAbort(props.active);
			props.onCancel();
		};
		presses.waiting = forget;
		new TouchSensor({
			...props,
			options: { ...props.options, activationConstraint: activation },
			onPending: (...args) => live && props.onPending(...args),
			onAbort: (id) => live && props.onAbort(id),
			onStart: (at) => {
				if (!live) return;
				if (presses.waiting === forget) presses.waiting = null;
				presses.carrying = true;
				props.onStart(at);
			},
			onMove: (at) => live && props.onMove(at),
			onEnd: () => {
				if (!live) return;
				settle();
				props.onEnd();
			},
			onCancel: () => {
				if (!live) return;
				settle();
				props.onCancel();
			},
		});
	}
}

export class PlusTouchSensor extends PointerSensor {
	static override activators = PointerSensor.activators.map((activator) => ({ ...activator, handler: (event: Parameters<typeof activator.handler>[0], options: Parameters<typeof activator.handler>[1]) => free(options) && event.nativeEvent.pointerType === "touch" && onPlus(event.nativeEvent) && activator.handler(event, options) }));
	constructor(props: SensorProps<PointerSensorOptions>) {
		super({ ...props, options: { ...props.options, activationConstraint: { distance: MOVE_PX } } });
	}
}
