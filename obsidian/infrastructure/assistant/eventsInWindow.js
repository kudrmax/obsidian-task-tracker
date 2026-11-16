/**
 * Node's `events` as the agent SDK needs it in Obsidian's window. The SDK calls `setMaxListeners(n, signal)` on an
 * AbortController's signal; in the window that controller is Chromium's, which Node's `events` rejects with
 * ERR_INVALID_ARG_TYPE before any call. `setMaxListeners` only raises a warning threshold, so such a target is skipped
 * and everything else passes through. esbuild resolves `events` and `node:events` here (esbuild.config.mjs); this file's
 * own `node:events` is the real one.
 */
const events = require("node:events");

module.exports = {
	...events,
	setMaxListeners(n, ...targets) {
		for (const target of targets) {
			try {
				events.setMaxListeners(n, target);
			} catch (error) {
				if (error?.code !== "ERR_INVALID_ARG_TYPE") throw error;
			}
		}
		if (targets.length === 0) events.setMaxListeners(n);
	},
};
