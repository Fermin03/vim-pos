// Lo que se hace con un pago en línea de la tienda, paso a paso: cobrarlo, confirmarlo, devolverlo. Es EL camino compartido: el aviso de Mercado Pago (`tienda-webhook-mp`), el respaldo
// desde la página de seguimiento (`tienda`, acción `confirmar_pago`) y el barrido de cada minuto
// pasan por `confirmarPago`, así que los tres deciden lo mismo.
//
// Regla de todo el archivo: lo que llega de fuera (un aviso) es solo una pista.
// La verdad se le pregunta a Mercado Pago con el token de la conexión de la tienda del restaurante
// dueño de ESE pago, y lo que mueve el pedido es la base (0173), que es idempotente.
//
// No toca la base ni la red directamente: recibe un puerto (pago-puerto.ts lo arma con supabase-js)
// y el cliente de Mercado Pago. Así se prueba con `node --test` y dobles.
import { esc, soloAscii } from "../correo.ts";
import { type ClienteMpTienda, cuerpoDeOrden, type DatosCobro, type Decision, decidirOrden, enReto, esTokenInvalido, type MotivoDeRechazo, motivoDeRechazo, ordenAtascada, ordenesDeBusqueda, ordenViva, respuestaDeCobro, motivoDeNoAceptado, resumenDeFallo, sinDatosPersonales, urlDeReto } from "./pago-mp.ts";

/**
 * ABANDONADO: el cliente dejó el reto del banco (lo canceló o pasó el plazo). El pedido se cerró sin
 * pago, pero la orden sigue viva en Mercado Pago, que no la deja cancelar: se vigila hasta su final.
 */
export type EstadoPago = "CREADO" | "APROBADO" | "RECHAZADO" | "VENCIDO" | "ABANDONADO" | "POR_DEVOLVER" | "DEVUELTO" | "DEVOLUCION_FALLIDA";

/** Un renglón de tienda_pagos con lo de su conexión que hace falta para creerle a una orden. */
export type FilaPago = {
  id: string; conexion_id: string; estado: EstadoPago;
  /** Total + propina, texto con dos decimales. */
  monto: string;
  /** El cobro ya se le mandó a Mercado Pago (tienda_pagos.cobro_pedido_at). */
  cobro_mandado: boolean;
  /** La orden de Mercado Pago, si ya se sabe cuál es. */
  orden_id_externo: string | null;
  /** El motivo del rechazo, como lo dijo Mercado Pago (solo con estado RECHAZADO). */
  detalle: string | null;
  /** Cuándo nació el renglón (ISO): acota la búsqueda por referencia. */
  creado: string;
  /** Ya quedó anotado que el pago espera el reto del banco (tienda_pagos.verificacion_at), con su plazo propio. */
  en_verificacion: boolean;
  /** Consultas buenas del barrido con el pago ya vencido o abandonado (tienda_pagos.conciliaciones). */
  conciliaciones: number;
  /** `tienda_conexiones.cuenta_id_externo`: el user_id de Mercado Pago que tiene que traer la orden. */
  cuenta_vendedora: string;
};

export type Aplicado = { estado: string; pedido_estado: string; recien_aprobado: boolean };
/** RETO_VIEJO: un reto abandonado cumplió 48 horas con su orden todavía pendiente; último vistazo y aviso. */
export type Tarea = { id: string; tarea: "DEVOLVER" | "CONCILIAR" | "RETO_VIEJO"; conexion_id: string; orden_id_externo: string | null };
type Resultado = { resultado: "APROBADO" | "RECHAZADO" | "DEVUELTO"; ordenIdExterno: string; pagoIdExterno: string | null; monto: string | null;
                   tipoTarjeta: string | null; marca: string | null; detalle: string | null };

export type PuertoPagos = {
  leerPago(pagoId: string): Promise<FilaPago | null>;
  /** El Access Token de la conexión de la tienda (Vault). null = no hay con qué hablarle a Mercado Pago. */
  token(conexionId: string): Promise<string | null>;
  /** ¿Me toca mandar el cobro? Verdadero UNA sola vez por pago. */
  tomarCobro(pagoId: string): Promise<boolean>;
  descartar(pagoId: string): Promise<boolean>;
  aplicar(pagoId: string, d: Resultado): Promise<Aplicado>;
  /** Deja anotada la orden que aún no tiene resultado, o por qué una orden viva no se pudo aplicar. */
  anotar(pagoId: string, d: { ordenIdExterno?: string | null; error?: string | null }): Promise<void>;
  /**
   * El pago espera el reto del banco (3D Secure): anota la orden y le da al pedido el plazo de un
   * pago en verificación (tienda_pago_verificacion, 0175). Repetirla no vuelve a alargar el plazo.
   */
  verificar(pagoId: string, ordenIdExterno: string): Promise<void>;
  /**
   * Deja el reto del banco: cierra el pedido sin pago y el pago queda ABANDONADO, vigilado
   * (tienda_pago_abandonar, 0175). `ordenIdExterno`: la orden, si el pago aún no la tiene anotada.
   * Falso = no era un pago que se pudiera dejar, y no se tocó nada.
   */
  abandonar(pagoId: string, ordenIdExterno: string | null): Promise<boolean>;
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
  /** La llave de idempotencia de una devolución: NUEVA en cada intento (por omisión, un uuid). */
  llave?: () => string;
  ahora?: () => Date;
};

const resultadoDe = (d: Extract<Decision, { tipo: "APROBADO" | "RECHAZADO" | "DEVUELTO" }>): Resultado => ({
  resultado: d.tipo, ordenIdExterno: d.ordenIdExterno, pagoIdExterno: d.pagoIdExterno, monto: d.monto,
  tipoTarjeta: d.tipoTarjeta, marca: d.marca, detalle: d.detalle,
});

// ── Cobrar ───────────────────────────────────────────────────────────────────────────────────────

export type Cobro =
  /** El pedido ya está RECIBIDO. `recienAprobado`: se aprobó en esta llamada (toca mandar el correo). */
  | { tipo: "APROBADO"; recienAprobado: boolean }
  /** Mercado Pago dijo que no, seguro. El pedido se descartó: no existe y no se cobró nada. */
  | { tipo: "RECHAZADO"; motivo: MotivoDeRechazo }
  /**
   * El cobro no se pudo procesar y NO es cosa del banco ni de la tarjeta: Mercado Pago no aceptó la
   * petición (400/422) o el token de la tarjeta no existe o ya se usó (402 `invalid_card_token`). El
   * pedido se descartó y no se cobró nada. No cuenta como tarjeta rechazada del negocio;
   * `contarIp`: sí cuenta para el tope de quien lo mandó (un token inventado es de quien abusa).
   */
  | { tipo: "NO_PROCESADO"; contarIp: boolean }
  /** No se sabe si se cobró. El pedido queda POR_PAGAR y lo resuelven el aviso, la página y el barrido. */
  | { tipo: "POR_CONFIRMAR" }
  /**
   * Mercado Pago pide que el cliente confirme el pago con su banco (3D Secure) antes de cobrar. No
   * se ha cobrado nada: el pedido queda POR_PAGAR, con la orden anotada y su plazo de verificación.
   * `url` es la página del reto, ya validada (`urlDeReto`): viaja SOLO en la respuesta a ese cliente.
   */
  | { tipo: "VERIFICACION"; url: string }
  /**
   * No se pudo cobrar y se sabe que no se creó nada: no hay token, o Mercado Pago rechazó las
   * credenciales (`sinPermiso`: toca pausar el pago en esa sucursal y avisar a VIM). El pedido se descartó.
   */
  | { tipo: "NO_DISPONIBLE"; sinPermiso: boolean };

/**
 * Cobra el pago de un pedido recién creado y dice cómo quedó. Reglas:
 *   · un renglón de tienda_pagos se cobra UNA vez. Si esta llamada no es la primera (un reintento
 *     del mismo intento de compra porque la respuesta se perdió), NO vuelve a cobrar: le pregunta a
 *     Mercado Pago qué pasó con el primer cobro;
 *   · «rechazado» solo se dice con un NO seguro de Mercado Pago sobre una tarjeta de verdad: el 402
 *     `failed` (VERIFICADO: no crea orden) o una orden que nace `failed`. Sin respuesta, un 5xx,
 *     409, 429 o un estado que no es final nunca son «rechazado»: POR_CONFIRMAR;
 *   · un 400/422 (validación) dice que no se creó nada, pero no se le cree sin comprobarlo: se
 *     busca la orden por nuestra referencia y solo si Mercado Pago confirma que no hay ninguna se
 *     descarta el pedido (NO_PROCESADO). Si no se puede comprobar, el renglón se conserva: POR_CONFIRMAR;
 *   · un token de tarjeta inventado o usado (402 `invalid_card_token`) tampoco es un rechazo del
 *     banco: NO_PROCESADO;
 *   · un 401 no es un rechazo de la tarjeta: PAGO_NO_DISPONIBLE;
 *   · una orden aprobada se cree después de `decidirOrden` (referencia, cuenta vendedora, moneda,
 *     acreditada) y de que la base compruebe el monto;
 *   · una orden que queda en revisión (`processing` o `in_review`) NO se puede cancelar (VERIFICADO: 409): se
 *     anota su id y queda POR_CONFIRMAR;
 *   · una orden que espera el reto del banco (`action_required`, VERIFICADO) no está cobrada ni
 *     rechazada: VERIFICACION, con la dirección del reto. Un reintento con el reto vivo no crea otra
 *     orden: consulta la misma y devuelve su dirección, que Mercado Pago sigue dando (VERIFICADO);
 *   · un reto que ya se dejó (ABANDONADO), o que llega sin una dirección que se pueda abrir, es
 *     RECHAZADO con motivo SIN_VERIFICAR: no se cobró nada y el cliente puede pagar otra vez. Ese
 *     pedido NO se descarta: su renglón es lo que permite vigilar la orden, que sigue viva.
 */
export async function cobrarPago(deps: Deps, datos: Omit<DatosCobro, "monto">): Promise<Cobro> {
  const fila = await deps.db.leerPago(datos.pagoId);
  if (!fila) return { tipo: "POR_CONFIRMAR" };
  if (fila.estado === "APROBADO") return { tipo: "APROBADO", recienAprobado: false };

  /** Un NO seguro: el pedido se va. Si ya no se puede descartar, es que algo lo movió: que lo diga el seguimiento. */
  const descartar = async (resultado: Cobro): Promise<Cobro> => ((await deps.db.descartar(fila.id)) ? resultado : { tipo: "POR_CONFIRMAR" });

  // La carrera: el aviso del rechazo llegó ANTES que esta respuesta (o que este reintento) y la base
  // ya cerró el pedido «sin pago». Es el mismo no: se descarta y el cliente corrige sin perder el carrito.
  if (fila.estado === "RECHAZADO") return descartar({ tipo: "RECHAZADO", motivo: motivoDeRechazo(fila.detalle) });
  // El reto de ese intento ya se dejó: el pedido está cerrado sin pago (y se queda: se vigila su orden).
  if (fila.estado === "ABANDONADO") return { tipo: "RECHAZADO", motivo: "SIN_VERIFICAR" };
  if (fila.estado !== "CREADO") return { tipo: "POR_CONFIRMAR" };

  // El token, ANTES de marcar el cobro como mandado: sin él no sale ningún cobro, y el renglón no
  // debe quedar como «mandado» (obligaría al cliente a esperar la conciliación de algo que no existió).
  const token = await deps.db.token(fila.conexion_id);
  if (!token && !fila.cobro_mandado) {
    deps.registrar("SIN_TOKEN", `conexión ${fila.conexion_id}`);
    return descartar({ tipo: "NO_DISPONIBLE", sinPermiso: false });
  }

  if (!(await deps.db.tomarCobro(fila.id))) {
    // Ya se mandó antes. Se pregunta, no se cobra.
    const reto: { url: string | null } = { url: null };
    const c = await confirmarPago(deps, fila.id, undefined, false, { alReto: (url) => { reto.url = url; } });
    const ahora = await deps.db.leerPago(fila.id);
    if (ahora?.estado === "APROBADO") return { tipo: "APROBADO", recienAprobado: c.ok && c.recienAprobado };
    if (ahora?.estado === "RECHAZADO") return descartar({ tipo: "RECHAZADO", motivo: motivoDeRechazo(ahora.detalle) });
    if (ahora?.estado === "ABANDONADO") return { tipo: "RECHAZADO", motivo: "SIN_VERIFICAR" };
    // El reto del primer intento sigue vivo: se continúa ese, no se abre otro.
    return reto.url && ahora?.estado === "CREADO" ? { tipo: "VERIFICACION", url: reto.url } : { tipo: "POR_CONFIRMAR" };
  }

  // (Sin token y con el cobro ya mandado no se llega aquí: `tomarCobro` dio falso arriba.)
  if (!token) return { tipo: "POR_CONFIRMAR" };
  // El cuerpo lleva además lo del pedido y del pagador (para el antifraude); la llave es la de siempre.
  const r = await deps.mp(token).crearOrden(cuerpoDeOrden({ ...datos, monto: fila.monto }), `tienda-pago-${fila.id}`, datos.tarjeta.dispositivo);
  const que = respuestaDeCobro({ pagoId: fila.id, cuentaVendedora: fila.cuenta_vendedora }, r);
  if (que.tipo === "SIN_PERMISO") {
    deps.registrar("COBRO_SIN_PERMISO", `conexión ${fila.conexion_id}: ${resumenDeFallo(r)}`);
    return descartar({ tipo: "NO_DISPONIBLE", sinPermiso: true });
  }
  if (que.tipo === "RECHAZADO") {
    deps.registrar("COBRO_RECHAZADO", `pago ${fila.id}: ${que.detalle ?? "sin motivo"}`);
    return descartar(esTokenInvalido(que.detalle) ? { tipo: "NO_PROCESADO", contarIp: true } : { tipo: "RECHAZADO", motivo: motivoDeRechazo(que.detalle) });
  }
  if (que.tipo === "NO_ACEPTADO") {
    // El mensaje de Mercado Pago nombra la propiedad que no le gustó; por si repite su VALOR, se le quitan los datos del cliente.
    deps.registrar("COBRO_NO_ACEPTADO", `${resumenDeFallo(r)} — ${sinDatosPersonales(motivoDeNoAceptado(r), datos)}`);
    // «No se creó nada» lo dice un 400, pero se comprueba: ¿hay alguna orden con nuestra referencia?
    // El cobro ya contestó (con un no): si dejó una orden abierta no hay que esperarla, se cancela ya.
    const c = await confirmarPago(deps, fila.id, undefined, true);
    if (c.ok && c.aplicados === 0 && !c.enVerificacion) return descartar({ tipo: "NO_PROCESADO", contarIp: false });
    // La orden que quedó abierta se pudo cancelar: tampoco hay cobro.
    return (await deps.db.leerPago(fila.id))?.estado === "RECHAZADO" ? descartar({ tipo: "NO_PROCESADO", contarIp: false }) : { tipo: "POR_CONFIRMAR" };
  }
  if (que.tipo === "NO_SE_SABE") {
    deps.registrar("COBRO_SIN_RESPUESTA", `pago ${fila.id}: ${resumenDeFallo(r)}`);
    return { tipo: "POR_CONFIRMAR" };
  }

  const d = que.decision;
  if (d.tipo === "RECHAZADO") return descartar({ tipo: "RECHAZADO", motivo: motivoDeRechazo(d.detalle) });
  if (d.tipo === "PENDIENTE" && d.ordenIdExterno && enReto(r.cuerpo)) {
    const url = urlDeReto(r.cuerpo);
    // Sin una dirección que se pueda abrir el cliente no tiene cómo contestar el reto: se deja ya,
    // en vez de tenerlo esperando. La orden queda vigilada, como cualquier reto abandonado.
    // (Al log va solo que no sirvió: la dirección lleva un token del cliente.)
    if (!url) {
      deps.registrar("RETO_SIN_DIRECCION", `pago ${fila.id}, orden ${d.ordenIdExterno}`);
      if (await deps.db.abandonar(fila.id, d.ordenIdExterno)) return { tipo: "RECHAZADO", motivo: "SIN_VERIFICAR" };
      await deps.db.anotar(fila.id, { ordenIdExterno: d.ordenIdExterno });
      return { tipo: "POR_CONFIRMAR" };
    }
    await deps.db.verificar(fila.id, d.ordenIdExterno);
    return { tipo: "VERIFICACION", url };
  }
  if (d.tipo !== "APROBADO") {
    // En revisión, ajena, incidente o ya devuelta: no es un sí ni un no. Lo resuelve la conciliación,
    // que consultará ESTA orden si es nuestra y sigue viva.
    deps.registrar("COBRO_SIN_RESULTADO", `pago ${fila.id}: ${d.tipo}${"motivo" in d ? ` (${d.motivo})` : ""}`);
    if (d.tipo === "PENDIENTE" && d.ordenIdExterno) await deps.db.anotar(fila.id, { ordenIdExterno: d.ordenIdExterno });
    return { tipo: "POR_CONFIRMAR" };
  }
  const a = await deps.db.aplicar(fila.id, resultadoDe(d));
  // La base no la tomó como LA orden del pedido (el monto no era el esperado): ya quedó por devolverse.
  return a.estado === "APROBADO" ? { tipo: "APROBADO", recienAprobado: a.recien_aprobado } : { tipo: "POR_CONFIRMAR" };
}

// ── Confirmar ────────────────────────────────────────────────────────────────────────────────────

export type Confirmacion =
  /**
   * `enVerificacion`: hay una orden nuestra que sigue esperando el reto del banco (el cliente lo
   * está contestando, o lo dejó y Mercado Pago aún no la cierra). No hay cobro: no es un fallo ni
   * «no hay orden», todavía no hay nada que aplicar. (La dirección del reto NO va aquí: este
   * resultado se guarda en tienda_eventos. Quien la necesite la pide con `alReto`.)
   */
  | { ok: true; aplicados: number; recienAprobado: boolean; enVerificacion: boolean }
  /**
   * PAGO_DESCONOCIDO y NO_ENCONTRADO: no hay nada que reintentar. SIN_TOKEN y MP_NO_RESPONDE: sí.
   * PAGO_SIN_APLICAR: Mercado Pago tiene una orden VIVA con nuestra referencia (cobrada o en
   * revisión) que no se pudo aplicar. No es «sin pago»: puede haber dinero del cliente. La
   * conciliación no cuenta como buena, el seguimiento sigue «confirmando» y el barrido acaba
   * avisando a VIM, con el id de la orden y el motivo (quedan anotados en el pago).
   */
  | { ok: false; motivo: "PAGO_DESCONOCIDO" | "NO_ENCONTRADO" | "SIN_TOKEN" | "MP_NO_RESPONDE" | "PAGO_SIN_APLICAR" };

/**
 * Le pregunta a Mercado Pago por un pago nuestro y aplica lo que diga. Por orden de preferencia:
 *   · la orden que el pago ya tiene anotada (`GET /v1/orders/{id}`);
 *   · la que dice el aviso (`ordenPista`): solo es una pista, y `decidirOrden` exige nuestra referencia;
 *   · si no se sabe cuál es (al crearla no hubo respuesta), la búsqueda por referencia.
 * Siempre con el token de la conexión dueña del pago; el monto lo comprueba la base.
 * Repetirla, o correrla dos veces a la vez, deja lo mismo.
 *
 * EL RETO DEL BANCO (3D Secure). Una orden nuestra en `action_required` no está cobrada ni
 * rechazada, y Mercado Pago NO la deja cancelar (VERIFICADO: 422) ni la cierra pronto (seguía igual
 * a los 45 minutos). Aquí nunca es un fallo: `enVerificacion`.
 *   · Mientras el pago espera (CREADO) y nadie pide dejarlo: no se toca; su dirección se entrega
 *     por `alReto` (a quien la pida; nunca se guarda). Si se supo de ella aquí (la respuesta del
 *     cobro se perdió), se anota y se le da su plazo.
 *   · Dejarlo —el cliente tocó «Cancelar», o pasó el plazo— es cosa de la BASE (tienda_pago_abandonar
 *     y el barrido): el pedido se cierra sin pago y el pago queda ABANDONADO. Esta función solo
 *     acompaña: intenta cancelar la orden UNA vez por pago (al pedirlo el cliente, o en la primera
 *     consulta ya abandonado), por si se deja; el 422 es lo normal y no se registra. Si se dejó, se
 *     vuelve a leer y se aplica como quedó.
 *   · Ya ABANDONADO se sigue consultando (el barrido, espaciado): si la orden acaba cobrada —el
 *     cliente contestó tarde— se aplica y la base la manda a devolver; si acaba rechazada, cancelada
 *     o vencida, se da por conciliada.
 *   · Un pago VENCIDO cuya orden resulta estar esperando un reto (nadie lo anotó a tiempo) pasa a
 *     ABANDONADO para que se vigile como lo que es.
 */
export async function confirmarPago(deps: Deps, pagoId: string, ordenPista?: string, cobroYaContesto = false,
                                    opciones: { /** El cliente abandonó el reto: que la orden se cancele ya. */ cancelar?: boolean; alReto?: (url: string) => void } = {}): Promise<Confirmacion> {
  const fila = await deps.db.leerPago(pagoId);
  if (!fila) return { ok: false, motivo: "PAGO_DESCONOCIDO" };
  const token = await deps.db.token(fila.conexion_id);
  if (!token) {
    deps.registrar("SIN_TOKEN", `conexión ${fila.conexion_id}`);
    return { ok: false, motivo: "SIN_TOKEN" };
  }
  const mp = deps.mp(token);
  const ordenId = fila.orden_id_externo ?? ordenPista ?? null;
  const ahora = (deps.ahora ?? (() => new Date()))();
  const r = ordenId
    ? await mp.leerOrden(ordenId)
    // Desde un poco antes de que naciera el renglón (relojes) hasta ahora.
    : await mp.buscarOrdenes(fila.id, new Date(Date.parse(fila.creado) - 10 * 60_000), new Date(ahora.getTime() + 5 * 60_000));
  if (r.status !== 200) {
    // 404 a una orden concreta: ese id no es de esta cuenta (o no existe). No es nuestra.
    if (ordenId && r.status === 404) return { ok: false, motivo: "NO_ENCONTRADO" };
    deps.registrar("CONSULTAR", resumenDeFallo(r));
    return { ok: false, motivo: "MP_NO_RESPONDE" };
  }

  const esperado = { pagoId: fila.id, cuentaVendedora: fila.cuenta_vendedora };
  let aplicados = 0, recienAprobado = false;
  const ordenes = ordenId ? [r.cuerpo] : ordenesDeBusqueda(r.cuerpo);
  // Una orden NUESTRA que Mercado Pago abrió y no procesó (422 al cobrar) no se va a cobrar nunca:
  // se cancela allá para que no quede abierta, y con eso el pedido se cierra como «sin pago» en vez
  // de dejar al cliente en «Confirmando tu pago». Si no se deja cancelar, sigue pendiente.
  for (const [i, orden] of ordenes.entries()) {
    const o = orden as { id?: unknown; external_reference?: unknown } | null;
    if (o?.external_reference !== fila.id || typeof o.id !== "string" || !ordenAtascada(orden, cobroYaContesto ? new Date(8.64e15) : ahora)) continue;
    const c = await mp.cancelarOrden(o.id, `tienda-cancelar-${fila.id}-${ahora.getTime()}`);
    if (c.status === 200 || c.status === 201) {
      const leida = await mp.leerOrden(o.id);
      if (leida.status === 200) ordenes[i] = leida.cuerpo;
      deps.registrar("ORDEN_SIN_PROCESAR_CANCELADA", `pago ${fila.id}, orden ${o.id}`);
    } else deps.registrar("ORDEN_SIN_PROCESAR", `pago ${fila.id}, orden ${o.id}: no se dejó cancelar (${resumenDeFallo(c)})`);
  }
  // Una orden NUESTRA que espera el reto del banco (ver arriba): nunca es un fallo.
  for (const [i, orden] of ordenes.entries()) {
    const d = decidirOrden(esperado, orden);
    if (d.tipo !== "PENDIENTE" || !d.ordenIdExterno || !enReto(orden)) continue;
    if (fila.estado === "CREADO" && !opciones.cancelar) {
      if (!fila.en_verificacion) await deps.db.verificar(fila.id, d.ordenIdExterno);
      const url = urlDeReto(orden);
      if (url) opciones.alReto?.(url);
      continue;
    }
    // Venció sin que nadie anotara que esperaba un reto: que se vigile como reto abandonado.
    if (fila.estado === "VENCIDO") await deps.db.abandonar(fila.id, d.ordenIdExterno);
    // El intento de cancelar, una vez por pago. VERIFICADO: lo normal es un 422 y la orden sigue igual.
    if (!opciones.cancelar && !(fila.estado === "ABANDONADO" && fila.conciliaciones === 0)) continue;
    const c = await mp.cancelarOrden(d.ordenIdExterno, `tienda-cancelar-${fila.id}-${ahora.getTime()}`);
    if (c.status !== 200 && c.status !== 201) continue;
    const leida = await mp.leerOrden(d.ordenIdExterno);
    if (leida.status === 200) ordenes[i] = leida.cuerpo;
    deps.registrar("RETO_CANCELADO", `pago ${fila.id}, orden ${d.ordenIdExterno}`);
  }
  const decisiones = ordenes.map((orden) => decidirOrden(esperado, orden));
  /** Una orden nuestra sigue esperando el reto (tal como quedó tras el intento de cancelar). */
  const esReto = (i: number): boolean => decisiones[i]!.tipo === "PENDIENTE" && enReto(ordenes[i]);
  const enVerificacion = ordenes.some((_, i) => esReto(i));
  // Una orden viva que trae NUESTRA referencia y que no se puede aplicar (otra cuenta vendedora, sin
  // acreditar, otra moneda, en revisión): se deja dicho con su id y su motivo, en el log y en el pago.
  let sinAplicar: string | null = null;
  for (const [i, orden] of ordenes.entries()) {
    const d = decisiones[i]!;
    const nuestra = (orden as { external_reference?: unknown } | null)?.external_reference === fila.id;
    if (!("motivo" in d) || !nuestra || !ordenViva(orden)) continue;
    // El reto de arriba: no es una orden «sin aplicar» (no hay cobro), es una que todavía no tiene resultado.
    if (esReto(i)) continue;
    sinAplicar = `orden ${d.ordenIdExterno ?? "?"}: ${d.tipo} (${d.motivo})`;
    if (d.tipo !== "PENDIENTE") deps.registrar("PAGO_SIN_APLICAR", `pago ${fila.id}, ${sinAplicar}`);
    // En revisión y aún sin orden anotada (se supo por la búsqueda o por el aviso): se anota.
    await deps.db.anotar(fila.id, { ordenIdExterno: d.tipo === "PENDIENTE" ? d.ordenIdExterno : null, error: sinAplicar });
  }
  // El aprobado va primero: un rechazo cierra el pedido que espera, y un aprobado que se aplicara
  // después de él acabaría devuelto.
  for (const d of [...decisiones.filter((x) => x.tipo === "APROBADO"), ...decisiones.filter((x) => x.tipo !== "APROBADO")]) {
    // Sin resultado que aplicar: pendiente (no hay nada que hacer todavía), ajena o incidente (al log).
    if ("motivo" in d) {
      if (d.tipo !== "PENDIENTE") deps.registrar(d.tipo, `pago ${fila.id}: ${d.motivo}`);
      continue;
    }
    const a = await deps.db.aplicar(fila.id, resultadoDe(d));
    aplicados++;
    recienAprobado ||= a.recien_aprobado;
  }
  // Con una aprobada ya aplicada, el pedido tiene su pago: lo demás no cambia eso.
  if (sinAplicar && !recienAprobado && (await deps.db.leerPago(fila.id))?.estado !== "APROBADO") return { ok: false, motivo: "PAGO_SIN_APLICAR" };
  return { ok: true, aplicados, recienAprobado, enVerificacion };
}

/**
 * Qué se le contesta a Mercado Pago tras un aviso. 200 = entendido, no lo repitas (también cuando
 * la referencia o la orden no son nuestras). 503 = no se pudo consultar: que lo reintente.
 */
export function respuestaDeConfirmacion(c: Confirmacion): 200 | 503 {
  // PAGO_SIN_APLICAR: repetir el aviso no lo arregla (lo sigue el barrido): 200.
  return c.ok || c.motivo === "PAGO_DESCONOCIDO" || c.motivo === "NO_ENCONTRADO" || c.motivo === "PAGO_SIN_APLICAR" ? 200 : 503;
}

// ── Devolver ─────────────────────────────────────────────────────────────────────────────────────

/**
 * Devuelve completa una orden POR_DEVOLVER (`POST /v1/orders/{id}/refund`, sin cuerpo).
 * VERIFICADO: la llave de idempotencia tiene que ser NUEVA en cada intento (con la misma, Mercado
 * Pago repite el error guardado del intento anterior). Lo que evita devolver dos veces es mirar la
 * orden ANTES de cada intento: si ya está `refunded` (la devolvió un intento anterior del que no nos
 * enteramos, o el restaurante desde su cuenta), se marca DEVUELTO sin pedir otra. Si no se puede
 * mirar, no se intenta.
 * Cuándo se intenta lo decide la base: no antes de un minuto del cobro, y cada fallo espera más.
 * Devuelve el estado en que queda: DEVUELTO, POR_DEVOLVER (se reintentará) o DEVOLUCION_FALLIDA.
 */
export async function devolverPago(deps: Deps, t: Pick<Tarea, "id" | "conexion_id" | "orden_id_externo">): Promise<string> {
  if (!t.orden_id_externo) return deps.db.devolucion(t.id, false, "sin id de orden en Mercado Pago");
  const token = await deps.db.token(t.conexion_id);
  if (!token) return deps.db.devolucion(t.id, false, "sin token de la cuenta del restaurante");
  const mp = deps.mp(token);
  const antes = await mp.leerOrden(t.orden_id_externo);
  if (antes.status !== 200) return deps.db.devolucion(t.id, false, `no se pudo consultar la orden: ${resumenDeFallo(antes)}`);
  const estado = (antes.cuerpo as { status?: unknown } | null)?.status;
  if (estado === "refunded") return deps.db.devolucion(t.id, true);
  const r = await mp.devolver(t.orden_id_externo, (deps.llave ?? (() => crypto.randomUUID()))());
  // VERIFICADO: 201 con la orden ya `refunded`. Si contesta 2xx con otro estado no se da por hecha:
  // el siguiente intento empieza mirando la orden y la marcará devuelta cuando lo esté.
  if (r.status === 200 || r.status === 201) {
    const queda = (r.cuerpo as { status?: unknown } | null)?.status;
    return queda === "refunded" ? deps.db.devolucion(t.id, true) : deps.db.devolucion(t.id, false, `devolución pedida, orden ${String(queda ?? "sin estado").slice(0, 30)}`);
  }
  return deps.db.devolucion(t.id, false, resumenDeFallo(r));
}

/**
 * La pasada de cada minuto: devuelve lo que toca y le pregunta a Mercado Pago una última vez por
 * los pagos que nadie confirmó. Un fallo en una tarea no detiene las demás.
 * `avisar` se llama una vez por cada devolución que se dio por fallida (sexto intento, tras esperar
 * 1, 5 y 30 minutos, 3 y 12 horas) y una vez por cada pago que lleva tres consultas seguidas sin
 * poder resolverse (cuenta desconectada, token rechazado, o una orden viva que no se pudo aplicar):
 * ahí puede haber un cobro sin pedido, y nadie más lo va a ver.
 * ponytail: de una en una y hasta 10 por pasada; con el tope de 10 s por llamada cabe en una
 * invocación. Si un día hay cola, subir el tope o repartir en paralelo por conexión.
 */
export async function barrer(deps: Deps, avisar: (t: Tarea, de: "DEVOLUCION" | "CONCILIACION" | "RETO") => Promise<void>): Promise<{ devueltos: number; fallidos: number; conciliados: number; sinConsultar: number }> {
  const cuenta = { devueltos: 0, fallidos: 0, conciliados: 0, sinConsultar: 0 };
  for (const t of await deps.db.tomar(10)) {
    try {
      if (t.tarea === "RETO_VIEJO") {
        // 48 horas con el reto abandonado y la orden sin cerrar: la base ya dejó de vigilarlo. Un
        // último vistazo (si ya se cobró o se cerró, se aplica) y, si sigue pendiente o no se pudo
        // mirar, un aviso a VIM con el id de la orden. Uno solo: esta tarea sale una vez por pago.
        const c = await confirmarPago(deps, t.id);
        if (!c.ok || c.enVerificacion) await avisar(t, "RETO");
      } else if (t.tarea === "DEVOLVER") {
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
export function avisoDeConciliacionFallida(d: {
  pagoId: string; negocio: string; folio: string; monto: string;
  /** La orden de Mercado Pago, si se sabe cuál es: con ella se encuentra el cobro en la cuenta del restaurante. */
  ordenIdExterno?: string | null;
  /** Por qué no se pudo aplicar o consultar (tienda_pagos.ultimo_error). */
  motivo?: string | null;
}): { subject: string; html: string } {
  return {
    subject: soloAscii(`Posible cobro sin pedido: ${d.folio} de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>Un cobro en línea del que no se supo el resultado lleva tres consultas seguidas a Mercado Pago sin poder resolverse. <strong>Puede haber un cobro hecho sin pedido.</strong></p>
<ul><li>Negocio: ${esc(d.negocio)}</li><li>Pedido: ${esc(d.folio)}</li><li>Monto esperado: $${esc(d.monto)}</li>
<li>Pago (tienda_pagos.id, es la referencia en Mercado Pago): ${esc(d.pagoId)}</li>
<li>Orden en Mercado Pago: ${esc(d.ordenIdExterno || "no se sabe (al crearla no hubo respuesta)")}</li>
<li>Motivo: ${esc(d.motivo || "no se pudo consultar a Mercado Pago (cuenta desconectada o token rechazado)")}</li></ul>
<p>Si el motivo dice que hay una orden que no se pudo aplicar, el dinero puede estar cobrado: hay que revisarla en la cuenta de Mercado Pago del restaurante y, si está cobrada, devolverla desde ahí. Si no se pudo consultar, lo más probable es que el restaurante desconectó su cuenta o que su token fue rechazado. Se seguirá intentando una vez por hora durante 48 horas: si reconecta la cuenta, el cobro se encuentra y se devuelve solo. Si no, hay que buscar en su cuenta de Mercado Pago una orden con esa referencia y devolverla a mano.</p>
</div>`,
  };
}

/**
 * El correo interno a VIM cuando un reto del banco que el cliente dejó lleva 48 horas sin que Mercado
 * Pago cierre su orden. No hay cobro (por eso no es «posible cobro sin pedido»), pero ya nadie la
 * vigila: si se aprobara después, la devolución solo saldría si llega el aviso de Mercado Pago.
 */
export function avisoDeRetoSinCerrar(d: { pagoId: string; negocio: string; folio: string; monto: string; ordenIdExterno?: string | null }): { subject: string; html: string } {
  return {
    subject: soloAscii(`Verificacion del banco sin cerrar: ${d.folio} de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>Un cliente dejó sin contestar la verificación de su banco hace 48 horas y Mercado Pago todavía tiene esa orden pendiente. <strong>No se ha cobrado nada</strong> y el pedido se cerró sin pago en su momento.</p>
<ul><li>Negocio: ${esc(d.negocio)}</li><li>Pedido: ${esc(d.folio)}</li><li>Monto: $${esc(d.monto)}</li>
<li>Pago (tienda_pagos.id, es la referencia en Mercado Pago): ${esc(d.pagoId)}</li>
<li>Orden en Mercado Pago: ${esc(d.ordenIdExterno || "-")}</li></ul>
<p>Desde ahora ya no se consulta sola. Si Mercado Pago avisa de un cambio, se aplica igual (y si resulta cobrada, se devuelve). Conviene mirar esa orden en la cuenta de Mercado Pago del restaurante: si aparece cobrada sin devolución, hay que devolverla desde ahí.</p>
</div>`,
  };
}

/**
 * El correo interno a VIM cuando una devolución falló tres veces. Lleva solo lo nuestro (negocio,
 * folio, monto y el id del pago en tienda_pagos): ni datos del cliente ni de la tarjeta.
 */
export function avisoDeDevolucionFallida(d: { pagoId: string; negocio: string; folio: string; monto: string; error: string; ordenIdExterno?: string | null }): { subject: string; html: string } {
  return {
    subject: soloAscii(`Devolucion fallida: pedido ${d.folio} de ${d.negocio}`),
    html: `<div style="font-family:system-ui,sans-serif;color:#111">
<p>La devolución automática de un pago en línea falló seis veces a lo largo de unas 16 horas y ya no se reintenta sola.</p>
<ul><li>Negocio: ${esc(d.negocio)}</li><li>Pedido: ${esc(d.folio)}</li><li>Monto: $${esc(d.monto)}</li>
<li>Pago (tienda_pagos.id): ${esc(d.pagoId)}</li><li>Orden en Mercado Pago: ${esc(d.ordenIdExterno || "-")}</li><li>Último error: ${esc(d.error)}</li></ul>
<p>Lo más probable es que la cuenta de Mercado Pago del restaurante no tenga saldo disponible. Cuando lo tenga, se devuelve desde su cuenta de Mercado Pago, o se vuelve a encolar poniendo el pago en POR_DEVOLVER con intentos en 0.</p>
</div>`,
  };
}
