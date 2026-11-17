import { connect } from "./cdp.mjs";
const c = await connect();
console.log(await c.evaluate(process.argv[2]));
c.close();
