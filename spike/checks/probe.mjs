import { connect } from "./cdp.mjs";
const c = await connect();
console.log(await c.evaluate(`(async () => { require("@electron/remote").getCurrentWebContents().setBackgroundThrottling(false); return JSON.stringify({ base: app.vault.adapter.basePath, plugins: Object.keys(app.plugins.plugins), enabled: [...app.plugins.enabledPlugins], safe: app.plugins.isEnabled?.(), modal: document.querySelector('.modal')?.innerText?.slice(0,200), vis: document.visibilityState }) })()`));
c.close();
