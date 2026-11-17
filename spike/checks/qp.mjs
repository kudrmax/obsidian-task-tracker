import { connect } from "./cdp.mjs";
const c = await connect((t) => t.title.startsWith("Stack spike"));
console.log(await c.evaluate(process.argv[2]));
c.close();
