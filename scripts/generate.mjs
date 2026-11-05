import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { createClient } from "@hey-api/openapi-ts";
import ts from "typescript";
import { countOperations } from "./counts.mjs";
import { exactOperations } from "./exact.mjs";
import { clientGeneratorInput } from "./schema-input.mjs";

const specification = JSON.parse(readFileSync(new URL("../openapi.json", import.meta.url), "utf8"));
const countResponses = countOperations(specification);
const exact = specification["x-busbar-exact-numbers"] ? exactOperations(specification) : undefined;
await createClient({ configFile: "./openapi-ts.config.ts", input: clientGeneratorInput(specification) });
const sdkPath = new URL("../src/sdk.gen.ts", import.meta.url);
let text = readFileSync(sdkPath, "utf8");
const source = ts.createSourceFile("sdk.gen.ts", text, ts.ScriptTarget.Latest, true);
const edits = [];
let operations = 0;
let adaptedCountOperations = 0;
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
    const url = options.properties.find((p) => ts.isPropertyAssignment(p) && p.name.getText(source) === "url")?.initializer;
    assert(url && ts.isStringLiteral(url), "SDK operation must declare a literal URL");
    assert(ts.isPropertyAccessExpression(returned.expression), "SDK operation must call a client method");
    const operationKey = `${returned.expression.name.text.toUpperCase()} ${url.text}`;
    const exactOperation = exact?.get(operationKey);
    if (exact) assert(exactOperation, `missing exact plan for ${operationKey}`);
    if (exactOperation) {
      const statuses = exactOperation.responses;
      const returnStatement = fn.body.statements.find(ts.isReturnStatement);
      edits.push({ start: returnStatement.getStart(source), end: returnStatement.getStart(source), text: `const exactOptions = mergeExactConfig(${returned.expression.expression.getText(source)}.getConfig(), options);\n    const exactRequest = prepareExactRequest(exactOptions, ${JSON.stringify(exactOperation)});\n    ` });
      edits.push({ start: options.end - 1, end: options.end - 1, text: `${options.properties.hasTrailingComma ? "" : ","}\n        ...exactRequest,${Object.keys(statuses).length ? "\n        parseAs: 'text'," : ""}\n    ` });
      if (Object.keys(statuses).length) {
        edits.push({ start: returned.getStart(source), end: returned.getStart(source), text: "withExactResponse(" });
        edits.push({ start: returned.end, end: returned.end, text: `, ${JSON.stringify(statuses)}, exactOptions)` });
      }
    } else {
      const countStatuses = countResponses.get(`${returned.expression.name.text.toUpperCase()} ${url.text}`);
      if (countStatuses) {
        adaptedCountOperations++;
        const returnStatement = fn.body.statements.find(ts.isReturnStatement);
        edits.push({ start: returnStatement.getStart(source), end: returnStatement.getStart(source), text: `const countOptions = { ...${returned.expression.expression.getText(source)}.getConfig(), ...options };\n    ` });
        edits.push({ start: options.end - 1, end: options.end - 1, text: `${options.properties.hasTrailingComma ? "" : ","}\n        parseAs: 'text',\n    ` });
        edits.push({ start: returned.end, end: returned.end, text: `.then(result => decodeCountResponse(result, ${JSON.stringify(countStatuses)}, countOptions))` });
      }
    }
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
assert.equal(adaptedCountOperations, exact ? 0 : countResponses.size, "every Count-bearing operation must use the exact decoder");
for (const edit of edits.sort((a, b) => b.start - a.start)) {
  text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
}
const firstLine = text.indexOf("\n") + 1;
text = text.slice(0, firstLine) + "\nimport { normalizeHeaders } from './runtime-headers.gen';\n" +
  (exact ? "import { mergeExactConfig, prepareExactRequest, withExactResponse } from './runtime-exact.gen';\n" : countResponses.size ? "import { decodeCountResponse } from './runtime-counts.gen';\n" : "") + text.slice(firstLine);
writeFileSync(sdkPath, text);
writeFileSync(
  new URL("../src/runtime-headers.gen.ts", import.meta.url),
  "// Generated from runtime/headers.ts by scripts/generate.mjs.\n" + readFileSync(new URL("../runtime/headers.ts", import.meta.url), "utf8"),
);
writeFileSync(
  new URL("../src/runtime-counts.gen.ts", import.meta.url),
  "// Generated from runtime/counts.ts by scripts/generate.mjs.\n" + readFileSync(new URL("../runtime/counts.ts", import.meta.url), "utf8"),
);

writeFileSync(
  new URL("../src/runtime-exact.gen.ts", import.meta.url),
  "// Generated from runtime/exact.ts by scripts/generate.mjs.\n" + readFileSync(new URL("../runtime/exact.ts", import.meta.url), "utf8"),
);

const typesPath = new URL("../src/types.gen.ts", import.meta.url);
let typesText = readFileSync(typesPath, "utf8");
const typesSource = ts.createSourceFile("types.gen.ts", typesText, ts.ScriptTarget.Latest, true);
const typeEdits = [];
let countFields = 0;
for (const statement of exact ? [] : typesSource.statements) {
  if (!ts.isTypeAliasDeclaration(statement)) continue;
  const schema = specification.components?.schemas?.[statement.name.text];
  if (!schema?.properties) continue;
  const marked = Object.entries(schema.properties).filter(([, property]) => property["x-busbar-count-scale"] === 6).map(([name]) => name);
  if (!marked.length) continue;
  assert(ts.isTypeLiteralNode(statement.type), `Count fields require an explicit object type: ${statement.name.text}`);
  for (const name of marked) {
    const member = statement.type.members.find((node) => ts.isPropertySignature(node) && node.name.text === name);
    assert(member?.type?.kind === ts.SyntaxKind.NumberKeyword, `Count field ${statement.name.text}.${name} must be numeric before adaptation`);
    typeEdits.push({ start: member.type.getStart(typesSource), end: member.type.end, text: "Count" });
    countFields++;
  }
}
for (const edit of typeEdits.sort((a, b) => b.start - a.start)) typesText = typesText.slice(0, edit.start) + edit.text + typesText.slice(edit.end);
if (countFields) typesText = "import type { Count } from './runtime-counts.gen';\n" + typesText;
writeFileSync(typesPath, typesText);
const indexPath = new URL("../src/index.ts", import.meta.url);
writeFileSync(indexPath, readFileSync(indexPath, "utf8") + "\nexport type { Count } from './runtime-counts.gen';\nexport { countFromDecimal } from './runtime-counts.gen';\nexport type { ExactInteger } from './runtime-exact.gen';\nexport { integerFromDecimal, parseExactJson, stringifyExactJson } from './runtime-exact.gen';\n");
console.log(`Normalized headers for ${operations} SDK operations; preserved ${countFields} Count fields across ${countResponses.size} operations.`);
