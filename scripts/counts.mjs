import assert from "node:assert/strict";

/** Compile only Count-bearing response structure; no runtime schema interpreter is shipped. */
export function countPlan(schema, specification, active = new Set()) {
  if (!schema || typeof schema !== "object") return undefined;
  if (Object.hasOwn(schema, "x-busbar-count-scale")) {
    assert.equal(schema["x-busbar-count-scale"], 6, "unsupported Count scale");
    assert.equal(schema.type, "number", "Count must remain a JSON number");
    return { count: true };
  }
  if (schema.$ref) {
    assert(schema.$ref.startsWith("#/"), "only local schema references are supported");
    assert(!active.has(schema.$ref), "recursive Count schemas require explicit handling");
    const target = schema.$ref.slice(2).split("/").reduce((node, key) => node?.[key.replace(/~1/g, "/").replace(/~0/g, "~")], specification);
    assert(target, `unresolved schema ${schema.$ref}`);
    return countPlan(target, specification, new Set([...active, schema.$ref]));
  }
  const plan = {};
  const fields = Object.fromEntries(Object.entries(schema.properties ?? {}).flatMap(([name, value]) => {
    const child = countPlan(value, specification, active);
    return child ? [[name, child]] : [];
  }));
  if (Object.keys(fields).length) plan.fields = fields;
  const items = countPlan(schema.items, specification, active);
  if (items) plan.items = items;
  const values = countPlan(schema.additionalProperties, specification, active);
  if (values) plan.values = values;
  for (const keyword of ["allOf", "anyOf", "oneOf"]) {
    for (const variant of schema[keyword] ?? []) {
      const child = countPlan(variant, specification, active);
      if (!child) continue;
      for (const [key, value] of Object.entries(child)) {
        if (key === "fields") plan.fields = { ...plan.fields, ...value };
        else {
          assert(!plan[key] || JSON.stringify(plan[key]) === JSON.stringify(value), "ambiguous Count response union");
          plan[key] = value;
        }
      }
    }
  }
  return Object.keys(plan).length ? plan : undefined;
}

export function countOperations(specification) {
  const operations = new Map();
  for (const [path, item] of Object.entries(specification.paths)) {
    for (const method of ["get", "put", "post", "patch", "delete"]) {
      const operation = item[method];
      if (!operation) continue;
      const statuses = {};
      for (const [status, response] of Object.entries(operation.responses ?? {})) {
        if (!/^2\d\d$/.test(status)) continue;
        const plan = countPlan(response.content?.["application/json"]?.schema, specification);
        if (plan) statuses[status] = plan;
      }
      if (Object.keys(statuses).length) operations.set(`${method.toUpperCase()} ${path}`, statuses);
    }
  }
  return operations;
}
