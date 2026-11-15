import type { BlockModel } from "../model/block";
import type { Layer } from "../model/layers";

/** An id after a replay: the new one when the replay gave one, else the same. */
export function movedId(idMap: Readonly<Record<string, string>>, id: string): string {
	return new Map(Object.entries(idMap)).get(id) ?? id;
}

function remapLayer(layer: Layer, idMap: Readonly<Record<string, string>>): Layer {
	switch (layer.kind) {
		case "taskMenu":
			return { ...layer, id: movedId(idMap, layer.id) };
		case "full":
			return {
				...layer,
				id: movedId(idMap, layer.id),
				stack: layer.stack.map((task) => ({ ...task, id: movedId(idMap, task.id) })),
				description: layer.description ? { ...layer.description, id: movedId(idMap, layer.description.id) } : null,
			};
		default:
			return layer;
	}
}

/**
 * The replay's old→new id map applied to the whole model in one message (P3): every layer's pin, the carried card. The
 * lists are keyed by the ids the next views carry, so they follow by themselves.
 */
export function remapIds(model: BlockModel, idMap: Readonly<Record<string, string>>): BlockModel {
	if (Object.keys(idMap).length === 0) return model;
	return {
		...model,
		layers: model.layers.map((layer) => remapLayer(layer, idMap)),
		carry: model.carry ? { ...model.carry, id: movedId(idMap, model.carry.id) } : null,
		found: model.found ? { ...model.found, id: movedId(idMap, model.found.id) } : null,
	};
}
