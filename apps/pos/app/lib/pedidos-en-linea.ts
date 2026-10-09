// Pedidos de la tienda en línea (canal TIENDA de delivery_pedidos): etiquetas, timbre, comandas, aceptación
// automática y la pausa de la tienda. Lógica pura salvo las cuatro llamadas a delivery-accion.
import { etiquetaApp, type AppTienda, type PedidoApp, type PedidoAppEstado } from "./pedidos-apps";
import { encabezadosFuncion, urlFuncion } from "./supabase";

export function etiquetaOrigen(p: PedidoApp): string {
  return etiquetaApp(p.app);
}

export function etiquetaPago(p: PedidoApp): string | null {
  if (!p.pago) return null;
  if (p.pago.forma === "TARJETA") return "Tarjeta";
  return p.pago.pagaCon == null ? "Efectivo" : `Efectivo, paga con $${p.pago.pagaCon.toFixed(2)}`;
}

export function etiquetaEntrega(p: PedidoApp): string {
  if (p.canal === "TIENDA") return p.app === "DELIVERY_PROPIO" ? "A domicilio" : "Para recoger";
  return p.tipoEntrega === "RECOGE_CLIENTE" ? "Recoge en tienda" : "Reparto de la app";
}

/** Timbre: suena al llegar un pedido nuevo por aceptar y se repite cada 20 s mientras quede alguno. */
export const TIMBRE_CADA_MS = 20_000;
export function debeSonar(d: { hayNuevoPorAceptar: boolean; hayPorAceptar: boolean; ultimoTimbre: number | null; ahora: number }): boolean {
  if (d.hayNuevoPorAceptar) return true;
  return d.hayPorAceptar && (d.ultimoTimbre === null || d.ahora - d.ultimoTimbre >= TIMBRE_CADA_MS);
}

/** Lo reclamó otra caja instalada: aquí ni timbra ni se puede aceptar. */
const deOtraCaja = (p: PedidoApp, cajaId: string): boolean => !!p.gestionCajaId && p.gestionCajaId !== cajaId;

/**
 * Hasta cuándo debe sonar el timbre en ESTE dispositivo: el vencimiento más lejano entre los pedidos
 * por aceptar que puede atender (los que no reclamó otra caja). null = nada que timbrar. Con esto el
 * timbre nunca dura más que la ventana de aceptación, aunque la copia local se quede en RECIBIDO
 * (caja sin internet: quien vence el pedido es la nube).
 */
export function timbrarHasta(pedidos: PedidoApp[], cajaId: string): number | null {
  const mios = pedidos.filter((p) => p.estado === "RECIBIDO" && !deOtraCaja(p, cajaId));
  return mios.length ? Math.max(...mios.map((p) => (p.venceAceptacion ? Date.parse(p.venceAceptacion) : Infinity))) : null;
}

/**
 * Dentro de la caja instalada, un pedido de la tienda de gestión NUBE se atiende desde el POS web
 * (su ticket vive en la nube y la nube no deja que una caja lo acepte): aquí solo se informa. Ni
 * timbra, ni cuenta por aceptar, ni ofrece Aceptar/Rechazar.
 */
export function soloInformativo(p: PedidoApp, enEscritorio: boolean): boolean {
  return enEscritorio && p.canal === "TIENDA" && p.gestion === "NUBE";
}

/** Lo que la caja le dejó dicho al cajero en un pedido cerrado; nunca un código interno. */
export function avisoDeTienda(p: PedidoApp): string | null {
  const cerrado = p.estado === "CANCELADO" || p.estado === "RECHAZADO" || p.estado === "EXPIRADO";
  return p.canal === "TIENDA" && cerrado && p.ultimoError && !/^[A-Z0-9_]+$/.test(p.ultimoError) ? p.ultimoError : null;
}

const CON_COMANDA = new Set(["ACEPTADO", "EN_PREPARACION", "LISTO"]);
/** Pedido de la tienda aceptado cuyo ticket no tiene comanda impresa, sea de la caja que sea. */
export function faltaComanda(p: PedidoApp): boolean {
  return p.canal === "TIENDA" && CON_COMANDA.has(p.estado) && !!p.ticketId && !p.comandaImpresa;
}
/** Qué pedidos de la tienda necesitan que ESTE dispositivo imprima sus comandas. */
export function comandasPendientes(pedidos: PedidoApp[], cajaDelTurnoId: string, yaIntentadas: ReadonlySet<string>): { pedidoId: string; ticketId: string }[] {
  return pedidos.flatMap((p) =>
    p.canal === "TIENDA" && CON_COMANDA.has(p.estado) && p.ticketId && p.ticketCajaId === cajaDelTurnoId && !p.comandaImpresa && !yaIntentadas.has(p.id)
      ? [{ pedidoId: p.id, ticketId: p.ticketId }]
      : [],
  );
}

/** POS web con aceptación automática: qué pedidos aceptar solos (en escritorio acepta el agente de la caja). */
export function aceptablesSolos(
  pedidos: PedidoApp[],
  d: { esEscritorio: boolean; aceptacion: "MANUAL" | "AUTO" | null; hayTurno: boolean },
  yaIntentados: ReadonlySet<string>,
): string[] {
  if (d.esEscritorio || d.aceptacion !== "AUTO" || !d.hayTurno) return [];
  return pedidos
    .filter((p) => p.canal === "TIENDA" && p.estado === "RECIBIDO" && p.gestion === "NUBE" && !yaIntentados.has(p.id))
    .map((p) => p.id);
}

// ── Cada pedido de la tienda en su canal (Pick-up / Domicilio) y el aviso grande ──

/** Quién mira: la caja del turno, si es la caja instalada, y la hora (ms). */
export type Atencion = { cajaId: string; enEscritorio: boolean; ahora: number };

/** Pedido de la tienda que espera respuesta. ERROR cuenta: se puede volver a intentar o rechazar. */
const esperaRespuesta = (p: PedidoApp): boolean => p.canal === "TIENDA" && (p.estado === "RECIBIDO" || p.estado === "ERROR");

/** Por qué este dispositivo no puede aceptar ni rechazar un pedido que espera respuesta; null = sí puede. */
export function porQueNoSeAtiende(p: PedidoApp, d: Atencion): string | null {
  if (soloInformativo(p, d.enEscritorio)) return "Se atiende desde el POS web.";
  if (deOtraCaja(p, d.cajaId)) return mensajeErrorEnLinea("RECLAMADO_POR_OTRA_CAJA");
  if (p.estado === "RECIBIDO" && p.venceAceptacion && Date.parse(p.venceAceptacion) <= d.ahora) return "Se venció sin aceptar.";
  return null;
}

/** Si ESTE dispositivo puede aceptarlo o rechazarlo ahora. Sin esto, el pedido se ve pero no ofrece botones. */
export function puedeAtender(p: PedidoApp, d: Atencion): boolean {
  return esperaRespuesta(p) && porQueNoSeAtiende(p, d) === null;
}

/**
 * Lo que se aceptó o rechazó en ESTE dispositivo se ve así desde ya. La caja instalada lee su copia
 * local, que tarda unos segundos en traer el cambio de la nube: sin esto el pedido seguiría
 * ofreciendo «Aceptar» y timbrando. En cuanto la base dice otra cosa, manda la base.
 */
export function conAtendidos(pedidos: PedidoApp[], hechos: ReadonlyMap<string, "aceptar" | "rechazar">): PedidoApp[] {
  return pedidos.map((p) => {
    const hecho = esperaRespuesta(p) ? hechos.get(p.id) : undefined;
    return hecho ? { ...p, estado: hecho === "aceptar" ? "ACEPTADO" as const : "RECHAZADO" as const } : p;
  });
}

/** La cuenta (ticket) de un pedido de la tienda ya aceptado y todavía vivo; null si no la tiene. */
export function cuentaDe(p: PedidoApp): string | null {
  return p.canal === "TIENDA" && CON_COMANDA.has(p.estado) ? p.ticketId : null;
}

/**
 * Lo que se cerró solo en un canal (se venció, o la caja lo canceló y dejó dicho por qué), para
 * decirlo ahí. `sabidoAqui` = lo que este dispositivo supo al intentar aceptar un pedido (la nube lo
 * canceló en ese momento): queda dicho igual, aunque la base no traiga la explicación.
 */
export function avisosDeCanal(pedidos: PedidoApp[], modo: AppTienda, sabidoAqui?: ReadonlyMap<string, string>): { id: string; texto: string }[] {
  return pedidos.flatMap((p) => {
    if (p.canal !== "TIENDA" || p.app !== modo) return [];
    const dicho = sabidoAqui?.get(p.id) ?? avisoDeTienda(p);
    if (dicho) return [{ id: p.id, texto: `${p.folioCorto ? `Pedido ${p.folioCorto}` : "Un pedido"}: ${dicho}` }];
    return p.estado === "EXPIRADO" ? [{ id: p.id, texto: `${p.folioCorto ? `El pedido ${p.folioCorto}` : "Un pedido"} se venció sin aceptar.` }] : [];
  });
}

const porLlegada = (a: PedidoApp, b: PedidoApp): number => a.recibidoAt.localeCompare(b.recibidoAt);

/** Lo que espera respuesta en un canal, del más antiguo al más nuevo. Incluye lo que aquí solo se puede ver. */
export function porAceptarDeCanal(pedidos: PedidoApp[], modo: AppTienda): PedidoApp[] {
  return pedidos.filter((p) => esperaRespuesta(p) && p.app === modo).sort(porLlegada);
}

/** Contadores del inicio: la tienda suma a su canal; «Pedidos en línea» cuenta solo lo que se atiende ahí (las apps). */
export function contarPorAceptar(pedidos: PedidoApp[], d: Atencion): { pickup: number; domicilio: number; apps: number } {
  const mios = pedidos.filter((p) => puedeAtender(p, d));
  return {
    pickup: mios.filter((p) => p.app === "DRIVE_THRU").length,
    domicilio: mios.filter((p) => p.app === "DELIVERY_PROPIO").length,
    apps: pedidos.filter((p) => p.canal === "APP" && (p.estado === "RECIBIDO" || p.estado === "ERROR")).length,
  };
}

/**
 * La fila del aviso grande: pedidos nuevos de la tienda que este dispositivo puede atender, del más
 * antiguo al más nuevo, sin los que el cajero ya cerró. Un pedido sale de la fila solo cuando deja
 * de estar por aceptar. Con aceptación automática en el POS web no entra: se acepta solo enseguida
 * (misma regla que `aceptablesSolos`).
 *
 * `viendo`: el pedido que el cajero abrió con «Ver orden» y sigue mirando en su canal. Mientras ese
 * pedido siga por aceptar, el resto de la fila espera: el siguiente aviso no le cae encima del
 * detalle que acaba de abrir. Quien pinta pasa null en cuanto el cajero sale de ese canal.
 */
export function colaDeAvisos(
  pedidos: PedidoApp[],
  d: Atencion & { aceptacion: "MANUAL" | "AUTO" | null; viendo?: string | null },
  cerrados: ReadonlySet<string>,
): PedidoApp[] {
  const visto = d.viendo ? pedidos.find((p) => p.id === d.viendo) : undefined;
  if (visto && visto.estado === "RECIBIDO" && puedeAtender(visto, d)) return [];
  const seAceptaSolo = (p: PedidoApp) => !d.enEscritorio && d.aceptacion === "AUTO" && p.gestion === "NUBE";
  return pedidos.filter((p) => p.estado === "RECIBIDO" && puedeAtender(p, d) && !seAceptaSolo(p) && !cerrados.has(p.id)).sort(porLlegada);
}

/**
 * Pedidos de la tienda que acaban de quedar aceptados: llegaron ya aceptados (aceptación automática)
 * o estaban por aceptar. `antes` = el estado de cada pedido en la lectura anterior; null en la primera.
 */
export function recienAceptados(antes: ReadonlyMap<string, PedidoAppEstado> | null, pedidos: PedidoApp[]): PedidoApp[] {
  if (!antes) return [];
  return pedidos.filter((p) => p.canal === "TIENDA" && p.estado === "ACEPTADO" && (antes.get(p.id) ?? "RECIBIDO") === "RECIBIDO");
}

/** «Pedido nuevo en Pick-up · T1234»: el aviso breve cuando un pedido entra a su canal. */
export function textoPedidoEnCanal(p: PedidoApp): string {
  return `Pedido nuevo en ${p.app === "DELIVERY_PROPIO" ? "Domicilio" : "Pick-up"}${p.folioCorto ? ` · ${p.folioCorto}` : ""}`;
}

/** Margen antes de avisar que falta la comanda: la automática sale en el siguiente sondeo (10 s) y
 *  el sello de la base llega un poco después del papel. Sin él, el aviso parpadearía en cada pedido. */
export const MARGEN_COMANDA_MS = 20_000;
/**
 * Los pedidos (ids) cuya comanda lleva más del margen sin salir. `desde` guarda cuándo se vio cada
 * uno sin comanda por primera vez y se pone al día aquí mismo, en cada lectura.
 */
export function sinComanda(desde: Map<string, number>, pedidos: PedidoApp[], ahora: number, enEscritorio: boolean): Set<string> {
  const faltan = new Set(pedidos.filter((p) => faltaComanda(p) && !soloInformativo(p, enEscritorio)).map((p) => p.id));
  for (const id of desde.keys()) if (!faltan.has(id)) desde.delete(id);
  for (const id of faltan) if (!desde.has(id)) desde.set(id, ahora);
  return new Set([...faltan].filter((id) => ahora - desde.get(id)! > MARGEN_COMANDA_MS));
}

// ── Estado y pausa de la tienda, vía delivery-accion ──

export type EstadoEnLinea = { participa: boolean; aceptacion: "MANUAL" | "AUTO"; pausaHasta: string | null; motivo: string | null };

/** Error de una llamada: el mensaje es el código, para pasarlo a mensajeErrorEnLinea. */
export class ErrorEnLinea extends Error {
  constructor(readonly codigo: string, readonly causa?: string) { super(codigo); }
}

type RespEstado = { participa?: boolean; aceptacion?: "MANUAL" | "AUTO"; pausa_hasta?: string | null; motivo?: string | null; error?: string; causa?: string };

async function llamar(token: string, cuerpo: Record<string, unknown>): Promise<{ status: number; j: RespEstado }> {
  try {
    const r = await fetch(urlFuncion("delivery-accion"), { method: "POST", headers: encabezadosFuncion(token), body: JSON.stringify(cuerpo) });
    return { status: r.status, j: (await r.json().catch(() => ({}))) as RespEstado };
  } catch {
    return { status: 0, j: { error: "SIN_RED" } };
  }
}

function comoEstado({ status, j }: { status: number; j: RespEstado }): EstadoEnLinea {
  if (status < 200 || status >= 300 || j.error) throw new ErrorEnLinea(j.error ?? `HTTP_${status}`, j.causa);
  // Una respuesta que no dice si la tienda participa no es "apagada": es una respuesta rota.
  if (typeof j.participa !== "boolean") throw new ErrorEnLinea("RESPUESTA_INVALIDA");
  return { participa: j.participa, aceptacion: j.aceptacion === "AUTO" ? "AUTO" : "MANUAL", pausaHasta: j.pausa_hasta ?? null, motivo: j.motivo ?? null };
}

/** null = esta sucursal no tiene tienda (o el negocio no tiene el módulo). */
export async function leerEstadoEnLinea(token: string, sucursalId: string): Promise<EstadoEnLinea | null> {
  const r = await llamar(token, { accion: "enlinea_estado", sucursal_id: sucursalId });
  if (r.j.error === "SUCURSAL_SIN_TIENDA" || r.j.error === "SIN_MODULO_TIENDA") return null;
  return comoEstado(r);
}
export async function pausarEnLinea(token: string, sucursalId: string, duracion: "30m" | "1h" | "indefinida"): Promise<EstadoEnLinea> {
  return comoEstado(await llamar(token, { accion: "enlinea_pausar", sucursal_id: sucursalId, duracion }));
}
export async function reanudarEnLinea(token: string, sucursalId: string): Promise<EstadoEnLinea> {
  return comoEstado(await llamar(token, { accion: "enlinea_reanudar", sucursal_id: sucursalId }));
}
/**
 * Avisa a la nube que hay un POS web con turno abierto. Con `cajaId` (la caja de ese turno) la nube
 * sella solo esa caja. Nunca lanza: es un latido, si falla se repite.
 * Devuelve true cuando la nube NO lo tomó porque en la sucursal hay una caja instalada encendida que
 * todavía no atiende la tienda (anterior a la 0.8.0): los pedidos se irían a ella y nadie los vería.
 */
export async function avisarPresente(token: string, sucursalId: string, cajaId?: string): Promise<boolean> {
  const { j } = await llamar(token, { accion: "enlinea_presente", sucursal_id: sucursalId, ...(cajaId ? { caja_id: cajaId } : {}) });
  return j.motivo === "CAJA_SIN_ACTUALIZAR";
}

/** "2:30 p. m." en hora de México. */
function horaMx(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Mexico_City", hour: "numeric", minute: "2-digit", hourCycle: "h12" }).formatToParts(d);
  const v = (t: string) => partes.find((x) => x.type === t)?.value ?? "";
  return `${v("hour")}:${v("minute")} ${v("dayPeriod").toUpperCase() === "AM" ? "a. m." : "p. m."}`;
}

/** `cajaSinActualizar`: lo que contestó el último `avisarPresente` de este POS web. */
export function etiquetaEstadoEnLinea(e: EstadoEnLinea, ahora: Date, cajaSinActualizar = false): { texto: string; tono: "ok" | "aviso" } {
  switch (e.motivo) {
    case null: return { texto: "Tienda: recibiendo pedidos", tono: "ok" };
    case "EN_PAUSA": {
      // Sin hora si es indefinida o si la hora ya pasó (el estado se leyó antes de que venciera):
      // prometer "hasta las 8:05" a las 9 es mentirle al cajero; la siguiente lectura lo corrige.
      const hasta = e.pausaHasta ? new Date(e.pausaHasta) : null;
      const h = !hasta || hasta.getUTCFullYear() >= 2999 || hasta.getTime() <= ahora.getTime() ? null : horaMx(e.pausaHasta!);
      return { texto: h ? `Tienda: en pausa hasta las ${h}` : "Tienda: en pausa", tono: "aviso" };
    }
    case "FUERA_DE_HORARIO": return { texto: "Tienda: fuera de horario", tono: "aviso" };
    case "CAJA_NO_LISTA": return {
      texto: cajaSinActualizar ? "Tienda: actualiza la caja de esta sucursal para recibir pedidos en línea." : "Tienda: sin turno abierto",
      tono: "aviso",
    };
    default: return { texto: "Tienda: apagada", tono: "aviso" };
  }
}

export function mensajeErrorEnLinea(codigo: string, _causa?: string): string {
  switch (codigo) {
    case "SIN_TURNO_ABIERTO": return "Abre un turno para aceptar pedidos.";
    case "PEDIDO_CANCELADO": return "Este pedido ya no coincide con tu menú o tus zonas de envío. Se canceló y tu cliente ya lo sabe.";
    case "ACCION_INVALIDA": return "Este pedido ya fue atendido.";
    case "RECLAMADO_POR_OTRA_CAJA": return "Otra caja ya tomó este pedido.";
    case "SIN_RED": case "FUNCION_REQUIERE_NUBE": return "Sin internet no se pueden atender pedidos en línea.";
    default: return "No se pudo completar. Inténtalo de nuevo.";
  }
}
