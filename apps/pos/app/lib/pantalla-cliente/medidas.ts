/**
 * Cuánto mide un texto grande en la pantalla del cliente, para que nunca se corte.
 *
 * El monitor puede ser horizontal, vertical o casi cuadrado, y en los dos últimos el ancho ES
 * 100vmin. Un texto a tamaño fijo que cabe en uno se sale en otro; aquí se estima su ancho y se
 * le da su tope o menos.
 */

/**
 * Ancho de un texto en `em`, estimado por lo alto para Sora bold: cifras tabulares (el cero mide
 * 0.74 em), mayúsculas (la O y la M de Sora son anchas), el resto y los espacios. Si la estimación
 * falla, que sobre margen y no que se corte un dígito o una letra.
 */
export function anchoEm(texto: string): number {
  let em = 0;
  for (const c of texto) {
    if (c >= "0" && c <= "9") em += 0.76;
    else if (c === "," || c === "." || c === " ") em += 0.3;
    else if (c !== c.toLowerCase()) em += 0.9;
    else em += 0.7;
  }
  return em;
}

/**
 * Tamaño de letra de una cifra grande: `tope` en vmin, o menos si a ese tamaño no cabe en `ancho`.
 *
 * En un monitor vertical o casi cuadrado el ancho ES 100vmin, y "$1,234.50" a 16vmin ya lo roza.
 * Una cifra cortada por el borde no es un detalle feo: es un total falso de cara al cliente.
 */
export function tamanoCifra(texto: string, tope: number, ancho: string): string {
  return `min(${tope}vmin, calc((${ancho}) / ${anchoEm(texto).toFixed(2)}))`;
}

/** Ancho que tiene el nombre del negocio en reposo: los 100vmin del lado corto menos 6 de margen por lado. */
export const ANCHO_NOMBRE_VMIN = 88;

/**
 * Tamaño del nombre del negocio en reposo, en vmin.
 *
 * Primero se intenta en UNA línea, entre el tope y el piso: «Knock-Out Burger» a 10vmin no cabe
 * en un monitor 4:3 y se partía. Si ni al piso cabe en una línea, se parte —solo por los espacios—
 * y entonces basta con que quepa la palabra más larga. Sin logo el tope es mayor: el nombre es lo
 * único que hay en pantalla.
 */
export function tamanoNombre(nombre: string, conLogo: boolean): number {
  const tope = conLogo ? 7 : 10;
  const piso = conLogo ? 5 : 6;
  const palabras = nombre.split(/\s+/).filter(Boolean);
  if (palabras.length === 0) return tope;
  const masLarga = Math.max(...palabras.map(anchoEm));
  const enUnaLinea = Math.min(tope, ANCHO_NOMBRE_VMIN / anchoEm(palabras.join(" ")));
  const porPalabras = Math.min(piso, ANCHO_NOMBRE_VMIN / masLarga);
  // Hacia abajo a dos decimales: redondear hacia arriba es justo lo que haría que no quepa.
  return Math.floor(Math.max(enUnaLinea, porPalabras) * 100) / 100;
}
