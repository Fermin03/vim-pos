import type { Config } from "tailwindcss";
import preset from "@vim/config/tailwind-preset";

export default {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "../../packages/kds-core/src/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
