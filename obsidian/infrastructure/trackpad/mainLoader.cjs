"use strict";
const { webContents } = require("electron");

const REGISTRY = Symbol.for("task-calendar.trackpad.registry");
const SHAPE = 1;
const CHANNEL = "task-calendar:trackpad";
const KINDS = { 1: "down", 2: "up", 3: "momentumBegan", 4: "momentumEnded" };

function registry() {
	if (!global[REGISTRY]) {
		global[REGISTRY] = { shape: SHAPE, addon: null, path: null, targets: new Map(), watched: new Set(), inUse: new Set(), told: new Set(), startedAt: Date.now() - process.uptime() * 1000 };
	}
	return global[REGISTRY].shape === SHAPE ? global[REGISTRY] : null;
}

registry()?.inUse.add(__filename);

function message(kind, seconds, phase, a) {
	const at = seconds * 1000;
	if (kind === "up") return { kind, at, phase, lastMove: a > 0 ? a * 1000 : null };
	if (kind === "momentumEnded") return { kind, at, phase, last: a };
	return { kind, at, phase };
}

function sender(id) {
	return (code, seconds, phase, a) => {
		const kind = KINDS[code];
		if (!kind) return;
		const target = webContents.fromId(id);
		if (target && !target.isDestroyed()) target.send(CHANNEL, message(kind, seconds, phase, a));
		else detach(id);
	};
}

function dispatch(code, seconds, phase, a, b) {
	const s = registry();
	for (const send of [...s.targets.values()]) {
		try {
			send(code, seconds, phase, a, b);
		} catch (error) {
			s.error = String(error);
		}
	}
}

function hooked(s, addonPath) {
	if (s.path === addonPath) return { installed: true, hook: "same" };
	const addon = require(addonPath);
	s.inUse.add(addonPath);
	if (!addon.installed) return { installed: false, hook: addon.hook ?? "refused" };
	if (s.addon) s.addon.stop();
	s.addon = addon;
	s.path = addonPath;
	return { installed: true, hook: addon.hook };
}

function watch(s, id) {
	if (s.watched.has(id)) return;
	const target = webContents.fromId(id);
	if (!target) return;
	s.watched.add(id);
	target.once("destroyed", () => {
		s.watched.delete(id);
		detach(id);
	});
}

function attach(id, addonPath) {
	const s = registry();
	if (!s) return { installed: false, hook: "otherRegistry", pid: process.pid };
	const status = hooked(s, addonPath);
	if (!status.installed) return { ...status, pid: process.pid };
	s.targets.set(id, sender(id));
	watch(s, id);
	s.addon.listen(dispatch);
	return { installed: true, hook: status.hook, build: s.addon.build, path: s.path, pid: process.pid };
}

function detach(id) {
	const s = registry();
	if (!s) return;
	s.targets.delete(id);
	if (s.addon && s.targets.size === 0) s.addon.stop();
}

function uptime() {
	const s = registry();
	return s && s.addon ? s.addon.uptime() * 1000 : null;
}

function files() {
	const s = registry();
	return s ? { inUse: [...s.inUse], startedAt: s.startedAt } : { inUse: [], startedAt: 0 };
}

function firstTime(what) {
	const s = registry();
	if (!s || s.told.has(what)) return false;
	s.told.add(what);
	return true;
}

module.exports = { CHANNEL, attach, detach, uptime, files, firstTime, pid: () => process.pid };
