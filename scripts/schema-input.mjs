import assert from "node:assert/strict";
import { browserExactSchemas } from "./exact.mjs";

const FORM_EXTENSION = "x-busbar-config-schemas";

/** The pinned bundler resolves every $ref against the OpenAPI root, even inside extensions.
 * Config forms are a separate JSON Schema document with its own local $defs scope.
 * Keep that document in canonical openapi.json; omit only this extension from codegen input.
 */
export function clientGeneratorInput(specification) {
  const input = structuredClone(specification);
  if (!Object.hasOwn(input, FORM_EXTENSION)) {
    if (input["x-busbar-exact-numbers"]) { browserExactSchemas(input.components); browserExactSchemas(input.paths); }
    return input;
  }
  const forms = input[FORM_EXTENSION];
  assert.equal(forms?.version, 1, "unsupported standalone config-form extension version");
  assert.equal(forms.context, "user_configuration", "unexpected config-form extension context");
  assert(forms.schema && typeof forms.schema === "object" && forms.schema.$defs,
    "config-form extension must contain its standalone schema and definitions");
  delete input[FORM_EXTENSION];
  function checkReferences(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string") {
      const fragment = decodeURIComponent(value.$ref.split("#", 2)[1] ?? "");
      assert(fragment !== `/${FORM_EXTENSION}` && !fragment.startsWith(`/${FORM_EXTENSION}/`),
        "OpenAPI generation cannot omit config forms referenced by a retained schema");
    }
    for (const child of Object.values(value)) checkReferences(child);
  }
  checkReferences(input);
  if (input["x-busbar-exact-numbers"]) { browserExactSchemas(input.components); browserExactSchemas(input.paths); }
  return input;
}
