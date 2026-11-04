import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@hey-api/openapi-ts";
import ts from "typescript";

await createClient();
const sdkPath = new URL("../src/sdk.gen.ts", import.meta.url);
let text = readFileSync(sdkPath, "utf8");
const source = ts.createSourceFile("sdk.gen.ts", text, ts.ScriptTarget.Latest, true);
const edits = [];
let operations = 0;
for (const statement of source.statements) {
  if (!ts.isVariableStatement(statement)) continue;
  for (const declaration of statement.declarationList.declarations) {
    const fn = declaration.initializer;
    if (!fn || !ts.isArrowFunction(fn)) continue;
    assert(ts.isBlock(fn.body), "SDK generator changed its operation body shape");
    const returned = fn.body.statements.find(ts.isReturnStatement)?.expression;
    assert(returned && ts.isCallExpression(returned), "SDK operation must return a client call");
    const options = returned.arguments[0];
    assert(options && ts.isObjectLiteralExpression(options), "SDK request options must be an object");
    const headers = options.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === "headers");
    if (headers) {
      assert(ts.isObjectLiteralExpression(headers.initializer), "SDK headers must be an object");
      const spreads = headers.initializer.properties.filter(ts.isSpreadAssignment);
      assert.equal(spreads.length, 1, "SDK header merge shape changed");
      const value = spreads[0].expression;
      assert.equal(value.getText(source), "options?.headers", "SDK header input changed");
      edits.push({ start: value.getStart(source), end: value.end, text: "normalizeHeaders(options?.headers)" });
    } else {
      const last = options.properties.at(-1);
      assert(last && ts.isSpreadAssignment(last) && last.expression.getText(source) === "options", "SDK options merge shape changed");
      edits.push({ start: last.end, end: last.end, text: ",\n        headers: normalizeHeaders(options?.headers)" });
    }
    operations++;
  }
}
assert(operations > 0, "SDK generator emitted no operations");
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}
const firstLine = text.indexOf("\n") + 1;
text = text.slice(0, firstLine) + "\nimport { normalizeHeaders } from './runtime-headers.gen';\n" + text.slice(firstLine);
writeFileSync(sdkPath, text);
writeFileSync(
  new URL("../src/runtime-headers.gen.ts", import.meta.url),
  "// Generated from runtime/headers.ts by scripts/generate.mjs.\n" + readFileSync(new URL("../runtime/headers.ts", import.meta.url), "utf8"),
);
console.log(`Normalized per-request headers for ${operations} SDK operations.`);
