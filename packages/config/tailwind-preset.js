// Preset de Tailwind de VIM POS.
//
// AQUÍ NO HAY VALORES. La única fuente de los tokens es `packages/ui/tokens.css`; esto solo
// apunta a sus variables. Cambiar un color es cambiar una línea allá, y las cinco apps se
// enteran solas.
//
// Antes sí había valores: los mismos hexadecimales repetidos en los dos archivos, sincronizados
// a mano. En la migración de naranja a azul se actualizó uno y no el otro, y todo lo que usa
// `bg-accent` estuvo saliendo del color viejo. Ver `docs/decisiones/0003-la-marca-es-azul.md`.
//
// El `<alpha-value>` es lo que hace que sigan funcionando `bg-ink/40` y compañía: Tailwind lo
// sustituye por la opacidad de la clase. Por eso los tokens de color son canales (`22 22 26`) y
// no hexadecimal — un hex no se puede meter dentro de `rgb(… / .4)`.
//
// Usado como preset por apps/pos, apps/admin, apps/platform, apps/kds, apps/factura y packages/ui.

/** Un color que sale de una variable de `tokens.css` y admite el modificador de opacidad. */
const token = (nombre) => `rgb(var(--${nombre}) / <alpha-value>)`;

/** @type {import('tailwindcss').Config} */
module.exports = {
  theme: {
    extend: {
      colors: {
        // Marca
        accent: { DEFAULT: token("accent"), hover: token("accent-hover"), soft: token("accent-soft") },
        // Tinta
        ink: { DEFAULT: token("ink"), 2: token("ink-2"), 3: token("ink-3") },
        // Semánticos
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft") },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
        // Superficies / líneas
        bg: token("bg"),
        surface: token("surface"),
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        hover: token("hover"),
        sel: token("sel"),
        // Paleta funcional de categorías / gráficas (NUNCA el color de marca)
        cat: {
          blue: token("cat-blue"),
          green: token("cat-green"),
          teal: token("cat-teal"),
          violet: token("cat-violet"),
          amber: token("cat-amber"),
          wine: token("cat-wine"),
        },
        // KDS (tema oscuro, doc 14) — colores aclarados para fondo negro
        kds: {
          bg: token("kds-bg"),
          surface: token("kds-surface"),
          text: token("kds-text"),
          warning: token("kds-warning"),
          danger: token("kds-danger"),
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
