import { modulosEan13, normalizarEan } from "../lib/codigo-barras";

/**
 * Un EAN-13 (o UPC-A) como SVG: una barra por módulo negro. Sin código EAN, nada.
 * El `#000` literal es la única excepción a los tokens: la impresión no lee el tema y la barra
 * debe salir negra pura.
 */
export function BarrasEan13({ codigo, alto = 40 }: { codigo: string; alto?: number }) {
  const ean = normalizarEan(codigo);
  if (!ean) return null;
  const m = modulosEan13(ean);
  return (
    <svg viewBox={`0 0 95 ${alto}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`Código ${ean}`}>
      {[...m].map((b, i) => (b === "1" ? <rect key={i} x={i} y={0} width={1} height={alto} fill="#000" /> : null))}
    </svg>
  );
}

export type Formato = { tipo: "carta" } | { tipo: "rollo"; anchoMm: number; altoMm: number };

/** Hoja carta de 3×10 (etiquetas adhesivas comunes) o una etiqueta de rollo por página. */
export function formatoEtiqueta(f: Formato) {
  return f.tipo === "carta"
    ? { pagina: "letter", ancho: "66.7mm", alto: "25.4mm", columnas: 3 }
    : { pagina: `${f.anchoMm}mm ${f.altoMm}mm`, ancho: `${f.anchoMm}mm`, alto: `${f.altoMm}mm`, columnas: 1 };
}
