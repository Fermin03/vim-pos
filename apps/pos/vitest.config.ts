import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    // Las suites importan libs que crean el cliente supabase al cargar el módulo;
    // los tests son puros (no tocan red), solo necesitan que el constructor no truene.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "dummy-anon-key-for-tests",
    },
  },
});
