import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);

test("published entry supports CommonJS and ESM consumers", async () => {
  const cjs = require("../");
  const esm = await import("../dist/index.js");
  assert.equal(typeof cjs.getApiV1AdminInfo, "function");
  assert.equal(typeof esm.getApiV1AdminInfo, "function");
});

const { registerRequestTests } = await import("./request-runtime.mjs");
registerRequestTests(require("../"), await import("@hey-api/client-fetch"));
