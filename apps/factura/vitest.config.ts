import { defineConfig } from "vitest/config";

export default defineConfig({
  // tsconfig usa jsx:"preserve" (Next); para probar páginas, esbuild las compila con el runtime nuevo.
  esbuild: { jsx: "automatic" },
  test: { environment: "node", include: ["app/**/*.test.ts"] },
});
