/**
 * Qué tan viva está una caja, con la mejor señal disponible.
 *
 * El semáforo del panel leía solo `cajas.ultima_conexion`, una columna que ningún código escribió
 * nunca: TODAS las cajas salían en rojo "Nunca conectó", incluida la del piloto, que llevaba
 * semanas subiendo ventas sin fallar. Una alarma que siempre suena deja de mirarse, y el día que
 * una caja se calle de verdad nadie lo va a notar.
 *
 * Las señales, de más a menos directa:
 *   · `latido`   — la caja llamó a `caja_latido` (migración 0105). La más honesta: prueba que
 *                  está encendida aunque no haya vendido ni tenido nada que subir. Solo la
 *                  mandan las cajas desde 0.4.60; las anteriores caen al criterio de abajo.
 *   · `conexion` — la caja selló su paso al sincronizar (migración 0073). Prueba que habló.
 *   · `sync`     — subió datos. Igual de bueno, pero solo ocurre cuando había algo que subir.
 *   · `venta`    — vendió. Prueba que operó, no que se conectó: puede haber vendido sin subir.
 *
 * Se distingue el origen porque en soporte cambia la respuesta. "Conectada" apoyado en una venta
 * de hace tres horas puede convivir con una caja que lleva días sin subir nada — que es
 * justamente el caso grave, el que deja al cliente sin respaldo en la nube.
 */
export type OrigenSenal = "latido" | "conexion" | "sync" | "venta";
export type EstadoCaja = "ok" | "tibia" | "caida" | "nunca" | "bloqueada" | "inactiva";

export function señalDeCaja(
  fuentes: { ultimoLatido?: string | null; ultimaConexion?: string | null; ultimoSync?: string | null; ultimaVenta?: string | null },
  ahora: number = Date.now(),
): { señal: string | null; origen: OrigenSenal | null; horas: number | null; minutos: number | null } {
  const señal = fuentes.ultimoLatido ?? fuentes.ultimaConexion ?? fuentes.ultimoSync ?? fuentes.ultimaVenta ?? null;
  const origen: OrigenSenal | null = fuentes.ultimoLatido ? "latido"
    : fuentes.ultimaConexion ? "conexion"
    : fuentes.ultimoSync ? "sync"
    : fuentes.ultimaVenta ? "venta"
    : null;
  const t = señal ? new Date(señal).getTime() : NaN;
  // Una fecha ilegible se trata como ausencia y no como "hace un instante": inventar frescura
  // es el error caro de los dos.
  const horas = Number.isNaN(t) ? null : Math.floor((ahora - t) / 3_600_000);
  const minutos = Number.isNaN(t) ? null : Math.floor((ahora - t) / 60_000);
  return { señal: Number.isNaN(t) ? null : señal, origen: Number.isNaN(t) ? null : origen, horas, minutos };
}

/** La caja late cada 10 min (ADR 0014). Dos latidos perdidos seguidos ya no es "en línea". */
export const LATIDO_EN_LINEA_MIN = 20;

/**
 * Semáforo. Bloqueada/inactiva mandan sobre la frescura: son estados administrativos.
 *
 * Con LATIDO (cajas 0.4.60+) se mide en minutos: la caja late cada 10, así que "ok" es haber
 * latido hace menos de 20. Antes el umbral era de 24 horas para toda señal, y una caja apagada
 * desde la mañana seguía en verde "Conectada" esa noche — justo cuando el cliente llama con la
 * caja caída (revisión de diseño, sep 2026). Entre 20 min y 3 días es "tibia" (sin señal: puede
 * ser el local cerrado, no una falla), y de ahí "caída".
 *
 * Las demás señales (conexión, sync, venta) no son periódicas: una caja vieja que no vendió en la
 * tarde no está caída. Para esas se conservan los umbrales en horas.
 */
export function estadoDeCaja(
  caja: { bloqueada: boolean; activa: boolean },
  horas: number | null,
  latido?: { origen: OrigenSenal | null; minutos: number | null },
): EstadoCaja {
  if (caja.bloqueada) return "bloqueada";
  if (!caja.activa) return "inactiva";
  if (horas === null) return "nunca";
  if (horas >= 72) return "caida";
  if (latido?.origen === "latido" && latido.minutos !== null) {
    return latido.minutos < LATIDO_EN_LINEA_MIN ? "ok" : "tibia";
  }
  if (horas >= 24) return "tibia";
  return "ok";
}
