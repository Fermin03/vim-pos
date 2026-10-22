// El sitio de reservas (belleza, entrega 3) sin pintar nada: qué servicios ofrece cada sucursal, la
// cadena que viaja a `huecos` y `reservar`, la tira de días, las fechas en la hora de México, los
// datos de la clienta, qué se puede hacer con una cita y el recorrido de reservar → pagar el anticipo.
// Puro: las pantallas están en components/reservas/.
//
// TEXTOS PROVISIONALES: los revisa James.
import { aFechaMx, sumarDias } from "@vim/fecha";
import type { CuerpoReserva, Resultado, ServicioDeCadena } from "./api";
import { CORREO } from "./cliente";
import type { Cita, ColaboradorDeReservas, Huecos, Reserva, Reservas, ServicioReservable, SucursalDeReservas } from "./contrato";
import { aCentavos, aTexto } from "./dinero";
import { claveNueva } from "./envio";
import { hora12, momentoMx } from "./horario";
import type { TarjetaDePedido } from "./tarjeta";
import { textoDeRechazo } from "./tarjeta";
import { normalizarTelefono } from "./telefono";
import { textoDeError } from "./textos";
import { aPartirDe, finDeLaPausa } from "./pausa";
import { retoQueSigue, type PasoDelReto, type Reto } from "./verificacion";

// ── Catálogo ─────────────────────────────────────────────────────────────────────────────────────
/** Lo que se ofrece en una sucursal: los servicios que hace alguno de sus colaboradores. */
export function serviciosDeSucursal(r: Pick<Reservas, "servicios" | "colaboradores">, sucursalId: string): ServicioReservable[] {
  const hechos = new Set(r.colaboradores.filter((c) => c.sucursal_id === sucursalId).flatMap((c) => c.servicios));
  return r.servicios.filter((s) => hechos.has(s.producto_id));
}

export const SIN_CATEGORIA = "Otros servicios";
/** Las pestañas después de «Todos», en el orden en que llegan los servicios. */
export const categoriasDe = (servicios: ServicioReservable[]): string[] => [...new Set(servicios.map((s) => s.categoria ?? SIN_CATEGORIA))];

/** Quiénes hacen ese servicio en esa sucursal (para «¿Con quién?»). */
export const quienesHacen = (r: Pick<Reservas, "colaboradores">, sucursalId: string, productoId: string): ColaboradorDeReservas[] =>
  r.colaboradores.filter((c) => c.sucursal_id === sucursalId && c.servicios.includes(productoId));

/** «40 min», «1 h», «1 h 30 min». */
export function duracionLegible(min: number): string {
  const h = Math.floor(min / 60), m = min % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * Lo que suma la cadena elegida: precio, duración y anticipo en línea (el de cada servicio ya viene
 * con la regla del negocio; el que cobra lo calcula la base). Dinero en centavos, de vuelta a texto.
 */
export function resumenDe(servicios: ServicioReservable[], cadena: ServicioDeCadena[]): { total: string; duracion: number; anticipo: string } {
  let total = 0, anticipo = 0, duracion = 0;
  for (const e of cadena) {
    const s = servicios.find((x) => x.producto_id === e.producto_id);
    if (!s) continue;
    total += aCentavos(s.precio) ?? 0;
    anticipo += aCentavos(s.anticipo_mxn) ?? 0;
    duracion += s.duracion_min;
  }
  return { total: aTexto(total), duracion, anticipo: aTexto(anticipo) };
}

/**
 * Cómo se cobra en línea al reservar, para el resumen. null = nada en línea. Con `TODO` (o un anticipo
 * que ya es el total) no queda resto que pagar en el negocio.
 */
export function cobroEnLinea(cobroModo: Reservas["reglas"]["cobro_modo"], anticipo: string, total: string): { etiqueta: string; resto: boolean } | null {
  const a = aCentavos(anticipo) ?? 0;
  if (a <= 0) return null;
  const todo = cobroModo === "TODO" || a >= (aCentavos(total) ?? 0);
  return { etiqueta: todo ? "Pago en línea" : "Anticipo en línea", resto: !todo };
}
/** Hay que cobrar en línea y esta sucursal no puede (sin Mercado Pago): aquí no se puede reservar. */
export const sinCobroDe = (sucursal: Pick<SucursalDeReservas, "pago_en_linea" | "public_key">, anticipo: string): boolean =>
  (aCentavos(anticipo) ?? 0) > 0 && (!sucursal.pago_en_linea || !sucursal.public_key);
export const SIN_COBRO = "Por ahora no podemos cobrar el anticipo en línea. Comunícate con el negocio para agendar.";

/** La base acepta de 1 a 5 servicios por cita. */
export const MAX_SERVICIOS = 5;

// ── Fechas (siempre en la hora de México) ────────────────────────────────────────────────────────
const SEMANA = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const SEMANA_LARGA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
/** Un día `YYYY-MM-DD` es de calendario: se lee en UTC para que ninguna zona lo mueva. */
const partes = (dia: string) => {
  const d = new Date(`${dia}T12:00:00Z`);
  return { semana: d.getUTCDay(), numero: d.getUTCDate(), mes: d.getUTCMonth() };
};

/** Para la tira: «lun», «20», «oct». */
export function etiquetaDeDia(dia: string): { semana: string; numero: string; mes: string } {
  const p = partes(dia);
  return { semana: SEMANA[p.semana]!, numero: String(p.numero), mes: MESES[p.mes]!.slice(0, 3) };
}

/** «martes 20 de octubre»; con `hoy`, «hoy, martes 20 de octubre» o «mañana, …». */
export function fechaLarga(dia: string, hoy?: string): string {
  const p = partes(dia);
  const texto = `${SEMANA_LARGA[p.semana]} ${p.numero} de ${MESES[p.mes]}`;
  if (hoy && dia === hoy) return `hoy, ${texto}`;
  if (hoy && dia === sumarDias(hoy, 1)) return `mañana, ${texto}`;
  return texto;
}

/** «octubre 2026» sobre la tira, del primer día visible. */
export const mesDe = (dia: string): string => `${MESES[partes(dia).mes]} ${dia.slice(0, 4)}`;

/** Un instante (ISO) → la hora en México, «10:30 a. m.». */
export const horaDe = (iso: string): string => hora12(momentoMx(new Date(iso)).hora);
/** Un instante (ISO) → el día en México, `YYYY-MM-DD`. */
export const diaDe = (iso: string): string => aFechaMx(new Date(iso));

/** Cuántos días se ven a la vez en la tira. */
export const DIAS_EN_TIRA = 14;

/**
 * La tira de días que empieza `desde` días después de hoy (0, 14, 28…), sin pasar del último día
 * en que se puede reservar (hoy + `diasReserva`). `anterior`/`siguiente`: el `desde` de las flechas,
 * o null si no hay a dónde ir.
 */
export function tiraDeDias(hoy: string, desde: number, diasReserva: number): { dias: string[]; anterior: number | null; siguiente: number | null } {
  const inicio = Math.max(0, Math.min(desde, diasReserva));
  const fin = Math.min(inicio + DIAS_EN_TIRA - 1, diasReserva);
  const dias: string[] = [];
  for (let n = inicio; n <= fin; n++) dias.push(sumarDias(hoy, n));
  return { dias, anterior: inicio > 0 ? Math.max(0, inicio - DIAS_EN_TIRA) : null, siguiente: fin < diasReserva ? fin + 1 : null };
}

/** En qué `desde` de la tira cae un día (para saltar a él). */
export function desdeDe(hoy: string, dia: string): number {
  const n = Math.round((Date.parse(`${dia}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
  return Math.floor(Math.max(0, n) / DIAS_EN_TIRA) * DIAS_EN_TIRA;
}

/**
 * El primer día con lugar DESPUÉS de `dia`, preguntando uno por uno (como mucho `DIAS_EN_TIRA`
 * preguntas) sin pasar de `ultimo`. `ok` con null = ninguno. Una pregunta que falla corta la
 * búsqueda y devuelve su error: un 429 no se vuelve «no hay lugar».
 */
export async function siguienteDiaConLugar(dia: string, ultimo: string, consultar: (dia: string) => Promise<Resultado<Huecos>>): Promise<Resultado<Huecos | null>> {
  let d = dia;
  for (let i = 0; i < DIAS_EN_TIRA; i++) {
    d = sumarDias(d, 1);
    if (d > ultimo) break;
    const r = await consultar(d);
    if (!r.ok || r.datos.huecos.length > 0) return r;
  }
  return { ok: true, datos: null };
}

// ── Tus datos ────────────────────────────────────────────────────────────────────────────────────
export const CAMPOS_DE_DATOS = ["nombre", "celular", "correo", "nota"] as const;
export type CampoDeDatos = (typeof CAMPOS_DE_DATOS)[number];
export type DatosDeClienta = Record<CampoDeDatos, string>;
export const LIMITES_DE_DATOS: Record<CampoDeDatos, number> = { nombre: 100, celular: 20, correo: 254, nota: 200 };

/** Lo que tiene mal cada campo. Vacío = se puede reservar. Las mismas reglas que la función. */
export function erroresDeDatos(f: DatosDeClienta): Partial<Record<CampoDeDatos, string>> {
  const e: Partial<Record<CampoDeDatos, string>> = {};
  const nombre = f.nombre.trim(), celular = f.celular.trim(), correo = f.correo.trim();
  if (Array.from(nombre).length < 2) e.nombre = "Escribe tu nombre.";
  else if (Array.from(nombre).length > LIMITES_DE_DATOS.nombre) e.nombre = "Usa 100 caracteres o menos.";
  if (!celular) e.celular = "Escribe tu celular.";
  else if (!normalizarTelefono(celular)) e.celular = "Escribe los 10 dígitos de tu celular.";
  if (!correo) e.correo = "Escribe tu correo: ahí te llega el enlace de tu cita.";
  else if (correo.length > LIMITES_DE_DATOS.correo || !CORREO.test(correo)) e.correo = "Revisa tu correo: le falta algo.";
  if (Array.from(f.nota.trim()).length > LIMITES_DE_DATOS.nota) e.nota = "Usa 200 caracteres o menos.";
  return e;
}

/** El cuerpo de `reservar` con los datos YA validados. `tarjeta` solo al pagar el anticipo. */
export function cuerpoDeReserva(d: {
  sucursalId: string; inicia: string; cadena: ServicioDeCadena[]; datos: DatosDeClienta; clave: string; captcha: string; tarjeta?: TarjetaDePedido;
}): CuerpoReserva {
  const celular = d.datos.celular.trim();
  return {
    sucursal_id: d.sucursalId, inicia: d.inicia, servicios: d.cadena.map((s) => ({ producto_id: s.producto_id, usuario_id: s.usuario_id })),
    cliente: { nombre: d.datos.nombre.trim(), telefono: normalizarTelefono(celular) ?? celular, email: d.datos.correo.trim().toLowerCase() },
    nota: d.datos.nota.trim() || null, captcha: d.captcha, clave: d.clave, ...(d.tarjeta && { tarjeta: d.tarjeta }),
  };
}

/**
 * La clave de un intento de reserva: la MISMA mientras no cambie lo que se aparta (sucursal, cadena y
 * hora), para que reintentar —o pagar tras `POR_PAGAR`— devuelva la misma cita. Otra en cuanto cambia
 * algo, o tras `olvidar` (la cita de esa clave se canceló: con ella ya no se aparta nada).
 */
export function intentoDeReserva(nueva: () => string = claveNueva) {
  let actual: { de: string; clave: string } | null = null;
  return {
    para(sucursalId: string, cadena: ServicioDeCadena[], inicia: string): string {
      const de = JSON.stringify([sucursalId, cadena, inicia]);
      if (actual?.de !== de) actual = { de, clave: nueva() };
      return actual.clave;
    },
    olvidar() { actual = null; },
  };
}

// ── La cita ──────────────────────────────────────────────────────────────────────────────────────
/** Pagó en línea menos de lo que pide el anticipo y todavía hay plazo: se está esperando el pago. */
export const esperaPago = (c: Pick<Cita, "estado" | "pago_hasta" | "anticipo_mxn" | "anticipo_pagado_mxn">): boolean =>
  c.estado === "AGENDADA" && c.pago_hasta !== null && (aCentavos(c.anticipo_pagado_mxn) ?? 0) < (aCentavos(c.anticipo_mxn) ?? 0);

const ESTADOS: Record<Cita["estado"], { etiqueta: string; tono: "success" | "warning" | "danger" | "neutral" }> = {
  AGENDADA: { etiqueta: "Confirmada", tono: "success" },
  EN_ESPERA: { etiqueta: "Te estamos esperando", tono: "success" },
  EN_CURSO: { etiqueta: "En curso", tono: "neutral" },
  TERMINADA: { etiqueta: "Terminada", tono: "neutral" },
  COBRADA: { etiqueta: "Terminada", tono: "neutral" },
  NO_LLEGO: { etiqueta: "No asististe", tono: "warning" },
  CANCELADA: { etiqueta: "Cancelada", tono: "danger" },
};
/** El rótulo del estado de la cita. */
export const estadoDeCita = (c: Pick<Cita, "estado" | "pago_hasta" | "anticipo_mxn" | "anticipo_pagado_mxn">) =>
  esperaPago(c) ? { etiqueta: "Falta pagar el anticipo", tono: "warning" as const } : ESTADOS[c.estado];

/**
 * Qué se le ofrece en la página de la cita: cambiarla o cancelarla (`cambiar`), escribirle al
 * negocio porque ya es tarde para hacerlo en línea (`contactar`), o nada (ya pasó o se canceló).
 */
export function queSePuede(c: Pick<Cita, "estado" | "puede_cambiar">): "cambiar" | "contactar" | "nada" {
  if (c.estado !== "AGENDADA") return "nada";
  return c.puede_cambiar ? "cambiar" : "contactar";
}

// ── Errores ──────────────────────────────────────────────────────────────────────────────────────
const DE_RESERVAS: Record<string, string> = {
  SIN_CONFIRMAR: "No pudimos confirmar tu cita. Vuelve a intentarlo: si ya había quedado, no se duplica.",
  SERVICIO_NO_DISPONIBLE: "No pudimos conectar. Vuelve a intentar en unos minutos.",
  TIENDA_NO_DISPONIBLE: "Las reservas en línea no están disponibles por ahora.",
  CITA_NO_ENCONTRADA: "No encontramos esta cita. Revisa que el enlace esté completo.",
  CODIGO_INVALIDO: "No encontramos esta cita. Revisa que el enlace esté completo.",
  HUECO_OCUPADO: "Ese horario ya no está disponible. Elige otro.",
  FUERA_DE_PLAZO: "Para cambios, comunícate con el negocio.",
  HORA_INVALIDA: "Ese horario ya no está disponible. Elige otro.",
  SERVICIOS_INVALIDOS: "Uno de los servicios ya no está disponible. Revisa tu cita.",
  CLIENTE_INVALIDO: "Revisa tu nombre, tu celular y tu correo.",
  PAGO_NO_DISPONIBLE: "El negocio no puede cobrar el anticipo en línea por ahora. No se te cobró nada.",
  PAGO_EN_PAUSA: "El pago en línea está en pausa por ahora. No se te cobró nada. Intenta más tarde.",
  DEMASIADOS_INTENTOS: "Hiciste demasiados intentos seguidos. Espera unos minutos.",
};
/** El texto de un error de reservas: el de la base si vino, el nuestro, o el general de la tienda. */
export function textoDeFallo(e: { error: string; mensaje?: string }): string {
  if (e.mensaje) return e.mensaje;
  if (Object.hasOwn(DE_RESERVAS, e.error)) return DE_RESERVAS[e.error]!;
  const t = textoDeError(e.error);
  return `${t.texto} ${t.hacer}`;
}

// ── Reservar → pagar el anticipo ─────────────────────────────────────────────────────────────────
/**
 * Por dónde va la reserva en «Tus datos»:
 *  · `datos`     — escribiendo; `aviso`: lo que salió mal en el último intento.
 *  · `enviando`  — `reservar` en vuelo (con o sin tarjeta: `conTarjeta`).
 *  · `tarjeta`   — la cita quedó apartada esperando el anticipo (`POR_PAGAR`) o el banco rechazó la tarjeta.
 *                  `pausa`: el antifraude lo rechazó por riesgo (o ya estaba en pausa): no se invita a repetir.
 *  · `reto`      — el banco pide confirmar (3D Secure) en un marco: `reto`, con las mismas reglas que la
 *                  tienda (`retoQueSigue`, `seOfreceCancelar`: tras el aviso de que terminó ya no se cancela).
 *  · `hecho`     — la cita quedó (pagada si tocaba); `porConfirmar`: el pago aún se está confirmando.
 *  · `horario`   — ese horario ya no se puede (lo ganó otra o venció el plazo para pagar): a elegir otro, con otra clave.
 */
export type Flujo = {
  fase: "datos" | "enviando" | "tarjeta" | "reto" | "hecho" | "horario";
  aviso: string | null; conTarjeta: boolean; pausa: boolean;
  codigo: string | null; cita: Cita | null; reto: Reto | null; porConfirmar: boolean;
};
export const FLUJO_INICIAL: Flujo = { fase: "datos", aviso: null, conTarjeta: false, pausa: false, codigo: null, cita: null, reto: null, porConfirmar: false };

export type EventoDeFlujo =
  | { tipo: "enviar"; conTarjeta: boolean }
  | { tipo: "respuesta"; r: Resultado<Reserva> }
  | { tipo: "reto"; paso: PasoDelReto }
  /** La página del banco avisó que terminó: el marco se quita y se espera al servidor. */
  | { tipo: "reto-termino" }
  /** La clienta tocó «Cancelar» en el reto. */
  | { tipo: "reto-cancelar" }
  /** La tarjeta no se pudo leer (no se llamó al servidor). */
  | { tipo: "tarjeta-mal"; texto: string };

/** El pago en línea en pausa (riesgo): hasta cuándo, sin invitar a probar otra tarjeta. */
export function textoDePausaDeReserva(hasta: string | null | undefined, recien: boolean, ahora: number = Date.now()): string {
  const que = recien ? "No pudimos aprobar este pago en línea. No fue tu banco y no se te cobró nada." : "El pago en línea está en pausa por ahora. No se te cobró nada.";
  return `${que} Intenta otra vez ${aPartirDe(finDeLaPausa(hasta, ahora))} o comunícate con el negocio.`;
}

function rechazado(s: Flujo, detalle: string | null, hasta?: string | null): Flujo {
  if (detalle === "RIESGO") return { ...s, fase: "tarjeta", reto: null, pausa: true, aviso: textoDePausaDeReserva(hasta, true) };
  return { ...s, fase: "tarjeta", reto: null, aviso: textoDeRechazo(detalle, false).texto };
}

export function flujo(s: Flujo, e: EventoDeFlujo): Flujo {
  switch (e.tipo) {
    case "enviar": return { ...s, fase: "enviando", aviso: null, conTarjeta: e.conTarjeta };
    case "tarjeta-mal": return { ...s, fase: "tarjeta", aviso: e.texto };
    case "respuesta": {
      const r = e.r;
      if (!r.ok) {
        if (r.error === "PAGO_RECHAZADO") return rechazado(s, r.detalle, r.hasta);
        if (r.error === "PAGO_EN_PAUSA") return { ...s, fase: s.conTarjeta ? "tarjeta" : "datos", pausa: true, aviso: textoDePausaDeReserva(r.hasta, false) };
        if (r.error === "HUECO_OCUPADO" || r.error === "HORA_INVALIDA" || r.error === "FUERA_DE_PLAZO") return { ...FLUJO_INICIAL, fase: "horario", aviso: textoDeFallo(r) };
        return { ...s, fase: s.conTarjeta ? "tarjeta" : "datos", aviso: textoDeFallo(r) };
      }
      const { codigo, cita, pago } = r.datos;
      const t: Flujo = { ...s, aviso: null, codigo: codigo ?? s.codigo, cita: cita ?? s.cita };
      // Una cita cancelada por esta clave (venció el plazo para pagar): con ella ya no se aparta nada.
      if (cita?.estado === "CANCELADA") return { ...FLUJO_INICIAL, fase: "horario", aviso: "Se acabó el tiempo para pagar el anticipo. Elige tu horario otra vez." };
      if (pago === null || pago.estado === "PAGADO") return { ...t, fase: "hecho", porConfirmar: false };
      if (pago.estado === "POR_PAGAR") return { ...t, fase: "tarjeta" };
      // Sin código no hay cómo seguir el reto desde aquí: el correo lleva el enlace.
      if (pago.estado === "VERIFICACION" && t.codigo) return { ...t, fase: "reto", reto: { codigo: t.codigo, url: pago.url, esperando: false, cancelado: false } };
      return { ...t, fase: "hecho", porConfirmar: true };
    }
    case "reto-termino": return s.reto ? { ...s, reto: { ...s.reto, esperando: true } } : s;
    case "reto-cancelar": return s.reto ? { ...s, reto: { ...s.reto, esperando: true, cancelado: true } } : s;
    case "reto": {
      const p = e.paso;
      if (s.fase !== "reto" || !s.reto) return s;
      if (p.tipo === "pedido") return { ...s, fase: "hecho", reto: null, porConfirmar: false };
      if (p.tipo === "rechazado") return rechazado(s, s.reto.cancelado ? "CANCELADO" : p.detalle, p.hasta);
      if (p.tipo === "sigue") {
        const reto = retoQueSigue(s.reto, p);
        return reto === s.reto ? s : { ...s, reto };
      }
      return s;
    }
  }
}
