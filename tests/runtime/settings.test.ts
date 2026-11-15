import { describe, expect, it } from "vitest";
import { DEVICE_STATE_KEY } from "../../obsidian/infrastructure/PluginSettings";
import { harness, ok, settle } from "./harness";

const parsed = (text: string) => JSON.parse(text) as Record<string, unknown>;

describe("settings in the replica", () => {
	it("are PluginSettings.get(), and follow an outside writer at once (Sync bringing Google's token)", async () => {
		const { runtime, host, settings } = await harness();
		expect(parsed(runtime.replica.state.settings)).toEqual(JSON.parse(JSON.stringify(settings.get())));
		host.file = { ...host.file, google: { ...(host.file.google as object), refreshToken: "from the Mac" } };
		await settings.reload();
		expect((parsed(runtime.replica.state.settings).google as { refreshToken: string }).refreshToken).toBe("from the Mac");
	});

	it("write a call's change as a per-key patch over a fresh read: a token Sync brought meanwhile is kept", async () => {
		const { runtime, host } = await harness();
		host.file = { ...host.file, google: { ...(host.file.google as object), refreshToken: "token" } };
		ok(runtime.call("settings.setDayStartHour", [4]).answer);
		expect(parsed(runtime.replica.state.settings).dayStartHour).toBe(4);
		await settle(runtime);
		expect(host.file.dayStartHour).toBe(4);
		expect((host.file.google as { refreshToken: string }).refreshToken).toBe("token");
	});

	it("find their own echo: the settings written coming back change nothing", async () => {
		const { runtime, settings } = await harness();
		ok(runtime.call("settings.setDayStartHour", [4]).answer);
		const after = runtime.replica.state;
		await settle(runtime);
		await settings.reload();
		expect(runtime.replica.state).toBe(after);
	});

	it("keep the device's values in the device's storage, never in data.json", async () => {
		const { runtime, host } = await harness();
		runtime.updateSettings({ listShare: 0.4, zoom: 2 });
		ok(runtime.call("settings.setDayStartHour", [6]).answer);
		await settle(runtime);
		expect(parsed(runtime.replica.state.settings)).toMatchObject({ listShare: 0.4, zoom: 2, dayStartHour: 6 });
		expect(host.file).not.toHaveProperty("listShare");
		expect(host.file).not.toHaveProperty("zoom");
		expect(host.local.get(DEVICE_STATE_KEY)).toMatchObject({ listShare: 0.4, zoom: 2 });
	});
});

describe("the host's facts", () => {
	it("are told to the door: not iOS on a computer, and projects ready only once the metadata cache resolved", async () => {
		const { runtime, vault } = await harness({ ready: false });
		runtime.hostReady("layout");
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(runtime.replica.state.tasks).toBeNull();
		expect(vault.listenerCount).toBe(0);
		runtime.hostReady("metadata");
		await runtime.ready();
		expect(runtime.replica.state).toMatchObject({ host: "obsidian", projectsReady: true });
		expect(runtime.replica.state.tasks).not.toBeNull();
	});

	it("end a carry when a host goes: no stale carry stays in the device's storage", async () => {
		const { runtime, screens } = await harness();
		const key = (ok(runtime.read("tasks.screen", ["2026-11-15"])) as { inbox: { key: unknown }[] }).inbox[0].key;
		ok(runtime.call("tasks.startCarry", [{ keys: [key] }, true]).answer);
		expect(screens.get().carry).toBeDefined();
		runtime.teardown();
		expect(screens.get().carry).toBeUndefined();
	});
});
