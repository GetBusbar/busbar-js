import { defineConfig } from '@hey-api/openapi-ts';

// Pinned generator recipe. Regenerate with: npm run generate
export default defineConfig({
  input: './openapi.json',
  output: {
    path: './src',
    format: false,
    lint: false,
  },
  plugins: ['@hey-api/client-fetch'],
});
