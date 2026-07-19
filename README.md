# busbar (TypeScript SDK)

A typed TypeScript client for the **Busbar Admin API** (`/api/v1/admin`).

Generated from the typed OpenAPI 3.1 schema in [`openapi.json`](./openapi.json)
with [`@hey-api/openapi-ts`](https://heyapi.dev) + `@hey-api/client-fetch`, so
every response is a real interface (`InfoView`, `TopologyInfo`, ...) — not
`unknown`/`any`.

## Versioning

The SDK carries its **own** semantic version, independent of the busbar server /
OpenAPI `info.version` (currently `1.4.0`). This first cut is **`0.1.0`**. It
targets the frozen, additive-only `/api/v1/admin` surface.

## Install

```bash
npm install busbar
```

## Usage

The admin API authenticates with an `x-admin-token` header. Create a client with
your endpoint and token, then call `GET /info` (see
[`examples/smoke.ts`](./examples/smoke.ts)):

```ts
import { createClient, createConfig } from "@hey-api/client-fetch";
import { getApiV1AdminInfo } from "busbar";
import type { InfoView } from "busbar";

const client = createClient(
  createConfig({
    baseUrl: "http://localhost:8081",
    headers: { "x-admin-token": "YOUR_ADMIN_TOKEN" },
  }),
);

const { data, error } = await getApiV1AdminInfo({ client });
if (error) throw error;

// `data` is TYPED as InfoView — editor autocompletes .version, .topology, .build, ...
const info: InfoView = data;
console.log("busbar version:", info.version);          // -> "1.4.0"
console.log("pools:", info.topology.pools);
console.log("config version:", info.config_version);
```

> Prefer `Authorization: Bearer`? Set `headers: { Authorization: "Bearer YOUR_ADMIN_TOKEN" }`
> instead — the admin API accepts either.

## Regenerating the client

The committed client under [`src/`](./src) is generated from `openapi.json`. To
re-derive it:

```bash
npm ci
npm run generate     # runs openapi-ts against ./openapi.json
```

The generator and TypeScript versions are pinned in `package.json`
(`@hey-api/openapi-ts@0.64.15`, `typescript@5.7.3` — TS 7 previews crash the
generator). CI regenerates on every PR/push and fails if the committed client
drifts (`git diff --exit-code`).

## License

Apache-2.0 © Busbar, Inc.
