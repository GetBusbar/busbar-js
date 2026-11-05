import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clientGeneratorInput } from "../scripts/schema-input.mjs";
import { countOperations } from "../scripts/counts.mjs";

const canonicalPath = new URL("../openapi.json", import.meta.url);

test("generator input adapts declared exact browser types while preserving canonical numeric wire schemas", () => {
  const bytes = readFileSync(canonicalPath);
  const canonical = JSON.parse(bytes);
  const before = structuredClone(canonical);
  const derived = clientGeneratorInput(canonical);
  assert.equal(Object.hasOwn(derived, "x-busbar-config-schemas"), false);
  assert.deepEqual(canonical, before);
  assert.deepEqual(readFileSync(canonicalPath), bytes);
  assert.deepEqual(Object.keys(derived.paths), Object.keys(canonical.paths));
  assert.deepEqual(derived.info, canonical.info);
  assert.equal(canonical["x-busbar-exact-numbers"].profile, "lossless-number-token-v1");
  assert.equal(derived.components.schemas.CreatedKeyView.properties.expires_at.type, "string");
  assert.equal(canonical.components.schemas.CreatedKeyView.properties.expires_at.type, "integer");
  assert.equal(derived.components.schemas.ClassUsage.properties.count.type, "string");
  assert.equal(canonical.components.schemas.ClassUsage.properties.count.type, "number");
  assert.deepEqual(derived.components.schemas.KeyMeteringView.properties.rate_headroom, canonical.components.schemas.KeyMeteringView.properties.rate_headroom);
  assert.equal(derived.components.schemas.ExactAdjustReq.properties.delta.additionalProperties.type, "string");
  assert.equal(derived.components.schemas.Error.properties.error.properties.code.enum, undefined);
  assert(Array.isArray(canonical.components.schemas.Error.properties.error.properties.code.enum));
  const methods = new Set(["get", "post", "put", "patch", "delete", "head", "options", "trace"]);
  assert.equal(Object.values(derived.paths).flatMap(item => Object.keys(item)).filter(key => methods.has(key)).length, 103);
  assert.equal(countOperations(canonical).size, 3);
  function countMarkers(value) {
    if (!value || typeof value !== "object") return 0;
    return (value["x-busbar-count-scale"] === 6 ? 1 : 0) + Object.values(value).reduce((sum, child) => sum + countMarkers(child), 0);
  }
  assert.equal(countMarkers(derived), 15);
  assert.equal(countMarkers(canonical), 15);
  derived.info.title = "generator may mutate its own input";
  assert.deepEqual(canonical, before);
});

test("generator input refuses operation or component references into omitted config forms", () => {
  const canonical = JSON.parse(readFileSync(canonicalPath));
  for (const ref of ["#/x-busbar-config-schemas/schema", "#/%78-busbar-config-schemas/schema"]) {
    const fromOperation = structuredClone(canonical);
    fromOperation.paths["/test"] = { get: { responses: { 200: { content: { "application/json": { schema: { $ref: ref } } } } } } };
    assert.throws(() => clientGeneratorInput(fromOperation), /referenced by a retained schema/);
    const fromComponent = structuredClone(canonical);
    fromComponent.components.schemas.Unsupported = { $ref: ref };
    assert.throws(() => clientGeneratorInput(fromComponent), /referenced by a retained schema/);
  }
});
