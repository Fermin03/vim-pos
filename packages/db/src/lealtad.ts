// La regla de la lealtad que comparten el POS y el admin (ADR 0030). Lógica PURA: sin red, sin base.
//
// `puntosPorCompra` es el ESPEJO en TS de `lealtad_puntos_por_compra`
// (supabase/migrations/0156_lealtad.sql). La de SQL es la que escribe el movimiento; esta solo anuncia
// en pantalla lo que va a pasar (el «gana X» de la caja, el ejemplo del admin). Si cambias una, cambia
// la otra: sus casos de prueba son los mismos seis de supabase/scripts/smoke_lealtad_ganar.sql y viven
// en apps/pos/app/lib/__tests__/lealtad-reglas.test.ts.

export type Mecanica = "PUNTOS_DINERO" | "SELLOS" | "PUNTOS_PREMIOS";

/** Lo que hace falta de `lealtad_programa` para saber cuánto gana una compra. */
export type ReglaGanar = {
  mecanica: Mecanica;
  porcentaje: number | null;      // PUNTOS_DINERO
  pesosPorPunto: number | null;   // PUNTOS_PREMIOS
  compraMinima: number;
};

/**
 * Cuánto gana una compra de `base` pesos (lo pagado por comida: sin propina y sin envío).
 *
 * Se calcula en centavos enteros: `0.3 / 0.1` en coma flotante da 2.9999… y perdería un punto que
 * Postgres (numeric) sí da.
 */
export function puntosPorCompra(p: ReglaGanar, base: number): number {
  if (!Number.isFinite(base) || base <= 0 || base < (p.compraMinima ?? 0)) return 0;
  const baseCent = Math.round(base * 100);
  if (p.mecanica === "SELLOS") return 1;
  if (p.mecanica === "PUNTOS_DINERO") {
    const pctCent = Math.round((p.porcentaje ?? 0) * 100);
    return Math.floor((baseCent * pctCent) / 1_000_000);
  }
  if (p.mecanica === "PUNTOS_PREMIOS") {
    const porPuntoCent = Math.round((p.pesosPorPunto ?? 0) * 100);
    return porPuntoCent > 0 ? Math.floor(baseCent / porPuntoCent) : 0;
  }
  return 0;
}

export function unidad(mecanica: Mecanica, n: number): string {
  if (mecanica === "SELLOS") return n === 1 ? "sello" : "sellos";
  return n === 1 ? "punto" : "puntos";
}

/** "120 puntos", "1 sello". */
export function cantidad(mecanica: Mecanica, n: number): string {
  return `${n} ${unidad(mecanica, n)}`;
}
