// La renovación de los permisos de Mercado Pago de la TIENDA (tienda_conexiones, 0173). Mismo patrón
// que la de la terminal (`terminal-mp-renovar`), con las credenciales de la aplicación de la tienda.
//
// El access token dura 180 días; con el refresh token se saca otro par sin molestar al dueño. Cada
// renovación CAMBIA también el refresh token y el viejo deja de servir. Por eso:
//   · el par nuevo se guarda entero, en una transacción (tienda_guardar_tokens: los dos o ninguno),
//     y la renovación solo cuenta como hecha cuando ese guardado contestó bien;
//   · una respuesta a medias de Mercado Pago no es un par: no se guarda nada y el par viejo sigue ahí;
//   · si el guardado falla se reintenta en el momento con el par que ya se tiene en la mano (es la
//     única copia): solo si no entra, la conexión se da por perdida.
// Tres finales para cada conexión:
//   RENOVADA    par nuevo guardado (y la public key, si vino);
//   PENDIENTE   fallo pasajero (sin respuesta, 5xx, 429, la base no contestó al leer): la conexión
//               NO se toca —su token actual sigue cobrando hasta que venza—, se anota el motivo y
//               se reintenta mañana;
//   DEFINITIVA  no tiene arreglo sin el dueño: Mercado Pago rechazó el refresh token (4xx), no hay
//               refresh token guardado, o el par nuevo no se pudo guardar. La conexión queda en
//               ERROR (el admin pide volver a conectarla y la tienda deja de ofrecer el pago ahí) y
//               se avisa a VIM, una vez: una conexión en ERROR ya no se vuelve a intentar.
// Sin SQL ni red propios: recibe un puerto. Se prueba con `node --test`.
import { esc, soloAscii } from "../correo.ts";
import type { Tokens } from "../terminal/mercado-pago-conexion.ts";

export type RespuestaDeTokens = { tokens: Tokens; publicKey: string | null } | { tokens: null; status: number; codigo: string | null };

export type PuertoRenovacion = {
  /** El refresh token guardado en Vault; null = no hay. Lanza si la base no contesta. */
  leerRefresh(conexionId: string): Promise<string | null>;
  pedirTokens(refreshToken: string): Promise<RespuestaDeTokens>;
  /** Guarda el par (y la public key si viene) en una transacción. Devuelve el error, o null si entró. */
  guardar(conexionId: string, t: Tokens, publicKey: string | null): Promise<string | null>;
  /** Deja dicho por qué no se renovó. Con `definitiva`, además la pone en ERROR. */
  anotar(conexionId: string, motivo: string, definitiva: boolean): Promise<void>;
  /** Aviso a VIM de una renovación que ya no tiene arreglo sin el dueño. */
  avisar(conexionId: string, motivo: string): Promise<void>;
  registrar(codigo: string, detalle: string): void;
};

const INTENTOS_DE_GUARDADO = 3;

export type Renovacion = "RENOVADA" | "PENDIENTE" | "DEFINITIVA";

/** Renueva UNA conexión. No lanza: lo que falle queda anotado y dice cómo quedó. */
export async function renovarConexion(p: PuertoRenovacion, id: string): Promise<Renovacion> {
  const fallo = async (motivo: string, definitiva: boolean): Promise<Renovacion> => {
    p.registrar(definitiva ? "RENOVACION_DEFINITIVA" : "NO_RENOVADA", `${id}: ${motivo}`);
    // Que no se pueda anotar no cambia lo que pasó; el aviso sale igual.
    await p.anotar(id, `No se pudo renovar el permiso: ${motivo}`, definitiva).catch((e) => p.registrar("ANOTAR", `${id}: ${e instanceof Error ? e.message : String(e)}`));
    if (definitiva) await p.avisar(id, motivo).catch((e) => p.registrar("AVISO_NO_SALIO", `${id}: ${e instanceof Error ? e.message : String(e)}`));
    return definitiva ? "DEFINITIVA" : "PENDIENTE";
  };
  try {
    const refresh = await p.leerRefresh(id);
    if (!refresh) return await fallo("no hay refresh token guardado; hay que volver a conectar", true);
    const r = await p.pedirTokens(refresh);
    if (!r.tokens) {
      // 400, 401 o 403: Mercado Pago ya no acepta ese refresh token (revocado, usado o vencido).
      // Cualquier otra cosa (sin respuesta, 5xx, 429, o un 200 a medias) puede pasar mañana.
      const rechazado = r.status === 400 || r.status === 401 || r.status === 403;
      return await fallo(`Mercado Pago respondió ${r.status} ${r.codigo ?? ""}`.trim() + (rechazado ? "; hay que volver a conectar" : ""), rechazado);
    }
    // Desde aquí el par viejo YA no sirve y el nuevo solo existe en esta variable.
    let error: string | null = null;
    for (let i = 0; i < INTENTOS_DE_GUARDADO; i++) {
      error = await p.guardar(id, r.tokens, r.publicKey).catch((e) => (e instanceof Error ? e.message : String(e)));
      if (error === null) return "RENOVADA";
    }
    return await fallo(`el permiso nuevo NO se pudo guardar (${error}); hay que volver a conectar`, true);
  } catch (e) {
    return await fallo(e instanceof Error ? e.message : String(e), false);
  }
}

/** La pasada del día: una por una; el fallo de una no detiene a las demás. */
export async function renovarConexiones(p: PuertoRenovacion, ids: string[]): Promise<{ revisadas: number; renovadas: number; pendientes: number; definitivas: number }> {
  const cuenta = { revisadas: ids.length, renovadas: 0, pendientes: 0, definitivas: 0 };
  for (const id of ids) {
    const r = await renovarConexion(p, id);
    if (r === "RENOVADA") cuenta.renovadas++; else if (r === "PENDIENTE") cuenta.pendientes++; else cuenta.definitivas++;
  }
  return cuenta;
}

/** El correo interno a VIM: una cuenta de Mercado Pago de la tienda ya no se puede renovar sola. Sin tokens ni datos de clientes. */
export function avisoDeRenovacionFallida(d: { negocio: string; cuenta: string; conexionId: string; motivo: string; vence: string | null }): { subject: string; html: string } {
  return {
    subject: soloAscii(`Mercado Pago de la tienda sin renovar: ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>El permiso de Mercado Pago de la tienda en línea de <strong>${esc(d.negocio)}</strong> no se pudo renovar y ya no se va a reintentar solo. La conexión quedó en error: <strong>su tienda dejó de ofrecer el pago en línea</strong> con esa cuenta (los pedidos al recibir siguen entrando).</p>
<ul><li>Cuenta: ${esc(d.cuenta)}</li><li>Conexión (tienda_conexiones.id): ${esc(d.conexionId)}</li>
<li>Motivo: ${esc(d.motivo)}</li><li>El permiso anterior vencía: ${esc(d.vence ?? "sin fecha")}</li></ul>
<p>El dueño tiene que volver a conectar Mercado Pago en Admin › Tienda en línea («Reconectar Mercado Pago»). Mientras no lo haga, las devoluciones pendientes de esa cuenta tampoco pueden salir.</p>
</div>`,
  };
}
