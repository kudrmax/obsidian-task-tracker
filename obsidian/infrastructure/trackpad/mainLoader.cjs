"use strict";
const { webContents } = require("electron");

const KEY = Symbol.for("task-calendar.trackpad");
const CHANNEL = "task-calendar:trackpad";
const KINDS = { 1: "down", 2: "up", 3: "momentumBegan", 4: "momentumEnded" };

function state() {
	if (!global[KEY]) global[KEY] = { addon: null, path: null, targets: new Set() };
	return global[KEY];
}

function message(kind, seconds, phase, a) {
	const at = seconds * 1000;
	if (kind === "up") return { kind, at, phase, lastMove: a > 0 ? a * 1000 : null };
	if (kind === "momentumEnded") return { kind, at, phase, last: a };
	return { kind, at, phase };
}

function forward(code, seconds, phase, a) {
	try {
		const kind = KINDS[code];
		if (!kind) return;
		const msg = message(kind, seconds, phase, a);
		for (const id of state().targets) {
			const target = webContents.fromId(id);
			if (target && !target.isDestroyed()) target.send(CHANNEL, msg);
			else state().targets.delete(id);
		}
	} catch (error) {
		state().error = String(error);
	}
}

function attach(webContentsId, addonPath) {
	const s = state();
	if (!s.addon) {
		s.addon = require(addonPath);
		s.path = addonPath;
	}
	s.targets.add(webContentsId);
	s.addon.listen(forward);
	return { installed: s.addon.installed === true, path: s.path, pid: process.pid, targets: s.targets.size };
}

function detach(webContentsId) {
	const s = state();
	s.targets.delete(webContentsId);
	if (s.addon && s.targets.size === 0) s.addon.stop();
}

function uptime() {
	const s = state();
	return s.addon ? s.addon.uptime() * 1000 : null;
}

module.exports = { CHANNEL, attach, detach, uptime };
