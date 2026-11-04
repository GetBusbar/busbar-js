import { defineConfig } from '@hey-api/openapi-ts';

// Pinned generator recipe. Regenerate with: npm run generate
export default defineConfig({
  input: './openapi.json',
  output: {
    path: './src',
    format: false,
    lint: false,
  },
  plugins: [
    '@hey-api/client-fetch',
    // Preserve existing SDK export names when the schema adds operation IDs.
    { name: '@hey-api/sdk', operationId: false },
  ],
});
