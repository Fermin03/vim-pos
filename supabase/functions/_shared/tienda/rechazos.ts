// Contra la prueba masiva de tarjetas robadas: quien tiene una lista de tarjetas las prueba una por
// una contra una tienda y lee, en la respuesta, cuáles sirven y por qué fallan las demás.
// Tres frenos, los tres con los contadores de siempre (limites_cupo, 0136), que cuentan aunque el
// pedido rechazado se borre:
//   · tras 3 rechazos de una IP en una hora, el motivo que se le dice es siempre OTRO: deja de
//     servirle para saber si falló el código, la fecha o el saldo;
//   · tras 5, esa IP no puede intentar pagar en línea esa hora (los pedidos al recibir, sí);
//   · si en un negocio se juntan 20 rechazos de TARJETAS DE VERDAD en una hora, repartidos en al
//     menos 8 IP distintas, su pago en línea se pausa una hora (tienda_pago_pausar, 0173) y se avisa
//     a VIM. Los pedidos al recibir siguen.
// La pausa del negocio no la puede provocar un solo atacante con pocas peticiones: una IP aporta a
// lo sumo 5 rechazos por hora (después queda fuera) y hacen falta 8 distintas; y lo que no es una
// tarjeta —un token inventado o usado, una petición que Mercado Pago no aceptó— no cuenta para el
// negocio (`soloIp`): solo para la IP que lo mandó.
//
// Y UN FRENO MÁS, QUE NO ES CONTRA QUIEN PRUEBA TARJETAS (0178): tras un rechazo por RIESGO
// (`high_risk`: el antifraude de Mercado Pago, no el banco) ESE cliente no puede repetir el cobro en
// línea en ESE negocio durante 30 minutos. Repetirlo enseguida con los mismos datos empeora la
// puntuación del restaurante en el antifraude (lo dijo el soporte de Mercado Pago). «Ese cliente» es
// su teléfono Y su IP A LA VEZ, en ese negocio: una sola clave con los dos. No es una defensa contra
// el abuso (esa son los topes de arriba): con la IP sola frenaría a todos los que comparten red (el
// wifi del local, un operador móvil), y con el teléfono solo cualquiera frenaría a otro escribiendo
// su número. Sin IP conocida no hay freno. Solo el pago en línea: puede seguir pidiendo para pagar
// al recibir. Un intento durante el freno se contesta sin llamar a Mercado Pago y NO cuenta como
// rechazo: no suma a ningún tope de arriba.
// La clave es un HMAC con una llave que deriva de VIM_TIENDA_SECRET (`claveDeFreno`): la base la
// recibe ya calculada y de ella no se saca ni el teléfono ni la IP.
//
// EN MODO DE PRUEBA (0178) los tres topes de arriba no cuentan: ahí se rechazan tarjetas a propósito,
// una y otra vez, y no hay nada que proteger (no es dinero ni son tarjetas de verdad). El freno por
// riesgo sí aplica: es el mismo código que en producción.
// Puro salvo por el cliente que se le pasa: se prueba con `node --test`.
import { esc, soloAscii } from "../correo.ts";
import { type ClienteRpc, consumirCupo } from "../limite.ts";
import { cuentaComoRechazo, type MotivoDeRechazo } from "./pago-mp.ts";
import { claveDeIp } from "./respuesta.ts";

export const RECHAZOS = {
  ventanaSeg: 3600,
  /** Rechazos de una IP con su motivo; del siguiente en adelante, OTRO. */
  ipConDetalle: 3,
  /** Con estos rechazos, la IP ya no intenta pagar en línea en esa hora. */
  ipBloqueo: 5,
  /**
   * Para pausar el pago en línea del negocio hacen falta LAS DOS: estos rechazos de tarjetas reales
   * en la hora… Un restaurante con mucho movimiento ve 3 o 4 por hora (uno de cada diez cobros).
   */
  negocioPausa: 20,
  /** …y que vengan de al menos estas IP distintas (IPv6: por su /64). */
  negocioIps: 8,
} as const;

const claves = (ip: string, negocio: string) => ({
  ip: `tienda:pago-rechazo:ip:${claveDeIp(ip)}`,
  negocio: `tienda:pago-rechazo:negocio:${negocio}`,
  /** ¿Esta IP ya contó en este negocio en esta hora? */
  ipEnNegocio: `tienda:pago-rechazo:negocio-ip:${negocio}:${claveDeIp(ip)}`,
  /** Cuántas IP distintas llevan algún rechazo en este negocio en esta hora. */
  ipsDeNegocio: `tienda:pago-rechazo:negocio-ips:${negocio}`,
});

const agotado = async (db: ClienteRpc, clave: string, max: number): Promise<boolean> => {
  const { data, error } = await db.rpc("cupo_agotado", { p_clave: clave, p_ventana: `${RECHAZOS.ventanaSeg} seconds`, p_max: max });
  if (error) throw new Error(error.message);
  return data === true;
};

/**
 * ¿Esa IP ya juntó sus rechazos de la hora y no puede intentar otro pago en línea? No suma nada
 * (`cupo_agotado`). Si el control no responde, deja pasar: los cupos de `pedir` ya cierran solos.
 */
export async function ipSinPagoEnLinea(db: ClienteRpc, ip: string, negocio: string): Promise<boolean> {
  try {
    return await agotado(db, claves(ip, negocio).ip, RECHAZOS.ipBloqueo);
  } catch (e) {
    console.error("[tienda] cupo_agotado falló; se deja pasar:", e instanceof Error ? e.message : String(e));
    return false;
  }
}

/**
 * Anota un cobro que no pasó. Devuelve el motivo que se le puede decir a ESE cliente y si el negocio
 * acaba de llegar a su tope (hay que pausar su pago en línea).
 * `soloIp`: no fue una tarjeta rechazada (token inventado o usado): cuenta para la IP y nada más.
 * Si un contador no responde, el motivo es OTRO (no se regala información) y no se pausa nada
 * (una caída de la base no le apaga el pago en línea a nadie).
 */
export async function anotarRechazo(db: ClienteRpc, ip: string, negocio: string, motivo: MotivoDeRechazo, soloIp = false): Promise<{ detalle: MotivoDeRechazo; pausar: boolean }> {
  const k = claves(ip, negocio), v = RECHAZOS.ventanaSeg;
  const porIp = await consumirCupo(db, { clave: k.ip, ventanaSeg: v, max: RECHAZOS.ipConDetalle }, "cerrar");
  const detalle = porIp.permitido ? motivo : "OTRO";
  if (soloIp) return { detalle, pausar: false };
  // La primera vez que ESTA IP falla en ESTE negocio en la hora, suma una a las IP distintas.
  const primera = await consumirCupo(db, { clave: k.ipEnNegocio, ventanaSeg: v, max: 1 }, "cerrar");
  if (primera.motivo === "OK") await consumirCupo(db, { clave: k.ipsDeNegocio, ventanaSeg: v, max: 1_000_000 }, "abrir");
  // `max` es cuántos caben: con negocioPausa - 1, el que hace negocioPausa ya no cabe.
  const total = await consumirCupo(db, { clave: k.negocio, ventanaSeg: v, max: RECHAZOS.negocioPausa - 1 }, "abrir");
  if (total.motivo !== "AGOTADO") return { detalle, pausar: false };
  return { detalle, pausar: await agotado(db, k.ipsDeNegocio, RECHAZOS.negocioIps).catch(() => false) };
}

/** Cuánto dura el freno tras un rechazo por riesgo. La base acota lo que reciba (1 minuto a 1 día). */
export const FRENO_POR_RIESGO_MIN = 30;

const ETIQUETA_DE_FRENO = "vim-pos:tienda:freno-por-riesgo:v1";
const hmac = async (llave: BufferSource, texto: string): Promise<ArrayBuffer> => {
  const k = await crypto.subtle.importKey("raw", llave, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(texto));
};

/**
 * La clave del freno de ESE cliente en ESE negocio: HMAC-SHA256 de negocio + teléfono + IP (IPv6: su
 * /64, como los demás topes) con una llave que deriva de `VIM_TIENDA_SECRET` (igual que enlace.ts) y
 * que la base no tiene. 43 caracteres en base64url. Es lo ÚNICO del freno que llega a la base.
 * null = no hay a quién frenar: sin secreto, sin un teléfono de 10 dígitos o sin IP conocida
 * («desconocida» la comparten todos los que caen ahí: no identifica a nadie).
 */
export async function claveDeFreno(secreto: string, tenantId: string, telefono: string | null, ip: string): Promise<string | null> {
  const quien = claveDeIp(ip);
  if (!secreto || !tenantId || !telefono || !/^\d{10}$/.test(telefono) || quien === "desconocida") return null;
  const firma = await hmac(await hmac(new TextEncoder().encode(secreto), ETIQUETA_DE_FRENO), `${tenantId.toLowerCase()}:${telefono}:${quien}`);
  let b = "";
  for (const o of new Uint8Array(firma)) b += String.fromCharCode(o);
  return btoa(b).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

/** Una hora de la base → ISO en UTC (`…Z`), o null si no es una fecha. Es lo que viaja a la tienda. */
const hastaDe = (v: unknown): string | null => {
  const t = typeof v === "string" ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

/**
 * ¿El cliente de esa clave tiene frenado el pago en línea (`tienda_pago_frenado`, 0178)? Hasta
 * cuándo, o null. No suma nada. Sin clave no hay freno. Si el control no responde, deja pasar: no se
 * le niega el pago a nadie por una caída de la base (como `ipSinPagoEnLinea`).
 */
export async function pagoFrenado(db: ClienteRpc, clave: string | null): Promise<string | null> {
  if (!clave) return null;
  try {
    const { data, error } = await db.rpc("tienda_pago_frenado", { p_clave: clave });
    if (error) throw new Error(error.message);
    return hastaDe(data);
  } catch (e) {
    console.error("[tienda] tienda_pago_frenado falló; se deja pasar:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

/**
 * Pone el freno tras un rechazo por riesgo (`tienda_pago_frenar`, 0178) y dice hasta cuándo. Sin
 * clave, o si no se pudo poner, null: el rechazo se contesta igual.
 */
export async function frenarPago(db: ClienteRpc, clave: string | null): Promise<string | null> {
  if (!clave) return null;
  try {
    const { data, error } = await db.rpc("tienda_pago_frenar", { p_clave: clave, p_minutos: FRENO_POR_RIESGO_MIN });
    if (error) throw new Error(error.message);
    return hastaDe(data);
  } catch (e) {
    console.error("[tienda] tienda_pago_frenar falló; el rechazo sigue sin freno:", e instanceof Error ? e.message : String(e));
    return null;
  }
}

export type RespuestaDeRechazo = {
  /** Lo que se le contesta al cliente (409). `hasta`: solo con RIESGO, hasta cuándo queda frenado su pago en línea. */
  cuerpo: { error: "PAGO_RECHAZADO"; detalle: MotivoDeRechazo; hasta?: string };
  /** El negocio acaba de llegar a su tope de tarjetas rechazadas: hay que pausar su pago en línea y avisar a VIM. */
  pausar: boolean;
};

/**
 * Un cobro que no pasó, ya con su motivo: qué se le contesta al cliente, y si hay que pausar al negocio.
 *   · RIESGO pone el freno de ese cliente (su clave: teléfono E IP) SIEMPRE que haya clave: también
 *     en modo de prueba, y aunque después el motivo se le diga como OTRO; `hasta` viaja solo si el
 *     motivo que se dice es RIESGO;
 *   · lo que no cuenta como tarjeta rechazada (`cuentaComoRechazo`: un reto del banco que se dejó) y
 *     todo rechazo en MODO DE PRUEBA se contestan con su motivo y no tocan ningún contador: ni el de
 *     la IP, ni el del negocio; nunca piden pausar;
 *   · lo demás se cuenta (`anotarRechazo`): por IP decide qué motivo se dice; por negocio, si se pausa.
 */
export async function respuestaDeRechazo(db: ClienteRpc, d: {
  slug: string; ip: string; motivo: MotivoDeRechazo;
  /** La clave de freno de ese cliente (`claveDeFreno`, o la que el pago guardó al nacer); null = no se frena a nadie. */
  frenoClave: string | null;
  dePrueba: boolean;
}): Promise<RespuestaDeRechazo> {
  const hasta = d.motivo === "RIESGO" ? await frenarPago(db, d.frenoClave) : null;
  const como = cuentaComoRechazo(d.motivo);
  const r = como.cuenta && !d.dePrueba ? await anotarRechazo(db, d.ip, d.slug, d.motivo, como.soloIp) : { detalle: d.motivo, pausar: false };
  return { cuerpo: { error: "PAGO_RECHAZADO", detalle: r.detalle, ...(r.detalle === "RIESGO" && hasta && { hasta }) }, pausar: r.pausar };
}

/** El correo interno a VIM cuando el pago en línea de un negocio (o de una sucursal) queda en pausa. Sin datos de clientes ni de tarjetas. */
export function avisoDePagoPausado(d: { negocio: string; slug: string; sucursal?: string | null; por: "RECHAZOS" | "SIN_PERMISO" }): { subject: string; html: string } {
  const donde = d.sucursal ? `la sucursal ${d.sucursal} de ${d.negocio}` : d.negocio;
  const porque = d.por === "RECHAZOS"
    ? `En su tienda se juntaron ${RECHAZOS.negocioPausa} cobros con tarjeta rechazados en una hora, desde al menos ${RECHAZOS.negocioIps} redes distintas. Puede ser alguien probando tarjetas robadas.`
    : "Mercado Pago rechazó las credenciales de su cuenta al cobrar (401). Lo más probable es que el restaurante revocó el permiso o que el token venció: tiene que volver a conectar Mercado Pago en Tienda en línea.";
  return {
    subject: soloAscii(`Pago en linea en pausa: ${d.slug}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>El pago en línea de <strong>${esc(donde)}</strong> quedó en pausa una hora: la tienda no lo ofrece y los pedidos al recibir siguen entrando.</p>
<p>${porque}</p>
<p>La pausa se levanta sola. Si se repite, llegará otro correo como este.</p>
</div>`,
  };
}
