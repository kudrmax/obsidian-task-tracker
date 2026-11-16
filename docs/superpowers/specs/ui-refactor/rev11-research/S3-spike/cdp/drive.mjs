// usage: node drive.mjs <port> <mode: autoattach|wrapopen|none> [openerUrlSubstring]
import { readFileSync } from "node:fs";
const [port, mode = "autoattach", openerMatch = "opener"] = process.argv.slice(2);
const trapCore = readFileSync(new URL("./trap.js", import.meta.url), "utf8");
const wrapOpen = `(() => { const o = window.open; if (o.__wrapped) return; const t = ${JSON.stringify(trapCore)};
  window.open = function (...a) { const w = o.apply(this, a); if (w) { try { w.eval(t); } catch (e) { window.__wrapErr = String(e); } } return w; }; window.open.__wrapped = true; })();`;
const source = mode === "wrapopen" ? trapCore + "\n" + wrapOpen : trapCore;
const ver = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
const ws = new WebSocket(ver.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener("open", r, { once: true }));
let id = 0; const pending = new Map(); const log = [];
const t0 = performance.now(); const ts = () => (performance.now() - t0).toFixed(1);
const send = (method, params = {}, sessionId) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej, method }); ws.send(JSON.stringify({ id: i, method, params, sessionId })); });
ws.addEventListener("message", async (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.rej(new Error(p.method + ": " + JSON.stringify(m.error))) : p.res(m.result); return; }
  if (m.method === "Target.attachedToTarget") {
    const { sessionId, targetInfo, waitingForDebugger } = m.params;
    log.push(`${ts()}ms attached type=${targetInfo.type} url=${targetInfo.url || "(empty)"} waiting=${waitingForDebugger} opener=${targetInfo.openerId ? "yes" : "no"}`);
    try {
      if (targetInfo.type === "page" && mode !== "none" && !(mode === "openeronly" && targetInfo.openerId)) {
        const how = process.env.HOW ?? "both";
        if (how !== "eval") await send("Page.addScriptToEvaluateOnNewDocument", { source, runImmediately: true }, sessionId);
        const r = await send("Runtime.evaluate", { expression: (how === "addscript" ? "" : source) + ";location.href", returnByValue: true }, sessionId);
        log.push(`${ts()}ms   trap installed (${how}) in ${targetInfo.type} at ${r.result.value}`);
      }
      // keep auto-attaching beneath it (iframes, popups opened from popups)
      if (targetInfo.type === "page") await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true }, sessionId);
    } catch (e) { log.push(`${ts()}ms   error: ${e.message}`); }
    if (waitingForDebugger) { await send("Runtime.runIfWaitingForDebugger", {}, sessionId); log.push(`${ts()}ms   resumed`); }
  }
});
await send("Target.setDiscoverTargets", { discover: true });
const { targetInfos } = await send("Target.getTargets");
const opener = targetInfos.find((t) => t.type === "page" && t.url.includes(openerMatch));
if (!opener) throw new Error("no opener page among " + targetInfos.map((t) => t.url).join(", "));
await send("Target.setAutoAttach", { autoAttach: true, waitForDebuggerOnStart: true, flatten: true });
const { sessionId: os } = await send("Target.attachToTarget", { targetId: opener.targetId, flatten: true });
if (mode !== "none") { await send("Runtime.evaluate", { expression: source }, os); log.push(`${ts()}ms trap installed in opener`); }
const r = await send("Runtime.evaluate", { expression: "openPopout()", awaitPromise: true, returnByValue: true, userGesture: true }, os);
await new Promise((res) => setTimeout(res, 300));
console.log(`mode=${mode} browser=${ver.Browser}`);
console.log(log.join("\n"));
console.log("opener saw:", JSON.stringify(r.result.value ?? r.exceptionDetails));
const after = await send("Target.getTargets");
console.log("pages now:", after.targetInfos.filter((t) => t.type === "page").map((t) => t.url || "(blank)").join(" | "));
ws.close();
