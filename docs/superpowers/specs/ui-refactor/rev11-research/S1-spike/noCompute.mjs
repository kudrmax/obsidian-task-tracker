// Prototype of the `noCompute` rule (spec C3) on typescript/unstable/sync.
// usage: node noCompute.mjs <repoRoot> <tsconfig> <mode: batched|unbatched> <json-out> <dir>...
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { SyntaxKind } from "typescript/unstable/ast";
import { API, TypeFlags } from "typescript/unstable/sync";

const [root, config, mode, jsonOut, ...dirs] = process.argv.slice(2);
const batched = mode !== "unbatched";

const files = [];
const collect = (d) => {
	for (const e of readdirSync(d)) {
		const p = join(d, e);
		if (statSync(p).isDirectory()) collect(p);
		else if (/\.tsx?$/.test(e) && !/\.d\.ts$/.test(e)) files.push(p);
	}
};
for (const d of dirs) collect(join(root, d));

const ARITH = new Map([
	[SyntaxKind.PlusToken, "+"], [SyntaxKind.MinusToken, "-"], [SyntaxKind.AsteriskToken, "*"], [SyntaxKind.SlashToken, "/"],
	[SyntaxKind.PercentToken, "%"], [SyntaxKind.AsteriskAsteriskToken, "**"],
	[SyntaxKind.PlusEqualsToken, "+="], [SyntaxKind.MinusEqualsToken, "-="], [SyntaxKind.AsteriskEqualsToken, "*="],
	[SyntaxKind.SlashEqualsToken, "/="], [SyntaxKind.PercentEqualsToken, "%="], [SyntaxKind.AsteriskAsteriskEqualsToken, "**="],
]);
const ORDER = new Map([
	[SyntaxKind.LessThanToken, "<"], [SyntaxKind.GreaterThanToken, ">"], [SyntaxKind.LessThanEqualsToken, "<="], [SyntaxKind.GreaterThanEqualsToken, ">="],
]);
const SEQ_CALLS = new Set(["at", "slice", "splice", "with", "fill"]);
const NUMERIC = TypeFlags.NumberLike | TypeFlags.BigIntLike;
const STRINGY = TypeFlags.StringLike;

const isNumLiteral = (n) => n.kind === SyntaxKind.NumericLiteral || (n.kind === SyntaxKind.PrefixUnaryExpression && n.operator === SyntaxKind.MinusToken && n.operand.kind === SyntaxKind.NumericLiteral);
const isLiteral = (n) => isNumLiteral(n) || n.kind === SyntaxKind.StringLiteral || n.kind === SyntaxKind.NoSubstitutionTemplateLiteral;

function walk(node, visit) {
	visit(node);
	node.forEachChild((c) => { walk(c, visit); return undefined; });
}

/** Whether a type is a number: directly, a branded number (intersection), or a union with a number member. */
function some(type, flags, depth = 0) {
	if (!type || depth > 4) return false;
	if (type.flags & flags) return true;
	if (type.isUnionType() || type.isIntersectionType()) return (type.getTypes() ?? []).some((t) => some(t, flags, depth + 1));
	return false;
}

const t0 = performance.now();
const api = new API({ cwd: root });
const snapshot = api.updateSnapshot({ openProjects: [config] });
const project = snapshot.getProject(config);
const { program, checker } = project;
const tOpen = performance.now();
let rpcTypeCalls = 0;
const typesOf = (nodes) => {
	if (nodes.length === 0) return [];
	if (batched) { rpcTypeCalls++; return checker.getTypeAtLocation(nodes); }
	return nodes.map((n) => { rpcTypeCalls++; return checker.getTypeAtLocation(n); });
};
const symbolsOf = (nodes) => {
	if (nodes.length === 0) return [];
	if (batched) { rpcTypeCalls++; return checker.getSymbolAtLocation(nodes); }
	return nodes.map((n) => { rpcTypeCalls++; return checker.getSymbolAtLocation(n); });
};

const hits = [];
for (const abs of files) {
	const sf = program.getSourceFile(abs);
	const path = relative(root, abs);
	if (!sf) { hits.push({ path, rule: "missing", line: 0, text: "not in project" }); continue; }
	const line = (n) => sf.getLineAndCharacterOfPosition(n.getStart ? n.getStart(sf) : n.pos).line + 1;
	const text = (n) => sf.text.slice(n.getStart ? n.getStart(sf) : n.pos, n.end).replace(/\s+/g, " ").slice(0, 110);
	// Candidates: [node, kind, operands to type]
	const cands = [];
	const globals = [];
	walk(sf, (n) => {
		if (n.kind === SyntaxKind.BinaryExpression) {
			const op = n.operatorToken.kind;
			if (ARITH.has(op)) cands.push({ n, rule: "arith", op: ARITH.get(op), operands: [n.left, n.right] });
			else if (ORDER.has(op)) cands.push({ n, rule: "order", op: ORDER.get(op), operands: [n.left, n.right] });
		} else if (n.kind === SyntaxKind.PrefixUnaryExpression || n.kind === SyntaxKind.PostfixUnaryExpression) {
			const op = n.operator;
			if (op === SyntaxKind.PlusPlusToken || op === SyntaxKind.MinusMinusToken) cands.push({ n, rule: "unary", op: op === SyntaxKind.PlusPlusToken ? "++" : "--", operands: [n.operand] });
			else if ((op === SyntaxKind.MinusToken || op === SyntaxKind.PlusToken) && !(n.operand.kind === SyntaxKind.NumericLiteral))
				cands.push({ n, rule: "unary", op: op === SyntaxKind.MinusToken ? "-x" : "+x", operands: [n.operand] });
		} else if (n.kind === SyntaxKind.ElementAccessExpression) {
			if (!isLiteral(n.argumentExpression)) cands.push({ n, rule: "index", op: "[i]", operands: [n.argumentExpression] });
		} else if (n.kind === SyntaxKind.CallExpression && n.expression.kind === SyntaxKind.PropertyAccessExpression && SEQ_CALLS.has(n.expression.name.text)) {
			const bad = [...n.arguments].filter((a) => !isLiteral(a));
			if (bad.length) cands.push({ n, rule: "seqcall", op: `.${n.expression.name.text}()`, operands: bad, receiver: n.expression.expression });
		} else if (n.kind === SyntaxKind.Identifier && (n.text === "Math" || n.text === "Date")) {
			const p = n.parent;
			const isName = p && ((p.kind === SyntaxKind.PropertyAccessExpression && p.name === n) || (p.kind === SyntaxKind.PropertyAssignment && p.name === n));
			if (!isName) globals.push(n);
		}
	});
	const operandNodes = cands.flatMap((c) => c.operands);
	const receivers = cands.filter((c) => c.receiver).map((c) => c.receiver);
	const types = typesOf([...operandNodes, ...receivers]);
	let k = 0;
	const opTypes = new Map();
	for (const c of cands) opTypes.set(c, c.operands.map(() => types[k++]));
	const recTypes = new Map();
	for (const c of cands) if (c.receiver) recTypes.set(c, types[k++]);
	for (const c of cands) {
		const ts = opTypes.get(c);
		const num = ts.some((t) => some(t, NUMERIC));
		let hit = false;
		if (c.rule === "arith") {
			const str = ts.some((t) => some(t, STRINGY));
			hit = c.op.startsWith("+") ? num && !str : num;
		} else if (c.rule === "unary" && c.op === "+x") hit = true; // a conversion to number, whatever the operand
		else if (c.rule === "order" || c.rule === "unary" || c.rule === "index") hit = num;
		else if (c.rule === "seqcall") {
			const rt = recTypes.get(c);
			const isStr = rt && some(rt, STRINGY);
			hit = num && !isStr ? true : num && isStr ? "string" : false;
			if (hit === "string") { c.rule = "seqcall-string"; hit = true; }
		}
		if (hit) hits.push({ path, rule: c.rule, op: c.op, line: line(c.n), text: text(c.n) });
	}
	const syms = symbolsOf(globals);
	globals.forEach((g, i) => {
		const decl = syms[i]?.declarations?.[0]?.path ?? "";
		if (/lib\.[\w.]*\.d\.ts$/.test(decl)) hits.push({ path, rule: g.text === "Math" ? "math" : "date", op: g.text, line: line(g), text: text(g.parent?.parent ?? g) });
	});
}
const tEnd = performance.now();
api.close();
writeFileSync(jsonOut, JSON.stringify(hits, null, 1));
const per = {};
for (const h of hits) per[h.path] = (per[h.path] ?? 0) + 1;
console.log(`files=${files.length} hits=${hits.length} mode=${mode} rpcTypeCalls=${rpcTypeCalls} open=${(tOpen - t0).toFixed(0)}ms rule=${(tEnd - tOpen).toFixed(0)}ms total=${(tEnd - t0).toFixed(0)}ms`);
const byRule = {};
for (const h of hits) byRule[h.rule] = (byRule[h.rule] ?? 0) + 1;
console.log("by rule:", JSON.stringify(byRule));
