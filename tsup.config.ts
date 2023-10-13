import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts", "src/test.ts"],
    format: ["cjs", "esm"], // Build for commonJS and ESmodules
    dts: true,
    skipNodeModulesBundle: true,
    splitting: false,
    sourcemap: true,
    clean: true,
});