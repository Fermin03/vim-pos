/** El cobro de la suscripción de un negocio a VIM (0130): lo que ven el panel y el dueño.
 *
 * Vive aquí y no en cada app porque las dos tienen que decir LO MISMO: si el panel dice "vence en
 * 3 días" y el dueño ve "al corriente", alguien va a llamar para preguntar cuál es.
 */

export type MetodoCobro = "TRANSFERENCIA" | "EFECTIVO" | "TARJETA" | "DEPOSITO" | "OTRO";

export const ETIQUETA_METODO_COBRO: Record<MetodoCobro, string> = {
  TRANSFERENCIA: "Transferencia",
  EFECTIVO: "Efectivo",
  TARJETA: "Tarjeta",
  DEPOSITO: "Depósito",
  OTRO: "Otro",
};

/** Días que se avisa antes de la fecha de cobro. */
export const AVISO_DIAS = 5;

export type EstadoCobro =
  | { tipo: "SIN_COBRO" }
  | { tipo: "AL_CORRIENTE"; dias: number }
  | { tipo: "POR_VENCER"; dias: number }
  | { tipo: "HOY" }
  | { tipo: "VENCIDO"; dias: number };

/** Días entre dos fechas `YYYY-MM-DD` (b − a), sin que la hora ni el horario de verano estorben. */
export function diasEntre(a: string, b: string): number {
  const ms = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10)) - Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  return Math.round(ms / 86_400_000);
}

/**
 * ¿Cómo va el cobro? `proxima` = la fecha en que toca pagar (la de la suscripción); `hoy` en hora
 * de México (`hoyMx()`), nunca la del servidor.
 */
export function estadoCobro(proxima: string | null | undefined, hoy: string): EstadoCobro {
  if (!proxima) return { tipo: "SIN_COBRO" };
  const faltan = diasEntre(hoy, proxima.slice(0, 10));
  if (faltan < 0) return { tipo: "VENCIDO", dias: -faltan };
  if (faltan === 0) return { tipo: "HOY" };
  if (faltan <= AVISO_DIAS) return { tipo: "POR_VENCER", dias: faltan };
  return { tipo: "AL_CORRIENTE", dias: faltan };
}

/** Una frase para el estado: "Vencido hace 3 días", "Toca pagar hoy"… */
export function textoEstadoCobro(e: EstadoCobro): string {
  const dias = (n: number) => `${n} ${n === 1 ? "día" : "días"}`;
  switch (e.tipo) {
    case "SIN_COBRO": return "Sin cobro activo";
    case "AL_CORRIENTE": return "Al corriente";
    case "POR_VENCER": return `Toca pagar en ${dias(e.dias)}`;
    case "HOY": return "Toca pagar hoy";
    case "VENCIDO": return `Vencido hace ${dias(e.dias)}`;
  }
}

// ── Precio vigente (0141, ADR 0021) ─────────────────────────────────────────────────────────────
//
// ESPEJO de `precio_vigente_suscripcion()` en supabase/migrations/0141_cobro_promocion_prueba_plan.sql.
// La regla, en una línea: el precio de promoción vale HASTA `promocion_hasta` inclusive (en hora de
// México); del día siguiente en adelante manda `precio_mensual_mxn`, que es el de lista pactado.
// Si cambias una, cambia la otra: el panel suma el MRR con esta y la base decide con aquélla.

/** Lo mínimo de una fila de `suscripciones` para decir cuánto se paga. */
export type PrecioSuscripcion = {
  precio_mensual_mxn: number | string;
  precio_promocional_mxn?: number | string | null;
  promocion_hasta?: string | null;
  promocion_nombre?: string | null;
};

/** La promoción, si sigue vigente en `fecha` (`YYYY-MM-DD`, hora de México); si no, null. */
export function promocionVigente(
  s: PrecioSuscripcion,
  fecha: string,
): { precio: number; hasta: string; nombre: string | null; lista: number } | null {
  if (s.precio_promocional_mxn == null || !s.promocion_hasta) return null;
  const hasta = s.promocion_hasta.slice(0, 10);
  // Comparar `YYYY-MM-DD` como texto es comparar fechas: mismo largo, mismo orden.
  if (fecha.slice(0, 10) > hasta) return null;
  return { precio: Number(s.precio_promocional_mxn), hasta, nombre: s.promocion_nombre ?? null, lista: Number(s.precio_mensual_mxn) };
}

/** Lo que se paga al mes en `fecha`: la promoción si sigue vigente, si no el precio de lista. */
export function precioVigente(s: PrecioSuscripcion, fecha: string): number {
  return promocionVigente(s, fecha)?.precio ?? Number(s.precio_mensual_mxn);
}

/**
 * "$499 hasta 31 mar 2027, después $699", o solo "$699" sin promoción. Las fechas y el dinero los
 * formatea quien llama (cada app tiene su `fechaLegible` y su moneda): aquí solo la frase.
 */
export function textoPrecio(
  s: PrecioSuscripcion,
  fecha: string,
  fmt: { fecha: (iso: string) => string; mxn: (n: number) => string },
): string {
  const p = promocionVigente(s, fecha);
  if (!p) return fmt.mxn(Number(s.precio_mensual_mxn));
  return `${fmt.mxn(p.precio)} hasta ${fmt.fecha(p.hasta)}, después ${fmt.mxn(p.lista)}`;
}

// ── Prueba gratis (0141) ───────────────────────────────────────────────────────────────────────

/** Días de prueba desde el alta. El número lo pone la base (trigger de `tenants`); este es su eco. */
export const DIAS_PRUEBA = 30;

/** Días antes del fin de la prueba en que se empieza a avisar. */
export const AVISO_PRUEBA_DIAS = 5;

export type EstadoPrueba =
  | { tipo: "NO_APLICA" }
  | { tipo: "EN_PRUEBA"; hasta: string; dias: number }
  | { tipo: "VENCIDA"; hasta: string; dias: number };

/**
 * ¿Cómo va la prueba? Solo aplica a un negocio en TRIAL con fecha de fin. `dias` = los que faltan
 * (EN_PRUEBA, 0 = hoy es el último) o los que pasaron (VENCIDA). No bloquea nada: solo avisa.
 */
export function estadoPrueba(estadoTenant: string | null | undefined, pruebaHasta: string | null | undefined, hoy: string): EstadoPrueba {
  if (estadoTenant !== "TRIAL" || !pruebaHasta) return { tipo: "NO_APLICA" };
  const hasta = pruebaHasta.slice(0, 10);
  const faltan = diasEntre(hoy, hasta);
  return faltan < 0 ? { tipo: "VENCIDA", hasta, dias: -faltan } : { tipo: "EN_PRUEBA", hasta, dias: faltan };
}

// ── CLABE (0141) ───────────────────────────────────────────────────────────────────────────────

/**
 * CLABE interbancaria: 18 dígitos y el dígito de control de Banxico (pesos 3-7-1 sobre los primeros
 * 17, cada producto módulo 10; control = (10 − suma mod 10) mod 10). ESPEJO de `clabe_valida()` en 0141.
 */
export function clabeValida(clabe: string): boolean {
  if (!/^[0-9]{18}$/.test(clabe)) return false;
  const pesos = [3, 7, 1];
  let suma = 0;
  for (let i = 0; i < 17; i++) suma += (Number(clabe[i]) * pesos[i % 3]!) % 10;
  return (10 - (suma % 10)) % 10 === Number(clabe[17]);
}
