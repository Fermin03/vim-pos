// El color del negocio (`#RRGGBB`, lo elige el dueño sin revisar contraste) convertido en lo que
// usan los tokens de @vim/ui: canales «R G B». Con ellos se sobrescribe `--accent` en la página del
// negocio y los botones principales salen de su color.

const FORMA = /^#[0-9a-f]{6}$/i;
const DE_FABRICA = "#111111";   // el valor por omisión de tienda_config.color (0161)

type Rgb = [number, number, number];

/** Luminancia relativa de WCAG 2 (0 = negro, 1 = blanco). */
function luminancia([r, g, b]: Rgb): number {
  const lin = (v: number) => { const c = v / 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
const mezclar = (a: Rgb, b: Rgb, deB: number): Rgb => a.map((v, i) => Math.round(v + (b[i]! - v) * deB)) as Rgb;
const canales = (c: Rgb): string => c.join(" ");
const NEGRO: Rgb = [0, 0, 0], BLANCO: Rgb = [255, 255, 255];

export type ColorDeNegocio = {
  /** El color tal cual. */ acento: string;
  /** Al pasar el mouse o presionar: un poco más oscuro; si ya es casi negro, más claro. */ hover: string;
  /** Fondo tenue del mismo tono (chips, renglón elegido). */ suave: string;
  /** Texto sobre `acento`: blanco o negro, el que más contraste (siempre ≥ 4.5:1). */ texto: string;
};

/** Canales «R G B» listos para `rgb(var(--x))`. Lo que no sea `#RRGGBB` cae al color de fábrica. */
export function colorDeNegocio(hex: string): ColorDeNegocio {
  const h = FORMA.test(hex) ? hex : DE_FABRICA;
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as Rgb;
  const l = luminancia(c);
  return {
    acento: canales(c),
    hover: canales(l < 0.03 ? mezclar(c, BLANCO, 0.18) : mezclar(c, NEGRO, 0.14)),
    suave: canales(mezclar(c, BLANCO, 0.9)),
    // Contraste con blanco = 1.05 / (L + 0.05); con negro = (L + 0.05) / 0.05. Se cruzan en L ≈ 0.179.
    texto: canales(1.05 / (l + 0.05) >= (l + 0.05) / 0.05 ? BLANCO : NEGRO),
  };
}

/**
 * Para el `style` del contenedor del negocio: pisa los tokens de marca de @vim/ui con su color.
 * `--sobre-accent` es nuevo (el texto encima del color): los botones del negocio lo usan en vez de
 * `text-white`, que con un amarillo no se leería.
 */
export function variablesDeColor(hex: string): Record<"--accent" | "--accent-hover" | "--accent-soft" | "--sobre-accent", string> {
  const c = colorDeNegocio(hex);
  return { "--accent": c.acento, "--accent-hover": c.hover, "--accent-soft": c.suave, "--sobre-accent": c.texto };
}
