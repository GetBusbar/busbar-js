import { writeFileSync } from "node:fs";

// The generated CommonJS output needs its own module boundary.
writeFileSync(new URL("../dist/package.json", import.meta.url), '{"type":"commonjs"}\n');
