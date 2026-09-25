import type { Config } from "tailwindcss";
import preset from "@vim/config/tailwind-preset";

export default {
  presets: [preset],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "../../packages/ui/src/**/*.{ts,tsx}",
    // La caja también pinta la pantalla de cocina (modo cocina y ?kds). Sin esto, las clases que
    // solo usa el KDS no se generaban: el botón LISTO salía sin su fondo verde.
    "../../packages/kds-core/src/**/*.{ts,tsx}",
  ],
} satisfies Config;
