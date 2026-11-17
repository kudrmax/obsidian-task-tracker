import { connect, sleep } from "./cdp.mjs";
const c = await connect();
c.on("Runtime.consoleAPICalled", (p) => console.log("console", p.type, p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 400)));
c.on("Runtime.exceptionThrown", (p) => console.log("EXC", p.exceptionDetails.exception?.description?.slice(0, 600)));
await c.send("Runtime.enable");
await sleep(+(process.argv[2] ?? 15000));
c.close();
