// Design tokens de VIM POS — extraídos de los mockups (P-059 y design system).
// Fuente de verdad visual: ../RECURSOS PARA DESARROLLO/MOCKUPS + doc 08.
// Usado como preset por apps/pos, apps/admin, apps/platform y packages/ui.

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Marca
        accent: { DEFAULT: "#E8502E", hover: "#CF4525", soft: "#FBF0EC" },
        // Tinta
        ink: { DEFAULT: "#16161A", 2: "#5A5A60", 3: "#8E8E94" },
        // Semánticos
        success: "#2E7D52",
        warning: "#9A6B12",
        danger: "#C0392B",
        info: "#2C5AA0",
        // Superficies / líneas
        bg: "#FFFFFF",
        surface: "#FFFFFF",
        line: { DEFAULT: "#ECECE9", strong: "#DDDDD9" },
        hover: "#F6F6F4",
        sel: "#FBFBFA",
        // Paleta funcional de categorías / gráficas (NUNCA el naranja de marca)
        cat: {
          blue: "#2C5AA0",
          green: "#2E7D52",
          teal: "#1F7A82",
          violet: "#6B4FA0",
          amber: "#B5701A",
          wine: "#9A3050",
        },
        // KDS (tema oscuro, doc 14) — colores aclarados para fondo negro
        kds: {
          bg: "#1A1A1E",
          surface: "#26262B",
          text: "#F0F0EC",
          warning: "#D4A017",
          danger: "#E04040",
        },
      },
      fontFamily: {
        sans: ["'Inter Tight'", "system-ui", "sans-serif"],
        display: ["Sora", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"], // tickets/reportes
      },
      borderRadius: { sm: "4px", DEFAULT: "6px", lg: "8px" },
      spacing: {
        1: "4px", 2: "8px", 3: "12px", 4: "16px", 5: "20px", 6: "24px", 8: "32px",
      },
      keyframes: {
        // Animaciones de las pantallas de auth (mockups P-002/P-010/P-012).
        "vim-shake": {
          "0%,100%": { transform: "translateX(0)" },
          "20%": { transform: "translateX(-7px)" },
          "40%": { transform: "translateX(7px)" },
          "60%": { transform: "translateX(-5px)" },
          "80%": { transform: "translateX(5px)" },
        },
        "vim-fade": { from: { opacity: "0" }, to: { opacity: "1" } },
        "vim-pop": {
          from: { opacity: "0", transform: "translateY(8px) scale(.98)" },
          to: { opacity: "1", transform: "none" },
        },
      },
      animation: {
        "vim-shake": "vim-shake .4s",
        "vim-fade": "vim-fade .18s ease",
        "vim-pop": "vim-pop .2s cubic-bezier(.22,1,.36,1)",
      },
    },
  },
};
