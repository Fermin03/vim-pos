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
  // El hover solo existe con puntero fino (mouse). En pantalla táctil, Tailwind 3 dejaba el
  // estilo de hover pegado al último elemento tocado: en la caja, el último producto o tecla
  // parecía seleccionado. Con esto todo `hover:` va detrás de @media (hover: hover).
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      colors: {
        // Marca
        accent: { DEFAULT: token("accent"), hover: token("accent-hover"), soft: token("accent-soft") },
        // Tinta
        ink: { DEFAULT: token("ink"), 2: token("ink-2"), 3: token("ink-3") },
        // Semánticos
        success: { DEFAULT: token("success"), soft: token("success-soft"), line: token("success-line") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft"), line: token("warning-line") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft"), line: token("danger-line") },
        info: { DEFAULT: token("info"), soft: token("info-soft"), line: token("info-line") },
        // Superficies / líneas
        bg: token("bg"),
        surface: token("surface"),
        line: { DEFAULT: token("line"), strong: token("line-strong") },
        hover: token("hover"),
        sel: token("sel"),
      },
      fontFamily: {
        sans: ["'Inter Tight'", "system-ui", "sans-serif"],
        display: ["Sora", "system-ui", "sans-serif"],
        mono: ["'JetBrains Mono'", "ui-monospace", "monospace"], // tickets/reportes
      },
      // Escala tipográfica: `text-13`, `text-24`… Doce pasos en vez de los ~35 tamaños sueltos
      // (`text-13`, `text-14`…) que había repartidos en 1,750 clases (revisión de
      // diseño, sep 2026). Los nombres dicen el tamaño, igual que los `--t-*` del sitio.
      //   11 micro (chips, horas)   12 etiquetas   13 texto de interfaz   14 controles
      //   15 texto destacado        16 campos en celular y cifras chicas
      //   18 · 20 títulos de bloque y de diálogo   24 · 28 · 32 · 40 títulos de página y cifras
      // Solo el tamaño: el interlineado sigue en `leading-*`, como con las clases a mano.
      // `text-xs/sm/base/lg/xl/2xl` de Tailwind caen en 12/14/16/18/20/24, dentro de la escala.
      // `pnpm tipografia` falla si alguien vuelve a escribir un `text-[Npx]`.
      fontSize: {
        11: "11px", 12: "12px", 13: "13px", 14: "14px", 15: "15px", 16: "16px",
        18: "18px", 20: "20px", 24: "24px", 28: "28px", 32: "32px", 40: "40px",
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
      // Las curvas viven en tokens.css (--ease-*), igual que los colores.
      transitionTimingFunction: {
        vim: "var(--ease-out)",
      },
      animation: {
        "vim-shake": "vim-shake .3s var(--ease-in-out)",
        "vim-fade": "vim-fade .18s ease",
        "vim-pop": "vim-pop .2s var(--ease-out)",
      },
    },
  },
};
