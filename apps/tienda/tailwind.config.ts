import type { Config } from "tailwindcss";
import preset from "@vim/config/tailwind-preset";

export default {
  presets: [preset],
  // El texto encima del color del negocio (blanco o negro según el color; app/lib/color.ts).
  theme: { extend: { colors: { "sobre-accent": "rgb(var(--sobre-accent) / <alpha-value>)" } } },
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "../../packages/ui/src/**/*.{ts,tsx}"],
} satisfies Config;
