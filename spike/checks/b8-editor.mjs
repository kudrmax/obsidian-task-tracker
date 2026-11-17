import { connect, sleep, click } from "./cdp.mjs";
import { rectOf } from "./rect.mjs";
const c = await connect();
const out = { mountsBefore: await c.evaluate(`tcSpike.counters.editorMounts`) };
const ed = await rectOf(c, ".tcs-editor .cm-content");
await click(c, ed); await sleep(200);
out.focused = await c.evaluate(`document.activeElement?.classList.contains("cm-content")`);
for (const ch of "Купить ") { await c.send("Input.dispatchKeyEvent", { type: "keyDown", text: ch, key: ch }); await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: ch }); await sleep(20); }
await c.send("Input.insertText", { text: "молоко" });
for (let i = 0; i < 20; i++) { await c.evaluate(`tcSpike.store.getState().bump()`); await sleep(30); }
await c.send("Input.insertText", { text: " [[" });
await sleep(500);
out.suggestOpen = await c.evaluate(`!!document.querySelector(".suggestion-container")`);
await c.shot((process.argv[3] ?? "") + "b8-editor-suggest");
await c.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
await c.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27 });
out.text = await c.evaluate(`document.querySelector(".tcs-editor .cm-content").innerText`);
out.echo = await c.evaluate(`document.querySelector(".tcs-echo").dataset.text`);
out.toolbarRenders = await c.evaluate(`tcSpike.store.getState().tick`);
out.mountsAfter = await c.evaluate(`tcSpike.counters.editorMounts`);
console.log(JSON.stringify(out));
c.close();
