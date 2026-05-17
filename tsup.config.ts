import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  platform: "node",
  clean: true,
  shims: false,
  splitting: false,
  sourcemap: false,
  minify: false,
  treeshake: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
