// Acciones del cajero sobre un pedido de app (ADR 0011). El POS nunca habla con Uber: manda la
// acción aquí con su JWT de empleado; se valida que el pedido sea de SU tenant y se llama a la app.
//
// Desde la entrega 4 de la tienda en línea atiende también los pedidos de la tienda PROPIA (canal
// TIENDA) y su pausa (acciones `enlinea_*`). Esas ramas se deciden por `canal === "TIENDA"`, nunca
// llaman a Uber ni escriben delivery_eventos; el camino de Uber (canal APP) queda como estaba.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { registrarError } from "../_shared/errores.ts";
import { cajaIdDeEmail } from "../_shared/dispositivo.ts";
import { bearerDe, claimsDe, tenantDeClaims } from "../_shared/identidad.ts";
import { clienteUberDeApp, ENTORNO } from "../_shared/delivery/cliente-uber.ts";
import { motivoRechazoUber, segundosAReadyTime, type MotivoRechazo } from "../_shared/delivery/uber.ts";
import { cambiarPrepTienda, consultarEstadoTienda, pausarTienda, reanudarTienda, type ConexionTienda } from "../_shared/delivery/tienda-uber-acciones.ts";
import { ACCIONES_TIENDA, accionExigeModulo, moduloDeliveryActivo } from "../_shared/delivery/modulo.ts";
import { ACCIONES_ENLINEA, ESTADOS_REPORTABLES, fallaDeTicket, moduloTiendaActivo, motivoDeTienda, pausaHasta } from "../_shared/delivery/enlinea.ts";
import type { DbMinima } from "../_shared/delivery/procesar-uber.ts";

const admin = clienteAdmin();
const uber = clienteUberDeApp(admin);

type Cuerpo = {
  pedido_id?: string; accion?: string; motivo?: string; detalle?: string; tiempo_prep_min?: number;
  // Acciones de tienda (spec A6): por sucursal, no por pedido.
  sucursal_id?: string; duracion?: string; minutos?: number; forzar?: boolean;
  // `enlinea_presente`: la caja del turno del POS web que avisa (opcional).
  caja_id?: string;
  // Acción `estado` (la caja reporta en qué va un pedido de la tienda en línea).
  estado?: string;
};
const ESTADOS_CONECTADA = ["ACTIVA", "PAUSADA", "ERROR"];
type Pedido = {
  id: string; tenant_id: string; sucursal_id: string; app: string; id_externo: string; estado: string; folio_corto: string | null;
  // En un pedido de la tienda en línea (canal TIENDA) no hay conexión de app.
  canal: string; conexion_id: string | null; gestion: "NUBE" | "ESCRITORIO"; gestion_caja_id: string | null;
};
const MOTIVOS: MotivoRechazo[] = ["AGOTADO", "CERRADO", "SATURADO", "POS_OFFLINE", "OTRO"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const msg = (e: unknown) => (e instanceof Error ? e.message : String(e));
/** Un error de la base en una rama de la tienda no se calla: sube al `catch`, que lo registra y responde INTERNO. */
const exigir = <T>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

servir(async (req, json) => {
  // 1) JWT del cajero → su tenant (mismo patrón que enviar-push).
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: userResp, error: userErr } = await admin.auth.getUser(token);
  if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
  // C2-6: el tenant es el del token verificado y el acceso se comprueba en ESE tenant (antes: el
  // primer acceso activo que devolviera Postgres, de cualquier negocio).
  const claims = claimsDe(token);
  const tenantToken = tenantDeClaims(claims);
  if (!tenantToken) return json({ error: "SIN_TENANT" }, 403);
  const { data: acceso } = await admin.from("usuarios_acceso").select("tenant_id")
    .eq("usuario_id", userResp.user.id).eq("tenant_id", tenantToken).eq("activo", true).limit(1).maybeSingle();
  if (!acceso) return json({ error: "SIN_TENANT" }, 403);
  const tenantId = tenantToken;
  // Dispositivo (caja instalada, espejo): su caja sale del correo y se verifica contra el tenant.
  const esDispositivo = claims.tipo_identidad === "DISPOSITIVO";
  let cajaDispositivo: { id: string; sucursal_id: string } | null = null;
  if (esDispositivo) {
    const cid = cajaIdDeEmail(userResp.user.email);
    if (cid) {
      const { data: c } = await admin.from("cajas").select("id, sucursal_id").eq("id", cid).eq("tenant_id", tenantId).maybeSingle();
      cajaDispositivo = (c as { id: string; sucursal_id: string } | null) ?? null;
    }
  }

  // 2) Cuerpo y pedido (del tenant del cajero, nunca de otro).
  let body: Cuerpo;
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  if (!body.accion) return json({ error: "FALTAN_CAMPOS" }, 400);

  // Guard del módulo (add-on de delivery): las acciones de TIENDA quedan cerradas sin el add-on
  // encendido. Va aquí, antes de resolver la conexión, para que un POS que sigue sondeando —una
  // pestaña vieja, una caja sin actualizar— no cueste ni una lectura de más ni una llamada a Uber.
  // El porqué de que solo alcance a las de tienda está en `modulo.ts`.
  if (accionExigeModulo(body.accion)) {
    const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
    if (!moduloDeliveryActivo(mod)) return json({ error: "SIN_MODULO_DELIVERY" }, 403);
  }

  // Acciones de tienda (spec A6): estado, pausar, reanudar y tiempo de preparación de la tienda de
  // Uber de una sucursal. Cualquier empleado con sesión en la caja puede: es operación.
  if (ACCIONES_TIENDA.includes(body.accion)) {
    if (!body.sucursal_id) return json({ error: "FALTAN_CAMPOS" }, 400);
    const { data: cxData } = await admin.from("delivery_conexiones")
      .select("id, tenant_id, sucursal_id, tienda_id_externo, tiempo_prep_min, config, estado")
      .eq("sucursal_id", body.sucursal_id).eq("app", "APP_UBEREATS").maybeSingle();
    const cx = cxData as (ConexionTienda & { estado: string }) | null;
    if (!cx || cx.tenant_id !== tenantId || !cx.tienda_id_externo || !ESTADOS_CONECTADA.includes(cx.estado)) {
      return json({ error: "SIN_CONEXION_UBER" }, 404);
    }
    const deps = { db: admin as unknown as DbMinima, uber, ahora: () => new Date() };
    try {
      switch (body.accion) {
        case "tienda_estado":
          return json({ ok: true, tienda: await consultarEstadoTienda(deps, cx, body.forzar === true), tiempo_prep_min: cx.tiempo_prep_min });
        case "tienda_pausar": {
          const d = body.duracion === "1h" || body.duracion === "dia" ? body.duracion : "30m";
          return json({ ok: true, tienda: await pausarTienda(deps, cx, d) });
        }
        case "tienda_reanudar":
          return json({ ok: true, tienda: await reanudarTienda(deps, cx) });
        case "tienda_prep":
          return json({ ok: true, ...(await cambiarPrepTienda(deps, cx, Number(body.minutos))) });
      }
    } catch (e) {
      const m = msg(e);
      if (m === "TIENDA_ESTRATEGIA_UBER") return json({ error: "TIENDA_ESTRATEGIA_UBER" }, 409);
      if (m === "PREP_FUERA_DE_RANGO") return json({ error: "PREP_FUERA_DE_RANGO" }, 400);
      // Aunque Uber no responda, el POS puede mostrar los minutos que tenemos en VIM.
      registrarError("delivery-accion", "UBER_ERROR", m);
      return json({ error: "UBER_ERROR", tiempo_prep_min: cx.tiempo_prep_min }, 502);
    }
  }

  // Tienda en línea PROPIA, por sucursal: cómo está, pausarla, reanudarla y el latido del POS web.
  // Van antes de exigir `pedido_id`. El negocio sale de la sesión; la sucursal viene del cuerpo y
  // solo vale si su fila de `tienda_sucursales` es de ESE negocio (la FK compuesta de la 0161
  // garantiza que entonces la sucursal también lo es).
  if ((ACCIONES_ENLINEA as readonly string[]).includes(body.accion)) {
    try {
      if (body.accion === "enlinea_presente" && esDispositivo) return json({ error: "SOLO_EMPLEADO" }, 403);
      const sucursalId = body.sucursal_id;
      if (typeof sucursalId !== "string" || !UUID.test(sucursalId)) return json({ error: "FALTAN_CAMPOS" }, 400);
      const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
      if (!moduloTiendaActivo(mod)) return json({ error: "SIN_MODULO_TIENDA" }, 403);
      // La caja instalada solo opina de SU sucursal; de otra se le contesta como si no hubiera tienda.
      if (esDispositivo && cajaDispositivo?.sucursal_id !== sucursalId) return json({ error: "SUCURSAL_SIN_TIENDA" }, 404);

      let hasta: string | null = null;
      if (body.accion === "enlinea_pausar") {
        hasta = pausaHasta(body.duracion, new Date());
        if (!hasta) return json({ error: "DURACION_INVALIDA" }, 400);
      }
      const COLS = "participa, pausa_hasta";
      const escribe = body.accion === "enlinea_pausar" || body.accion === "enlinea_reanudar";
      // Pausar y reanudar escriben y leen en un viaje; sin fila no se toca nada.
      const fila = exigir(escribe
        ? await admin.from("tienda_sucursales").update({ pausa_hasta: hasta })
            .eq("tenant_id", tenantId).eq("sucursal_id", sucursalId).select(COLS).maybeSingle()
        : await admin.from("tienda_sucursales").select(COLS)
            .eq("tenant_id", tenantId).eq("sucursal_id", sucursalId).maybeSingle()) as { participa: boolean; pausa_hasta: string | null } | null;
      if (!fila) return json({ error: "SUCURSAL_SIN_TIENDA" }, 404);

      if (body.accion === "enlinea_presente") {
        // Decisión 4: sin caja instalada, quien da fe de que hay quien cocine es el POS web con turno
        // abierto. Se sella la misma marca que sella el espejo de la caja (la lee
        // sucursal_recibe_pedidos), y solo si de verdad hay un turno abierto en la nube.
        // Si el POS dice cuál es la caja de SU turno, solo se sella esa (y solo si de verdad tiene
        // turno abierto aquí): así el turno viejo de una caja instalada apagada no abre la tienda.
        if (body.caja_id !== undefined && (typeof body.caja_id !== "string" || !UUID.test(body.caja_id))) return json({ error: "FALTAN_CAMPOS" }, 400);
        const abiertos = admin.from("turnos").select("caja_id")
          .eq("tenant_id", tenantId).eq("sucursal_id", sucursalId).eq("estado", "ABIERTO");
        const turnos = exigir(await (body.caja_id ? abiertos.eq("caja_id", body.caja_id) : abiertos)) as { caja_id: string }[] | null;
        const cajas = [...new Set((turnos ?? []).map((t) => t.caja_id))];
        if (cajas.length === 0) return json({ ok: true, sellado: false });
        const selladas = exigir(await admin.from("cajas").update({ espejo_turno_abierto_at: new Date().toISOString() })
          .eq("tenant_id", tenantId).eq("sucursal_id", sucursalId).in("id", cajas).select("id")) as unknown[] | null;
        return json({ ok: true, sellado: (selladas ?? []).length > 0 });
      }

      const cfg = exigir(await admin.from("tienda_config").select("aceptacion").eq("tenant_id", tenantId).maybeSingle()) as { aceptacion?: string } | null;
      // null = recibe pedidos. Se pregunta por «recoger»; una sucursal que solo reparte se mira por
      // «domicilio», para no enseñarla apagada mientras vende.
      let motivo = exigir(await admin.rpc("tienda_estado_sucursal", { p_sucursal: sucursalId, p_modo: "RECOGER" })) as string | null;
      if (motivo === "MODO_NO_DISPONIBLE") {
        motivo = exigir(await admin.rpc("tienda_estado_sucursal", { p_sucursal: sucursalId, p_modo: "DOMICILIO" })) as string | null;
      }
      return json({
        participa: fila.participa === true,
        aceptacion: cfg?.aceptacion === "AUTO" ? "AUTO" : "MANUAL",
        pausa_hasta: fila.pausa_hasta ?? null,
        motivo: motivo ?? null,
      });
    } catch (e) {
      registrarError("delivery-accion", "INTERNO", msg(e));
      return json({ error: "INTERNO" }, 500);
    }
  }

  if (!body.pedido_id) return json({ error: "FALTAN_CAMPOS" }, 400);

  const { data: pData } = await admin.from("delivery_pedidos")
    .select("id, tenant_id, sucursal_id, app, canal, id_externo, estado, folio_corto, conexion_id, gestion, gestion_caja_id").eq("id", body.pedido_id).maybeSingle();
  const pedido = pData as Pedido | null;
  if (!pedido || pedido.tenant_id !== tenantId) return json({ error: "PEDIDO_NO_EXISTE" }, 404);
  const esDeTienda = pedido.canal === "TIENDA";
  // Fuera de la tienda propia, la única app que se sabe atender es Uber.
  if (!esDeTienda && pedido.app !== "APP_UBEREATS") return json({ error: "APP_NO_SOPORTADA" }, 400);

  const registrarSalida = async (tipo: string, ok: boolean, detalle: unknown) => {
    await admin.from("delivery_eventos").insert({
      tenant_id: tenantId, conexion_id: pedido.conexion_id, app: pedido.app, direccion: "SALIDA", tipo,
      id_externo: pedido.id_externo, procesado: ok, respuesta: ok ? detalle : null,
      error: ok ? null : String(detalle), http_status: ok ? 200 : null,
    });
  };

  // Espejo (spec 2026-09-03): reclamar y aceptar sin crear ticket en la nube.
  const reclamarParaCaja = async (): Promise<Response | null> => {
    if (!cajaDispositivo) return null;
    if (pedido.sucursal_id !== cajaDispositivo.sucursal_id) return json({ error: "PEDIDO_NO_EXISTE" }, 404);
    const { data: ok } = await admin.rpc("delivery_reclamar_pedido", { p_pedido: pedido.id, p_caja: cajaDispositivo.id });
    if (ok !== true) return json({ error: "RECLAMADO_POR_OTRA_CAJA", caja: pedido.gestion_caja_id }, 409);
    return null;
  };

  // Pedido de la tienda en línea PROPIA. Aquí no existe Uber: nada de `uber.*` ni de
  // `registrarSalida` (delivery_eventos es la bitácora de lo que se le manda a una app).
  // Aceptar y rechazar escriben SOLO si el pedido sigue por aceptar: entre la lectura de arriba y
  // este update el cron pudo vencerlo, u otra pantalla (o el agente de la caja) atenderlo. Hace lo
  // que delivery_pedido_transicion (0091) para esos estados, más el sello de aceptado_at, pero con
  // el estado en el WHERE. false = ya no estaba por aceptar y no se tocó nada.
  const moverPorAceptar = async (cambio: Record<string, string>): Promise<boolean> => {
    const filas = exigir(await admin.from("delivery_pedidos").update(cambio)
      .eq("id", pedido.id).eq("tenant_id", tenantId).eq("canal", "TIENDA").in("estado", ["RECIBIDO", "ERROR"])
      .select("id")) as unknown[] | null;
    return (filas?.length ?? 0) > 0;
  };
  const rechazarPorAceptar = (motivo: string) =>
    moverPorAceptar({ estado: "RECHAZADO", cancelado_at: new Date().toISOString(), motivo_cancelacion: motivo });

  const accionDeTienda = async (): Promise<Response> => {
    // La caja instalada solo atiende pedidos de su sucursal.
    if (esDispositivo && cajaDispositivo?.sucursal_id !== pedido.sucursal_id) return json({ error: "PEDIDO_NO_EXISTE" }, 404);
    switch (body.accion) {
      case "aceptar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        if (pedido.gestion === "ESCRITORIO") {
          // El ticket lo crea la caja instalada (su agente ve el ACEPTADO en el siguiente sondeo).
          const r = await reclamarParaCaja();   // no hace nada si quien acepta es un empleado
          if (r) return r;
          if (!(await moverPorAceptar({ estado: "ACEPTADO", aceptado_at: new Date().toISOString() }))) {
            // Ya no estaba por aceptar. Se relee en qué quedó: el agente de la caja distingue así
            // «lo aceptó otra pantalla» (sigue vivo) de «se cerró» (venció o lo rechazaron).
            const ahora = exigir(await admin.from("delivery_pedidos").select("estado")
              .eq("id", pedido.id).eq("tenant_id", tenantId).maybeSingle()) as { estado: string } | null;
            return json({ error: "ACCION_INVALIDA", estado: ahora?.estado ?? pedido.estado }, 409);
          }
          return json({ ok: true });
        }
        // Gestión NUBE: el ticket se crea aquí, sobre el turno de la nube. Una caja instalada no lo
        // vería nunca en su base, así que no es ella quien lo acepta.
        if (esDispositivo) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const { data: ticketId, error: errRpc } = await admin.rpc("crear_ticket_desde_tienda", { p_pedido_id: pedido.id });
        if (!errRpc) return json({ ok: true, ticket_id: ticketId });
        // Venció o lo atendieron justo antes: no es un fallo, es que ya no está por aceptar.
        if ((errRpc.message ?? "").includes("PEDIDO_NO_ACEPTABLE")) return json({ error: "ACCION_INVALIDA" }, 409);
        const falla = fallaDeTicket(errRpc.message ?? "", errRpc.code);
        registrarError("delivery-accion", falla.codigo, errRpc.message);
        // Sin turno, o algo que no conocemos: el pedido se queda como está y se puede reintentar.
        if (falla.reintentable) return json({ error: falla.codigo }, 409);
        // Decisión 3: lo que reintentar no arregla (el total o la zona cambiaron, un producto ya no
        // existe) cancela el pedido para que el cliente lo sepa ya, no cuando se venza.
        // (Si entretanto otro ya lo terminó, no se toca; para quien intentó aceptarlo da igual: ya no hay pedido.)
        await rechazarPorAceptar("OTRO");
        return json({ error: "PEDIDO_CANCELADO", causa: falla.codigo }, 409);
      }
      case "rechazar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        // Solo el código, de lista cerrada: el cliente lo ve en su seguimiento. `body.detalle` se ignora.
        if (!(await rechazarPorAceptar(motivoDeTienda(body.motivo)))) return json({ error: "ACCION_INVALIDA" }, 409);
        return json({ ok: true });
      }
      case "estado": {
        // La caja instalada cuenta en qué va el pedido mirando su ticket local. Solo ella lo sabe.
        if (!esDispositivo || !cajaDispositivo) return json({ error: "SOLO_DISPOSITIVO" }, 403);
        if (!ESTADOS_REPORTABLES.includes(String(body.estado))) return json({ error: "ESTADO_INVALIDO" }, 400);
        // Solo de un pedido que atiende una caja: el de gestión NUBE lo pone al día la base mirando
        // su ticket (tienda_sincronizar_estados_nube), y ninguna caja tiene ese ticket.
        if (pedido.gestion !== "ESCRITORIO") return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const estado = exigir(await admin.rpc("tienda_reportar_estado", {
          p_tenant: tenantId, p_pedido: pedido.id, p_estado: body.estado, p_motivo: motivoDeTienda(body.motivo),
        }));
        return json({ ok: true, estado });
      }
      default:
        // `listo` incluido (decisión 2): en la tienda el estado sale de lo que el cajero ya hace
        // —imprimir, asignar repartidor, cobrar— y lo reporta la caja con `estado`.
        return json({ error: "ACCION_INVALIDA" }, 400);
    }
  };

  try {
    // `reclamar` no distingue canal ni toca a Uber: sirve tal cual para los dos.
    if (esDeTienda && body.accion !== "reclamar") return await accionDeTienda();
    switch (body.accion) {
      case "reclamar": {
        if (!esDispositivo || !cajaDispositivo) return json({ error: "SOLO_DISPOSITIVO" }, 403);
        if (pedido.gestion !== "ESCRITORIO") return json({ error: "GESTION_NUBE" }, 409);
        const r = await reclamarParaCaja();
        return r ?? json({ ok: true });
      }
      case "aceptar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const { data: cx } = await admin.from("delivery_conexiones").select("tiempo_prep_min").eq("id", pedido.conexion_id).maybeSingle();
        const minutos = Number(body.tiempo_prep_min) || Number((cx as { tiempo_prep_min?: number } | null)?.tiempo_prep_min) || 15;
        if (pedido.gestion === "ESCRITORIO") {
          // El ticket lo crea (o ya creó) la caja instalada; aquí solo se acepta en Uber.
          if (esDispositivo) { const r = await reclamarParaCaja(); if (r) return r; }
          try {
            await uber.aceptar(pedido.id_externo, segundosAReadyTime(new Date(), minutos), pedido.folio_corto ?? pedido.id);
            await registrarSalida("accept", true, { minutos, gestion: "ESCRITORIO" });
          } catch (e) {
            await registrarSalida("accept", false, msg(e));
            if (!msg(e).startsWith("YA_PROCESADA")) { registrarError("delivery-accion", "UBER_ERROR", msg(e)); return json({ error: "UBER_ERROR" }, 502); }
          }
          await admin.rpc("delivery_pedido_transicion", { p_pedido_id: pedido.id, p_estado: "ACEPTADO", p_detalle: null });
          return json({ ok: true, gestion: "ESCRITORIO" });
        }
        const { data: ticketId, error: errRpc } = await admin.rpc("crear_ticket_desde_app", { p_pedido_id: pedido.id });
        if (errRpc) {
          const m = errRpc.message ?? String(errRpc);
          const codigo = m.includes("SIN_TURNO_ABIERTO") ? "SIN_TURNO_ABIERTO" : m.includes("ITEM_SIN_MAPEAR") ? "ITEM_SIN_MAPEAR" : "RPC_ERROR";
          registrarError("delivery-accion", codigo, m);
          return json({ error: codigo }, 409);
        }
        try {
          await uber.aceptar(pedido.id_externo, segundosAReadyTime(new Date(), minutos), pedido.folio_corto ?? pedido.id);
          await registrarSalida("accept", true, { minutos });
        } catch (e) {
          await registrarSalida("accept", false, msg(e));
          if (!msg(e).startsWith("YA_PROCESADA")) { registrarError("delivery-accion", "UBER_ERROR", msg(e)); return json({ error: "UBER_ERROR" }, 502); }
        }
        return json({ ok: true, ticket_id: ticketId });
      }
      case "rechazar": {
        if (!["RECIBIDO", "ERROR"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        const motivo = MOTIVOS.includes(body.motivo as MotivoRechazo) ? (body.motivo as MotivoRechazo) : "OTRO";
        try {
          await uber.rechazar(pedido.id_externo, motivoRechazoUber(motivo, body.detalle));
          await registrarSalida("deny", true, { motivo });
        } catch (e) {
          await registrarSalida("deny", false, msg(e));
          if (!msg(e).startsWith("YA_PROCESADA")) { registrarError("delivery-accion", "UBER_ERROR", msg(e)); return json({ error: "UBER_ERROR" }, 502); }
        }
        await admin.rpc("delivery_pedido_transicion", {
          p_pedido_id: pedido.id, p_estado: "RECHAZADO", p_detalle: `${motivo}${body.detalle ? ": " + body.detalle : ""}`,
        });
        return json({ ok: true });
      }
      case "listo": {
        if (!["ACEPTADO", "EN_PREPARACION"].includes(pedido.estado)) return json({ error: "ACCION_INVALIDA", estado: pedido.estado }, 409);
        try {
          await uber.marcarLista(pedido.id_externo);
          await registrarSalida("ready", true, {});
        } catch (e) {
          await registrarSalida("ready", false, msg(e));
          registrarError("delivery-accion", "UBER_ERROR", msg(e));
          return json({ error: "UBER_ERROR" }, 502);
        }
        await admin.rpc("delivery_pedido_transicion", { p_pedido_id: pedido.id, p_estado: "LISTO", p_detalle: null });
        return json({ ok: true });
      }
      default:
        return json({ error: "ACCION_INVALIDA" }, 400);
    }
  } catch (e) {
    registrarError("delivery-accion", "INTERNO", msg(e));
    return json({ error: "INTERNO" }, 500);
  }
});
