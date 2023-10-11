import { defineConfig } from "tsup";

export default defineConfig({
    entry: ["src/index.ts", "src/test.ts"],
    format: ["cjs", "esm"], // Build for commonJS and ESmodules
    dts: true,
    skipNodeModulesBundle: true,
    noExternal: ['node_modules/pepelaz'],
    splitting: false,
    sourcemap: true,
    clean: true,
});