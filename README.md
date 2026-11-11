# @busbar/busbar-admin (TypeScript SDK)

A typed TypeScript client for the **Busbar Admin API** (`/api/v1/admin`).

Generated from the typed OpenAPI 3.1 schema in [`openapi.json`](./openapi.json)
with [`@hey-api/openapi-ts`](https://heyapi.dev) + `@hey-api/client-fetch`, so
every response is a real interface (`InfoView`, `TopologyInfo`, ...) — not
`unknown`/`any`.

## Versioning

The SDK carries its **own** semantic version, independent of the busbar server /
OpenAPI `info.version` (currently `1.6.0`). This first cut is **`0.1.0`**. It
targets the frozen, additive-only `/api/v1/admin` surface.

## Install

```bash
npm install @busbar/busbar-admin
```

## Usage

The admin API authenticates with an `x-admin-token` header. Create a client with
your endpoint and token, then call `GET /info` (see
[`examples/smoke.ts`](./examples/smoke.ts)):

```ts
import { createClient, createConfig } from "@hey-api/client-fetch";
import { getApiV1AdminInfo } from "@busbar/busbar-admin";
import type { InfoView } from "@busbar/busbar-admin";

const client = createClient(
  createConfig({
    baseUrl: "http://localhost:8081",
    headers: { "x-admin-token": "YOUR_ADMIN_TOKEN" },
  }),
);

const { data, error } = await getApiV1AdminInfo({ client });
if (error !== undefined) throw error;

// `data` is TYPED as InfoView — editor autocompletes .version, .topology, .build, ...
const info: InfoView = data;
console.log("busbar version:", info.version);          // -> "1.6.0"
console.log("pools:", info.topology.pools);
console.log("config version:", info.config_version);
```

> Prefer `Authorization: Bearer`? Set `headers: { Authorization: "Bearer YOUR_ADMIN_TOKEN" }`
> instead — the admin API accepts either.

## Exact numeric values

The API sends Count quantities as JSON numbers with at most six decimal places.
The SDK exposes these annotated fields as `Count` decimal **strings**, including
whole counts: `"27.5"`, `"0.000001"`, or `"9007199254740993"`. This preserves the
wire quantity beyond JavaScript's safe integer range. Generated methods decode
Count-bearing responses from raw text before ordinary JSON number parsing, even
when given a caller-created fetch client. Configured response validators and
transformers receive the decoded exact values. The declared
`lossless-number-token-v1` profile also exposes annotated u64/i64 integers as
decimal strings, including counters, timestamps and integer money fields. Floating
ratios keep their numeric types. `integerFromDecimal(text, format)` checks integer
spelling and the declared u64/i64 bounds. Requests serialize these strings back
to numeric JSON tokens; existing server wire representations are unchanged.
Already-rounded JavaScript numbers are rejected.

Do not convert a Count to `number` for billing. Use exact decimal or scaled integer
arithmetic in the application. The exported `countFromDecimal(text)` validates
scale 6 and the signed 128-bit mantissa range without rounding. Invalid quantities
fail decoding rather than being rounded. Count values are strings **inside the
SDK**, not a change to the server's JSON wire format.

For arbitrary configuration JSON, use `parseExactJson(text)` and
`stringifyExactJson(value)`. These preserve original numeric tokens (including
`1.0` and `1e0`) for the server's `integer-token-v1` validation instead of
normalizing invalid integer spellings into accepted integers. Opaque response
JSON preserves lossless number objects; these helpers serialize them correctly.
Custom JSON body serializers must preserve numeric wire types for exact fields.

## Regenerating the client

The committed client under [`src/`](./src) is generated from `openapi.json`, the
Busbar 1.6.0 native schema (SHA-256
`470bc97ae3f4895dce444af9580ec9f22fd263ad94912232ad0faf5a73b86b40`). Operation names continue to derive
from HTTP methods and paths, preserving the SDK exports when schema operation IDs
change. The generation adapter preserves per-request `Headers`, tuple-list, and
object inputs when merging generated JSON content-type defaults. Its source lives
in `scripts/generate.mjs` and `runtime/headers.ts`. The canonical schema's
exact-number profile (`x-busbar-exact-numbers`, required) drives `scripts/exact.mjs`,
`runtime/exact.ts` and the Count validator in `runtime/counts.ts`. Do not edit generated files.
The pinned `@hey-api/openapi-ts` 0.64.15 bundler resolves local references inside
extensions against the OpenAPI root. The `x-busbar-config-schemas` extension is
instead a standalone JSON Schema with its own `$defs`. `scripts/schema-input.mjs`
omits only that extension from an isolated generator input after checking that no
retained OpenAPI reference depends on it. The canonical `openapi.json` shipped in
the package retains the complete extension byte-for-byte; all operations,
components and exact-number metadata remain represented in the generator input;
only declared exact quantities receive browser string types and extensible error
enums remain open. Extract the
extension's `schema` object before using its local references for configuration
forms.

To re-derive it:

```bash
npm ci
npm run generate     # runs the pinned generator and header compatibility adapter
npm run typecheck    # checks response types and usage examples
npm run build        # emits JavaScript + declarations under dist/
npm run test:package # checks Node imports and a mocked HTTP request
```

The generator and TypeScript versions are pinned in `package.json`
(`@hey-api/openapi-ts@0.64.15`, `@hey-api/client-fetch@0.8.4`, `typescript@5.7.3` — TS 7 previews crash the
generator). Keep the generator and fetch runtime compatible: newer runtime response
generics can silently change inferred response types. After regenerating, the committed
client must not drift: `git diff --exit-code` must be clean.

The published package contains compiled JavaScript and TypeScript declarations.
`npm pack` and `npm publish` build and smoke-test it automatically through `prepack`.

## License

Apache-2.0 © Busbar, Inc.
