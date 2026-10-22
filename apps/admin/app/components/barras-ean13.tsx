import { modulosEan13, normalizarEan } from "../lib/codigo-barras";

/**
 * Un EAN-13 (o UPC-A) como SVG: un trazo por cada tramo de módulos negros seguidos, con sus zonas
 * quietas en blanco dentro del dibujo (11 módulos a la izquierda, 7 a la derecha) para que el
 * lector no las pierda contra el borde de la etiqueta. Sin código EAN, nada.
 * El `#000` literal es la única excepción a los tokens: la impresión no lee el tema y la barra
 * debe salir negra pura.
 */
export function BarrasEan13({ codigo, alto = 40 }: { codigo: string; alto?: number }) {
  const ean = normalizarEan(codigo);
  if (!ean) return null;
  const tramos = [...modulosEan13(ean).matchAll(/1+/g)];
  return (
    <svg viewBox={`-11 0 113 ${alto}`} preserveAspectRatio="none" className="h-full w-full" role="img" aria-label={`Código ${ean}`}>
      {tramos.map((t) => (
        <path key={t.index} d={`M${t.index} 0h${t[0].length}v${alto}h-${t[0].length}Z`} fill="#000" />
      ))}
    </svg>
  );
}

export type Formato = { tipo: "carta" } | { tipo: "rollo"; anchoMm: number; altoMm: number };

/** Hoja carta de 3×10 (Avery 5160 y equivalentes) o una etiqueta de rollo por página. */
export function formatoEtiqueta(f: Formato) {
  return f.tipo === "carta"
    ? { pagina: "letter", margen: "12.7mm 4.76mm", ancho: "66.675mm", alto: "25.4mm", columnas: 3, gap: "3.175mm" }
    : { pagina: `${f.anchoMm}mm ${f.altoMm}mm`, margen: "0", ancho: `${f.anchoMm}mm`, alto: `${f.altoMm}mm`, columnas: 1, gap: "0" };
}
