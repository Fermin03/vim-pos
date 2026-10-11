// Lo que se hace con un pago en línea de la tienda, paso a paso: crear su preferencia, confirmarlo,
// devolverlo. Es EL camino compartido: el aviso de Mercado Pago (`tienda-webhook-mp`), el respaldo
// desde la página de seguimiento (`tienda`, acción `confirmar_pago`) y el barrido de cada minuto
// pasan por `confirmarPago`, así que los tres deciden lo mismo.
//
// Regla de todo el archivo: lo que llega de fuera (un aviso, la URL de regreso) es solo una pista.
// La verdad se le pregunta a Mercado Pago con el token del restaurante dueño de ESE pago, y lo que
// mueve el pedido es la base (0172), que es idempotente.
//
// No toca la base ni la red directamente: recibe un puerto (pago-puerto.ts lo arma con supabase-js)
// y el cliente de Mercado Pago. Así se prueba con `node --test` y dobles.
import { esc, soloAscii } from "../correo.ts";
import { type ClienteMpTienda, cuerpoDePreferencia, type DatosPreferencia, decidirPago, leerPreferencia, pagosDeBusqueda, resumenDeFallo } from "./pago-mp.ts";

export type EstadoPago = "CREADO" | "APROBADO" | "RECHAZADO" | "VENCIDO" | "POR_DEVOLVER" | "DEVUELTO" | "DEVOLUCION_FALLIDA";

/** Un renglón de tienda_pagos con lo de su conexión que hace falta para creerle a un pago. */
export type FilaPago = {
  id: string; conexion_id: string; estado: EstadoPago;
  /** Total + propina, texto con dos decimales. */
  monto: string;
  init_point: string | null; vence_at: string;
  cuenta_vendedora: string; de_prueba: boolean;
};

export type Aplicado = { estado: string; pedido_estado: string; recien_aprobado: boolean };
export type Tarea = { id: string; tarea: "DEVOLVER" | "CONCILIAR"; conexion_id: string; pago_id_externo: string | null };

export type PuertoPagos = {
  leerPago(pagoId: string): Promise<FilaPago | null>;
  /** El Access Token del restaurante (Vault). null = no hay con qué hablarle a Mercado Pago. */
  token(conexionId: string): Promise<string | null>;
  conexionEnError(conexionId: string): Promise<void>;
  tomarPreferencia(pagoId: string): Promise<boolean>;
  guardarPreferencia(pagoId: string, preferenciaId: string, initPoint: string): Promise<void>;
  descartar(pagoId: string): Promise<boolean>;
  aplicar(pagoId: string, d: { resultado: "APROBADO" | "RECHAZADO" | "DEVUELTO"; pagoIdExterno: string; monto: string;
                               tipoTarjeta: string | null; marca: string | null; detalle: string | null }): Promise<Aplicado>;
  tomar(max: number): Promise<Tarea[]>;
  /** Cómo le fue a la devolución. Devuelve el estado en que queda el pago. */
  devolucion(pagoId: string, ok: boolean, error?: string): Promise<string>;
  /** Cómo le fue a una consulta del barrido. TRUE = es el tercer fallo seguido: hay que avisar a VIM. */
  conciliacion(pagoId: string, ok: boolean): Promise<boolean>;
};

export type Deps = {
  db: PuertoPagos;
  mp: (token: string) => ClienteMpTienda;
  /** Al log, con un código. Nunca lleva tokens ni el cuerpo de una respuesta. */
  registrar: (codigo: string, detalle: string) => void;
};

// ── Crear la preferencia ─────────────────────────────────────────────────────────────────────────

export type PagoPreparado =
  /** `init_point` null = el pago ya no espera al cliente (se pagó, venció): no hay a dónde mandarlo. */
  | { ok: true; init_point: string | null }
  /** EN_PROCESO: otra petición del mismo intento la está creando; reintentar en un momento.
   *  NO_DISPONIBLE: Mercado Pago no dejó crearla; el pedido se descartó y no se creó nada. */
  | { ok: false; error: "PAGO_EN_PROCESO" | "PAGO_NO_DISPONIBLE" };

/**
 * Deja el pago listo para cobrarse y devuelve a dónde mandar al cliente. Si ya tenía preferencia
 * (un reintento con la misma clave), devuelve la MISMA sin crear otra. Si Mercado Pago no la crea,
 * el pedido se descarta: no queda vivo ni cuenta contra el tope del cliente.
 */
export async function prepararPago(deps: Deps, datos: Omit<DatosPreferencia, "monto" | "vence">): Promise<PagoPreparado> {
  const fila = await deps.db.leerPago(datos.pagoId);
  if (!fila) return { ok: false, error: "PAGO_NO_DISPONIBLE" };
  if (fila.init_point) return { ok: true, init_point: fila.estado === "CREADO" || fila.estado === "RECHAZADO" ? fila.init_point : null };
  if (fila.estado !== "CREADO") return { ok: true, init_point: null };
  if (!(await deps.db.tomarPreferencia(fila.id))) return { ok: false, error: "PAGO_EN_PROCESO" };

  const fallo = async (codigo: string, detalle: string): Promise<PagoPreparado> => {
    deps.registrar(codigo, detalle);
    await deps.db.descartar(fila.id);
    return { ok: false, error: "PAGO_NO_DISPONIBLE" };
  };
  const token = await deps.db.token(fila.conexion_id);
  if (!token) {
    await deps.db.conexionEnError(fila.conexion_id);
    return fallo("SIN_TOKEN", `conexión ${fila.conexion_id}`);
  }
  const r = await deps.mp(token).crearPreferencia(cuerpoDePreferencia({ ...datos, monto: fila.monto, vence: new Date(fila.vence_at) }));
  const pref = r.status === 200 || r.status === 201 ? leerPreferencia(r.cuerpo) : null;
  if (!pref) {
    if (r.status === 401) await deps.db.conexionEnError(fila.conexion_id);
    return fallo("PREFERENCIA", resumenDeFallo(r));
  }
  await deps.db.guardarPreferencia(fila.id, pref.id, pref.init_point);
  return { ok: true, init_point: pref.init_point };
}

// ── Confirmar ────────────────────────────────────────────────────────────────────────────────────

export type Confirmacion =
  | { ok: true; aplicados: number; recienAprobado: boolean }
  /** PAGO_DESCONOCIDO y NO_ENCONTRADO: no hay nada que reintentar. Los otros dos, sí. */
  | { ok: false; motivo: "PAGO_DESCONOCIDO" | "NO_ENCONTRADO" | "SIN_TOKEN" | "MP_NO_RESPONDE" };

/**
 * Le pregunta a Mercado Pago por un pago nuestro y aplica lo que diga. Con `pagoIdExterno` (la
 * pista de un aviso) consulta ESE pago; sin él, busca los que traigan nuestra referencia.
 * Siempre con el token del restaurante dueño del pago, y cada pago pasa por `decidirPago`
 * (referencia, cuenta vendedora, moneda) antes de tocar nada; el monto lo comprueba la base.
 * Repetirla, o correrla dos veces a la vez, deja lo mismo.
 */
export async function confirmarPago(deps: Deps, pagoId: string, pagoIdExterno?: string): Promise<Confirmacion> {
  const fila = await deps.db.leerPago(pagoId);
  if (!fila) return { ok: false, motivo: "PAGO_DESCONOCIDO" };
  const token = await deps.db.token(fila.conexion_id);
  if (!token) {
    deps.registrar("SIN_TOKEN", `conexión ${fila.conexion_id}`);
    return { ok: false, motivo: "SIN_TOKEN" };
  }
  const mp = deps.mp(token);
  const r = pagoIdExterno ? await mp.leerPago(pagoIdExterno) : await mp.buscarPagos(fila.id);
  if (r.status !== 200) {
    // 404 a un pago concreto: ese id no es de esta cuenta (o no existe). No es nuestro.
    if (pagoIdExterno && r.status === 404) return { ok: false, motivo: "NO_ENCONTRADO" };
    if (r.status === 401) await deps.db.conexionEnError(fila.conexion_id);
    deps.registrar("CONSULTAR", resumenDeFallo(r));
    return { ok: false, motivo: "MP_NO_RESPONDE" };
  }

  const esperado = { pagoId: fila.id, cuentaVendedora: fila.cuenta_vendedora, dePrueba: fila.de_prueba };
  let aplicados = 0, recienAprobado = false;
  for (const pago of pagoIdExterno ? [r.cuerpo] : pagosDeBusqueda(r.cuerpo)) {
    const d = decidirPago(esperado, pago);
    // Sin resultado que aplicar: pendiente (no hay nada que hacer todavía), ajeno o incidente (al log).
    if ("motivo" in d) {
      if (d.tipo !== "PENDIENTE") deps.registrar(d.tipo, `pago ${fila.id}: ${d.motivo}`);
      continue;
    }
    const a = await deps.db.aplicar(fila.id, {
      resultado: d.tipo, pagoIdExterno: d.pagoIdExterno, monto: d.monto, tipoTarjeta: d.tipoTarjeta, marca: d.marca, detalle: d.detalle,
    });
    aplicados++;
    recienAprobado ||= a.recien_aprobado;
  }
  return { ok: true, aplicados, recienAprobado };
}

/**
 * Qué se le contesta a Mercado Pago tras un aviso. 200 = entendido, no lo repitas (también cuando
 * la referencia o el pago no son nuestros). 503 = no se pudo consultar: que lo reintente.
 */
export function respuestaDeConfirmacion(c: Confirmacion): 200 | 503 {
  return c.ok || c.motivo === "PAGO_DESCONOCIDO" || c.motivo === "NO_ENCONTRADO" ? 200 : 503;
}

// ── Devolver ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve completo un pago POR_DEVOLVER. La llave de idempotencia es fija por pago: si el intento
 * anterior sí llegó a Mercado Pago y no nos enteramos, este no devuelve dos veces. Si la devolución
 * falla, se mira el pago: puede que ya esté devuelto (lo hizo el restaurante desde su cuenta).
 * Devuelve el estado en que queda: DEVUELTO, POR_DEVOLVER (se reintentará) o DEVOLUCION_FALLIDA.
 */
export async function devolverPago(deps: Deps, t: Pick<Tarea, "id" | "conexion_id" | "pago_id_externo">): Promise<string> {
  if (!t.pago_id_externo) return deps.db.devolucion(t.id, false, "sin id de pago en Mercado Pago");
  const token = await deps.db.token(t.conexion_id);
  if (!token) return deps.db.devolucion(t.id, false, "sin token de la cuenta del restaurante");
  const mp = deps.mp(token);
  const r = await mp.devolver(t.pago_id_externo, `devolucion-${t.id}`);
  if (r.status === 200 || r.status === 201) return deps.db.devolucion(t.id, true);
  const ahora = await mp.leerPago(t.pago_id_externo);
  if (ahora.status === 200 && (ahora.cuerpo as { status?: unknown } | null)?.status === "refunded") return deps.db.devolucion(t.id, true);
  if (r.status === 401) await deps.db.conexionEnError(t.conexion_id);
  return deps.db.devolucion(t.id, false, resumenDeFallo(r));
}

/**
 * La pasada de cada minuto: devuelve lo que toca y le pregunta a Mercado Pago una última vez por
 * los pagos que nadie confirmó. Un fallo en una tarea no detiene las demás.
 * `avisar` se llama una vez por cada devolución que se dio por fallida (tercer intento) y una vez
 * por cada pago por el que no se ha podido preguntar tres veces seguidas (cuenta desconectada, token
 * rechazado): ahí puede haber un cobro sin pedido, y nadie más lo va a ver.
 * ponytail: de una en una y hasta 10 por pasada; con el tope de 10 s por llamada cabe en una
 * invocación. Si un día hay cola, subir el tope o repartir en paralelo por conexión.
 */
export async function barrer(deps: Deps, avisar: (t: Tarea, de: "DEVOLUCION" | "CONCILIACION") => Promise<void>): Promise<{ devueltos: number; fallidos: number; conciliados: number; sinConsultar: number }> {
  const cuenta = { devueltos: 0, fallidos: 0, conciliados: 0, sinConsultar: 0 };
  for (const t of await deps.db.tomar(10)) {
    try {
      if (t.tarea === "DEVOLVER") {
        const estado = await devolverPago(deps, t);
        if (estado === "DEVUELTO") cuenta.devueltos++;
        if (estado === "DEVOLUCION_FALLIDA") { cuenta.fallidos++; await avisar(t, "DEVOLUCION"); }
      } else {
        // Solo cuenta si Mercado Pago contestó. Si no, la base lleva la cuenta de los fallos, espacia
        // las consultas y dice cuándo avisar; el seguimiento, mientras, no afirma «sin pago».
        const c = await confirmarPago(deps, t.id);
        if (c.ok) cuenta.conciliados++; else cuenta.sinConsultar++;
        if (await deps.db.conciliacion(t.id, c.ok)) await avisar(t, "CONCILIACION");
      }
    } catch (e) {
      deps.registrar("BARRIDO", `pago ${t.id}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return cuenta;
}

/** Un tope de `consumirCupo` (misma forma que `Cupo` de _shared/limite.ts). */
type Tope = { clave: string; ventanaSeg: number; max: number };

/**
 * Los topes de un aviso de Mercado Pago, que llega sin autenticar (la firma puede faltar).
 *   · Con una referencia que NO es nuestra: una bolsa aparte. No cuesta ninguna consulta a Mercado
 *     Pago, y agotarla no le quita ni un aviso a los pagos de verdad.
 *   · Con una referencia nuestra: el tope de ESA referencia primero, y solo después el global. La
 *     referencia no es secreta (el comprador la ve en la URL con que Mercado Pago lo regresa), así
 *     que su tope es lo que acota lo que un comprador puede forzar: 40 consultas por hora con el
 *     token de ese restaurante. Como va antes, quien insiste con una referencia agota la suya y
 *     deja de gastar el global.
 */
export function topesDelAviso(ref: string, esNuestra: boolean): Tope[] {
  if (!esNuestra) return [{ clave: "mp-tienda:ref-desconocida", ventanaSeg: 3600, max: 600 }];
  return [
    { clave: `mp-tienda:aviso:${ref.toLowerCase()}`, ventanaSeg: 3600, max: 40 },
    { clave: "mp-tienda:avisos", ventanaSeg: 3600, max: 3000 },
  ];
}

/**
 * El correo interno a VIM cuando no se ha podido preguntar tres veces seguidas a Mercado Pago por un
 * pago que nadie confirmó. Puede haber un cobro hecho y el pedido vencido como si no se hubiera pagado.
 */
export function avisoDeConciliacionFallida(d: { pagoId: string; negocio: string; folio: string; monto: string }): { subject: string; html: string } {
  return {
    subject: soloAscii(`Posible cobro sin pedido: ${d.folio} de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>No se ha podido consultar a Mercado Pago tres veces seguidas por un pago en línea que nadie confirmó. <strong>Puede haber un cobro hecho sin pedido.</strong></p>
<ul><li>Negocio: ${esc(d.negocio)}</li><li>Pedido: ${esc(d.folio)}</li><li>Monto esperado: $${esc(d.monto)}</li>
<li>Pago (tienda_pagos.id): ${esc(d.pagoId)}</li></ul>
<p>Lo más probable es que el restaurante desconectó su cuenta de Mercado Pago o que su token fue rechazado. Se seguirá intentando una vez por hora durante 48 horas: si reconecta la cuenta, el cobro se encuentra y se devuelve solo. Si no, hay que buscar en su cuenta de Mercado Pago un pago con esa referencia y devolverlo a mano.</p>
</div>`,
  };
}

/**
 * El correo interno a VIM cuando una devolución falló tres veces. Lleva solo lo nuestro (negocio,
 * folio, monto y el id del pago en tienda_pagos): ni datos del cliente ni de la tarjeta.
 */
export function avisoDeDevolucionFallida(d: { pagoId: string; negocio: string; folio: string; monto: string; error: string }): { subject: string; html: string } {
  return {
    subject: soloAscii(`Devolucion fallida: pedido ${d.folio} de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>La devolución automática de un pago en línea falló tres veces y ya no se reintenta sola.</p>
<ul><li>Negocio: ${esc(d.negocio)}</li><li>Pedido: ${esc(d.folio)}</li><li>Monto: $${esc(d.monto)}</li>
<li>Pago (tienda_pagos.id): ${esc(d.pagoId)}</li><li>Último error: ${esc(d.error)}</li></ul>
<p>Lo más probable es que la cuenta de Mercado Pago del restaurante no tenga saldo disponible. Cuando lo tenga, se devuelve desde su cuenta de Mercado Pago, o se vuelve a encolar poniendo el pago en POR_DEVOLVER con intentos en 0.</p>
</div>`,
  };
}
