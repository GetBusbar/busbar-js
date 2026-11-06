import assert from "node:assert/strict";

export function exactScalar(schema) {
  const integer = schema?.type === "integer" || Array.isArray(schema?.type) && schema.type.includes("integer");
  const meta = schema?.["x-busbar-exact-number"] ?? (integer && ["uint64", "int64", "uint"].includes(schema.format) ? { representation: "json-integer-token", integer_format: schema.format } : undefined);
  if (!meta) return undefined;
  const nullable = schema.type?.includes?.("null") || schema.anyOf?.some(value => value.type === "null") || false;
  const representations = Array.isArray(meta.representation) ? meta.representation : [meta.representation];
  if (representations.includes("json-number-token")) {
    assert.equal(meta.scale, 6, "unsupported exact decimal scale");
    assert.equal(meta.mantissa_bits, 128, "unsupported exact decimal range");
    return { kind: "count", ...(representations.includes("decimal-string") ? { allowString: true } : {}), ...(nullable ? { nullable: true } : {}) };
  }
  assert.equal(meta.representation, "json-integer-token", "unsupported exact number representation");
  const format = meta.integer_format ?? (meta.bits === 64 && meta.signed === false ? "uint64" : undefined);
  assert(["uint64", "int64", "uint"].includes(format), "unsupported exact integer format");
  return { kind: "integer", format, ...(nullable ? { nullable: true } : {}) };
}

function merge(left, right) {
  if (!left) return right;
  if (!right) return left;
  if (Object.keys(left).length === 0) return right;
  if (Object.keys(right).length === 0) return left;
  if (JSON.stringify(left) === JSON.stringify(right)) return left;
  if (left.kind || right.kind || left.alternatives || right.alternatives)
    return { alternatives: [...(left.alternatives ?? [left]), ...(right.alternatives ?? [right])] };
  const result = { ...left };
  for (const [key, value] of Object.entries(right)) {
    if (key === "fields") {
      result.fields = { ...left.fields };
      for (const [name, child] of Object.entries(value)) result.fields[name] = merge(result.fields[name], child);
    } else result[key] = merge(result[key], value);
  }
  return result;
}

export function exactPlan(schema, specification, active = new Set()) {
  if (schema === true) return { raw: true };
  if (!schema || typeof schema !== "object") return undefined;
  const scalar = exactScalar(schema);
  if (scalar) return scalar;
  if (schema.$ref) {
    assert(schema.$ref.startsWith("#/"), "only local exact schema references are supported");
    assert(!active.has(schema.$ref), "recursive exact schemas need explicit support");
    const target = decodeURIComponent(schema.$ref.slice(2)).split("/").reduce((value, key) => value?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], specification);
    assert(target, `unresolved exact schema ${schema.$ref}`);
    return exactPlan(target, specification, new Set([...active, schema.$ref]));
  }
  const descriptive = Object.keys(schema).every(key => ["description", "title", "default"].includes(key));
  const freeObject = schema.type === "object" && !schema.properties && !schema.allOf && !schema.anyOf && !schema.oneOf && (schema.additionalProperties === undefined || schema.additionalProperties === true || typeof schema.additionalProperties === "object" && Object.keys(schema.additionalProperties).length === 0);
  if (descriptive || freeObject) return { raw: true };
  let plan = {};
  const fields = Object.fromEntries(Object.entries(schema.properties ?? {}).flatMap(([name, node]) => {
    const child = exactPlan(node, specification, active);
    return [[name, child ?? {}]];
  }));
  if (Object.keys(fields).length) {
    plan.fields = fields;
    if (schema.type === "object" && schema.additionalProperties === undefined) plan.values = { raw: true };
  }
  for (const [field, keyword] of [["items", "items"], ["values", "additionalProperties"]]) {
    const child = exactPlan(schema[keyword], specification, active);
    if (child) plan[field] = child;
  }
  for (const keyword of ["allOf", "anyOf", "oneOf"])
    for (const variant of schema[keyword] ?? []) plan = merge(plan, exactPlan(variant, specification, active)) ?? {};
  if ([...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].some(node => node.type === "null") && Object.keys(plan).length) plan.nullable = true;
  return Object.keys(plan).length ? plan : undefined;
}

export function exactOperations(specification) {
  assert.equal(specification["x-busbar-exact-numbers"]?.profile, "lossless-number-token-v1", "unsupported exact-number profile");
  const result = new Map();
  for (const [path, item] of Object.entries(specification.paths)) for (const method of ["get", "put", "post", "patch", "delete", "head", "options", "trace"]) {
    const operation = item[method];
    if (!operation) continue;
    const responses = {};
    for (const [status, response] of Object.entries(operation.responses ?? {})) {
      const plan = exactPlan(response.content?.["application/json"]?.schema, specification);
      if (plan) responses[status] = plan;
    }
    const request = operation.requestBody?.content?.["application/json"]?.schema;
    let body = exactPlan(request, specification);
    // This declared union is explicitly selected by its header, not by JSON shape.
    if (path === "/api/v1/admin/adjust" && method === "post") {
      assert.deepEqual(request?.anyOf?.map(node => node.$ref), ["#/components/schemas/AdjustReq", "#/components/schemas/ExactAdjustReq"]);
      assert(operation.parameters.some(node => node.in === "header" && node.name === "Idempotency-Key"));
      body = { selectHeader: "Idempotency-Key", absent: exactPlan(request.anyOf[0], specification), present: exactPlan(request.anyOf[1], specification) };
    }
    const parameters = {};
    for (const node of [...(item.parameters ?? []), ...(operation.parameters ?? [])]) {
      if (!["path", "query"].includes(node.in)) continue;
      const plan = exactPlan(node.schema, specification);
      if (plan) (parameters[node.in] ??= { fields: {} }).fields[node.name] = plan;
    }
    result.set(`${method.toUpperCase()} ${path}`, { responses, ...(request ? { jsonBody: true } : {}), ...(body ? { body } : {}), ...parameters });
  }
  return result;
}

/** Browser types carry exact quantities as strings; canonical wire schemas remain untouched. */
export function browserExactSchemas(value) {
  if (!value || typeof value !== "object") return;
  const scalar = exactScalar(value);
  if (scalar) {
    value.type = scalar.nullable ? ["string", "null"] : "string";
    for (const key of ["format", "minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "anyOf", "oneOf", "allOf"]) delete value[key];
  }
  if (value["x-busbar-extensible-enum"] === true) {
    assert.equal(value.type, "string");
    delete value.enum;
  }
  for (const child of Object.values(value)) browserExactSchemas(child);
}
