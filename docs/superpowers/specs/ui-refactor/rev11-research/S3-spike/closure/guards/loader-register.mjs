// --import entry: registers module hooks that note every module Node itself resolves/loads (ESM and, on Node 22, require of ESM-hooked CJS).
import { register } from "node:module";
register("./loader-hooks.mjs", import.meta.url, { data: { out: process.env.CLOSURE_OUT } });
