// Compile-only example proving the /info response is TYPED as InfoView.
import { createClient, createConfig } from "@hey-api/client-fetch";
import { getApiV1AdminInfo } from "../src";
import type { InfoView } from "../src";

const client = createClient(
  createConfig({
    baseUrl: "http://localhost:8081",
    headers: { "x-admin-token": "YOUR_ADMIN_TOKEN" },
  }),
);

export async function main(): Promise<void> {
  const { data, error } = await getApiV1AdminInfo({ client });
  if (error) throw error;
  const info: InfoView = data;              // TYPED — no cast, no `unknown`
  const version: string = info.version;     // .version is string
  const pools: number = info.topology.pools; // nested typed struct
  console.log(version, pools, info.config_version);
}
