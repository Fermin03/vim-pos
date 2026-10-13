// La renovación de los permisos de Mercado Pago de la TIENDA (tienda_conexiones, 0173). Mismo patrón
// que la de la terminal (`terminal-mp-renovar`), con las credenciales de la aplicación de la tienda.
//
// El access token dura 180 días; con el refresh token se saca otro par sin molestar al dueño. Cada
// renovación CAMBIA también el refresh token y el viejo deja de servir. Por eso:
//   · antes de pedirle nada a Mercado Pago la conexión se TOMA (tienda_conexion_tomar_renovacion):
//     dos pasadas a la vez no renuevan la misma, que dejaría a una guardando un par muerto;
//   · el par nuevo se guarda entero, en una transacción (tienda_guardar_tokens: los dos o ninguno),
//     y la renovación solo cuenta como hecha cuando ese guardado contestó bien;
//   · una respuesta a medias de Mercado Pago no es un par: no se guarda nada y el par viejo sigue ahí;
//   · si el guardado falla se reintenta en el momento con el par que ya se tiene en la mano (es la
//     única copia): solo si no entra, la conexión se da por perdida.
// Qué contesta `/oauth/token` cuando falla está en
// docs/integraciones/mercado-pago-point/referencia-api/POST-oauth-_oauth_token.md: siempre 400, con
// el motivo en `error`. Los finales de cada conexión:
//   RENOVADA    par nuevo guardado (y la public key, si vino);
//   PENDIENTE   no se renovó y NO se toca: su token actual sigue cobrando hasta que venza y mañana
//               se reintenta. Sin respuesta, 5xx o 429, en silencio; cualquier otro rechazo que no
//               sea de los dos de abajo (`invalid_request`, `forbidden`, uno nuevo), con aviso a VIM;
//   DEFINITIVA  no tiene arreglo sin el dueño: Mercado Pago dijo `invalid_grant` (ese refresh token
//               es inválido, venció o se revocó), no hay refresh token guardado, o el par nuevo no
//               se pudo guardar. La conexión queda en ERROR —solo si sigue como se leyó: si otra
//               pasada la renovó entre tanto, está sana y no se toca— y se avisa a VIM, una vez;
//   NUESTRO     `invalid_client`: el client id o el secret de NUESTRA aplicación está mal o se rotó.
//               No es culpa de ninguna conexión: no se toca ninguna, la pasada se detiene (todas
//               fallarían igual) y se avisa a VIM una vez;
//   SALTADA     otra pasada la tiene tomada, o ya no está activa.
// Sin SQL ni red propios: recibe un puerto. Se prueba con `node --test`.
import { esc, soloAscii } from "../correo.ts";
import type { Tokens } from "../terminal/mercado-pago-conexion.ts";

export type RespuestaDeTokens = { tokens: Tokens; publicKey: string | null } | { tokens: null; status: number; codigo: string | null };

export type PuertoRenovacion = {
  /** Toma la conexión para esta pasada. Devuelve el `vence_at` que vio, o null si no se pudo tomar. */
  tomar(conexionId: string): Promise<string | null>;
  /** El refresh token guardado en Vault; null = no hay. Lanza si la base no contesta. */
  leerRefresh(conexionId: string): Promise<string | null>;
  pedirTokens(refreshToken: string): Promise<RespuestaDeTokens>;
  /** Guarda el par (y la public key si viene) en una transacción. Devuelve el error, o null si entró. */
  guardar(conexionId: string, t: Tokens, publicKey: string | null): Promise<string | null>;
  /**
   * Suelta la toma y deja dicho por qué no se renovó. Con `definitiva` la pone en ERROR, pero solo
   * si su `vence_at` sigue siendo `vence`. Devuelve true si quedó en ERROR.
   */
  fallida(conexionId: string, vence: string, motivo: string, definitiva: boolean): Promise<boolean>;
  /** Aviso a VIM sobre UNA conexión: quedó en error, o Mercado Pago la rechaza por algo que no se conoce. */
  avisar(conexionId: string, motivo: string, definitiva: boolean): Promise<void>;
  /** Aviso a VIM de que las credenciales de NUESTRA aplicación no sirven. */
  avisarNuestro(motivo: string): Promise<void>;
  registrar(codigo: string, detalle: string): void;
};

const INTENTOS_DE_GUARDADO = 3;
const texto = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export type Renovacion = "RENOVADA" | "PENDIENTE" | "DEFINITIVA" | "NUESTRO" | "SALTADA";

/** Renueva UNA conexión. No lanza: lo que falle queda anotado y dice cómo quedó. */
export async function renovarConexion(p: PuertoRenovacion, id: string): Promise<Renovacion> {
  let vence: string | null;
  try {
    vence = await p.tomar(id);
  } catch (e) {
    p.registrar("NO_RENOVADA", `${id}: ${texto(e)}`);
    return "PENDIENTE";
  }
  if (!vence) return "SALTADA";
  const leido = vence;

  const fallo = async (motivo: string, que: "pasajero" | "avisar" | "definitiva"): Promise<Renovacion> => {
    const definitiva = que === "definitiva";
    p.registrar(definitiva ? "RENOVACION_DEFINITIVA" : "NO_RENOVADA", `${id}: ${motivo}`);
    // Que no se pueda anotar no cambia lo que pasó con Mercado Pago. Pero sin saber si quedó en
    // ERROR, de una definitiva se avisa igual: es peor callar.
    const enError = await p.fallida(id, leido, `No se pudo renovar el permiso: ${motivo}`, definitiva)
      .catch((e) => { p.registrar("ANOTAR", `${id}: ${texto(e)}`); return definitiva; });
    // Definitiva pero no quedó en ERROR: otra pasada la renovó entre tanto. Está sana: ni aviso.
    if (definitiva && !enError) return "PENDIENTE";
    if (que !== "pasajero") await p.avisar(id, motivo, definitiva).catch((e) => p.registrar("AVISO_NO_SALIO", `${id}: ${texto(e)}`));
    return definitiva ? "DEFINITIVA" : "PENDIENTE";
  };

  try {
    const refresh = await p.leerRefresh(id);
    if (!refresh) return await fallo("no hay refresh token guardado; hay que volver a conectar", "definitiva");
    const r = await p.pedirTokens(refresh);
    if (!r.tokens) {
      const dicho = `Mercado Pago respondió ${r.status} ${r.codigo ?? ""}`.trim();
      // Las credenciales de NUESTRA aplicación: ninguna conexión tiene la culpa ni se toca. (La
      // toma se suelta sola a los 5 minutos.)
      if (r.codigo === "invalid_client") { p.registrar("CREDENCIALES_DE_LA_APLICACION", dicho); return "NUESTRO"; }
      if (r.codigo === "invalid_grant") return await fallo(`${dicho}; hay que volver a conectar`, "definitiva");
      // Sin respuesta, caída o «más despacio» (o un 200 a medias): pasa solo. Lo demás es un
      // rechazo que no conocemos: no se toca la conexión, pero alguien de VIM tiene que mirarlo.
      const pasajero = r.status === 0 || r.status === 200 || r.status === 429 || r.status >= 500;
      return await fallo(dicho, pasajero ? "pasajero" : "avisar");
    }
    // Desde aquí el par viejo YA no sirve y el nuevo solo existe en esta variable.
    let error: string | null = null;
    for (let i = 0; i < INTENTOS_DE_GUARDADO; i++) {
      error = await p.guardar(id, r.tokens, r.publicKey).catch((e) => texto(e));
      if (error === null) return "RENOVADA";
    }
    return await fallo(`el permiso nuevo NO se pudo guardar (${error}); hay que volver a conectar`, "definitiva");
  } catch (e) {
    return await fallo(texto(e), "pasajero");
  }
}

type Cuenta = { revisadas: number; renovadas: number; pendientes: number; definitivas: number; saltadas: number; credenciales: boolean };

/**
 * La pasada del día: una por una; el fallo de una no detiene a las demás. Salvo `invalid_client`:
 * con las credenciales de la aplicación mal, todas fallarían igual, así que se avisa una vez y se para.
 */
export async function renovarConexiones(p: PuertoRenovacion, ids: string[]): Promise<Cuenta> {
  const cuenta: Cuenta = { revisadas: 0, renovadas: 0, pendientes: 0, definitivas: 0, saltadas: 0, credenciales: false };
  for (const id of ids) {
    cuenta.revisadas++;
    const r = await renovarConexion(p, id);
    if (r === "NUESTRO") {
      cuenta.credenciales = true;
      await p.avisarNuestro("Mercado Pago respondió invalid_client al renovar un permiso de la tienda").catch((e) => p.registrar("AVISO_NO_SALIO", texto(e)));
      break;
    }
    if (r === "RENOVADA") cuenta.renovadas++; else if (r === "PENDIENTE") cuenta.pendientes++; else if (r === "DEFINITIVA") cuenta.definitivas++; else cuenta.saltadas++;
  }
  return cuenta;
}

/** El correo interno a VIM cuando las credenciales de la aplicación de la tienda no sirven. No nombra a ningún restaurante: no es de ninguno. */
export function avisoDeCredencialesDeLaAplicacion(motivo: string): { subject: string; html: string } {
  return {
    subject: soloAscii("Mercado Pago de la tienda: las credenciales de la aplicacion no sirven"),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p><strong>${esc(motivo)}.</strong> El client id o el client secret de la aplicación «VIM POS Tienda» está mal o se rotó.</p>
<p>No se tocó ninguna conexión: los restaurantes siguen cobrando con el permiso que tienen. Pero ninguno se va a poder renovar (ni conectar) hasta corregir <code>MP_TIENDA_CLIENT_ID</code> y <code>MP_TIENDA_CLIENT_SECRET</code> en los secretos de las funciones. La renovación lo vuelve a intentar mañana.</p>
</div>`,
  };
}

/**
 * El correo interno a VIM sobre UNA conexión. `definitiva`: quedó en error y la tienda dejó de
 * ofrecer el pago con ella. Si no, Mercado Pago rechazó la renovación por algo que no se conoce: la
 * conexión sigue cobrando y se reintenta, pero alguien tiene que mirarlo. Sin tokens ni datos de clientes.
 */
export function avisoDeRenovacionFallida(d: { negocio: string; cuenta: string; conexionId: string; motivo: string; vence: string | null; definitiva: boolean }): { subject: string; html: string } {
  const datos = `<ul><li>Cuenta: ${esc(d.cuenta)}</li><li>Conexión (tienda_conexiones.id): ${esc(d.conexionId)}</li>
<li>Motivo: ${esc(d.motivo)}</li><li>El permiso actual vence: ${esc(d.vence ?? "sin fecha")}</li></ul>`;
  return d.definitiva ? {
    subject: soloAscii(`Mercado Pago de la tienda sin renovar: ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>El permiso de Mercado Pago de la tienda en línea de <strong>${esc(d.negocio)}</strong> no se pudo renovar y ya no se va a reintentar solo. La conexión quedó en error: <strong>su tienda dejó de ofrecer el pago en línea</strong> con esa cuenta (los pedidos al recibir siguen entrando).</p>
${datos}
<p>El dueño tiene que volver a conectar Mercado Pago en Admin › Tienda en línea («Reconectar Mercado Pago»). Mientras no lo haga, las devoluciones pendientes de esa cuenta tampoco pueden salir.</p>
</div>`,
  } : {
    subject: soloAscii(`Mercado Pago de la tienda: revisar la renovacion de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>Mercado Pago rechazó la renovación del permiso de la tienda en línea de <strong>${esc(d.negocio)}</strong> con una respuesta que no se esperaba. <strong>No se tocó la conexión: sigue cobrando</strong> con el permiso que tiene hasta que venza, y mañana se vuelve a intentar.</p>
${datos}
<p>Si se repite, hay que revisarlo antes de esa fecha: después, la cuenta dejará de poder cobrar y de devolver.</p>
</div>`,
  };
}
