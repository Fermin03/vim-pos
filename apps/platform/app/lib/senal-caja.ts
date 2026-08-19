/**
 * Qué tan viva está una caja, con la mejor señal disponible.
 *
 * El semáforo del panel leía solo `cajas.ultima_conexion`, una columna que ningún código escribió
 * nunca: TODAS las cajas salían en rojo "Nunca conectó", incluida la del piloto, que llevaba
 * semanas subiendo ventas sin fallar. Una alarma que siempre suena deja de mirarse, y el día que
 * una caja se calle de verdad nadie lo va a notar.
 *
 * Las tres señales, de más a menos directa:
 *   · `conexion` — la caja selló su paso al sincronizar (migración 0073). Prueba que habló.
 *   · `sync`     — subió datos. Igual de bueno, pero solo ocurre cuando había algo que subir.
 *   · `venta`    — vendió. Prueba que operó, no que se conectó: puede haber vendido sin subir.
 *
 * Se distingue el origen porque en soporte cambia la respuesta. "Conectada" apoyado en una venta
 * de hace tres horas puede convivir con una caja que lleva días sin subir nada — que es
 * justamente el caso grave, el que deja al cliente sin respaldo en la nube.
 */
export type OrigenSenal = "conexion" | "sync" | "venta";
export type EstadoCaja = "ok" | "tibia" | "caida" | "nunca" | "bloqueada" | "inactiva";

export function señalDeCaja(
  fuentes: { ultimaConexion?: string | null; ultimoSync?: string | null; ultimaVenta?: string | null },
  ahora: number = Date.now(),
): { señal: string | null; origen: OrigenSenal | null; horas: number | null } {
  const señal = fuentes.ultimaConexion ?? fuentes.ultimoSync ?? fuentes.ultimaVenta ?? null;
  const origen: OrigenSenal | null = fuentes.ultimaConexion ? "conexion"
    : fuentes.ultimoSync ? "sync"
    : fuentes.ultimaVenta ? "venta"
    : null;
  const t = señal ? new Date(señal).getTime() : NaN;
  // Una fecha ilegible se trata como ausencia y no como "hace un instante": inventar frescura
  // es el error caro de los dos.
  const horas = Number.isNaN(t) ? null : Math.floor((ahora - t) / 3_600_000);
  return { señal: Number.isNaN(t) ? null : señal, origen: Number.isNaN(t) ? null : origen, horas };
}

/** Semáforo. Bloqueada/inactiva mandan sobre la frescura: son estados administrativos. */
export function estadoDeCaja(
  caja: { bloqueada: boolean; activa: boolean },
  horas: number | null,
): EstadoCaja {
  if (caja.bloqueada) return "bloqueada";
  if (!caja.activa) return "inactiva";
  if (horas === null) return "nunca";
  if (horas >= 72) return "caida";
  if (horas >= 24) return "tibia";
  return "ok";
}
