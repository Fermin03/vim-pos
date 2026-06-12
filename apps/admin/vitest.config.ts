import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["app/**/*.test.ts"],
    // El cliente Supabase se crea al cargar el módulo y exige estas envs; en tests
    // (lógica pura) basta un dummy para que el import no truene.
    env: {
      NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "test-anon",
    },
  },
});
