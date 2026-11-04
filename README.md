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

## Regenerating the client

The committed client under [`src/`](./src) is generated from `openapi.json`, the
Busbar 1.6.0 snapshot from core commit
`16e797c65909c3b8ee3c54d6622d976070ba5e45`. Operation names continue to derive
from HTTP methods and paths, preserving the SDK exports when schema operation IDs
change. The generation adapter preserves per-request `Headers`, tuple-list, and
object inputs when merging generated JSON content-type defaults. Its source lives
in `scripts/generate.mjs` and `runtime/headers.ts`; do not edit generated files.
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
generics can silently change inferred response types. CI regenerates on every PR/push and fails if the committed client
drifts (`git diff --exit-code`).

The published package contains compiled JavaScript and TypeScript declarations.
`npm pack` and `npm publish` build and smoke-test it automatically through `prepack`.

## License

Apache-2.0 © Busbar, Inc.
