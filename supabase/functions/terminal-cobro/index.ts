// Cobro con terminal desde la caja (ADR 0033). La llaman el POS web (JWT del empleado) y el puente
// de la caja instalada (token de dispositivo). Aquí se habla con Mercado Pago; la caja nunca ve un
// token. Esta función solo dice en qué va el cobro: el pago lo aplica la caja a su ticket.
//
// El negocio sale del token verificado; la caja, del dispositivo (o del cuerpo en web, validada
// contra el negocio). Un cobro solo lo consulta o cancela la caja que lo creó.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { cajaIdDeEmail } from "../_shared/dispositivo.ts";
import { registrarError, textoDeError } from "../_shared/errores.ts";
import { bearerDe, claimsDe, tenantDeClaims } from "../_shared/identidad.ts";
import { validarCuerpo } from "../_shared/terminal/cuerpo.ts";
import { aceptaCambio, cambiosDeCobro, clienteMp, datosDeOrden, type EstadoCobro } from "../_shared/terminal/mercado-pago.ts";

const admin = clienteAdmin();
// Sin aviso en este tiempo, se le pregunta a Mercado Pago (que pide no hacerlo seguido). Como la
// consulta sella updated_at, es a lo sumo una cada RESPALDO_MS por cobro.
const RESPALDO_MS = 15_000;
const CAMPOS = "id, caja_id, ticket_id, monto_mxn, estado, detalle, orden_id_externo, tipo_tarjeta, marca, mensualidades, referencia, pagado_mxn, aplicado_at, conexion_id, updated_at";

type Cobro = {
  id: string; caja_id: string; ticket_id: string; monto_mxn: number; estado: EstadoCobro; detalle: string | null;
  orden_id_externo: string | null; tipo_tarjeta: string | null; marca: string | null; mensualidades: number | null;
  referencia: string | null; pagado_mxn: number | null; aplicado_at: string | null; conexion_id: string; updated_at: string;
};

/** Lo que ve la caja: nada de ids internos de la conexión. */
const publico = ({ conexion_id: _c, updated_at: _u, caja_id: _k, ...c }: Cobro) => c;

async function tokenDe(conexionId: string): Promise<string | null> {
  const { data, error } = await admin.rpc("terminal_leer_tokens", { p_conexion: conexionId });
  if (error) throw error;
  return (data as { access_token: string | null }[] | null)?.[0]?.access_token ?? null;
}

/** Aplica al cobro lo que dice una order, respetando que lo que pasó en la terminal gana. */
async function aplicarOrden(cobro: Cobro, orden: unknown): Promise<Cobro> {
  const d = datosDeOrden(orden, cobro.orden_id_externo ?? undefined);
  // Si no se acepta el cambio igual se escribe (lo mismo), para sellar updated_at y espaciar el respaldo.
  const cambios = aceptaCambio(cobro.estado, d.estado) ? cambiosDeCobro(d) : { detalle: cobro.detalle };
  const { data, error } = await admin.from("terminal_cobros").update(cambios).eq("id", cobro.id).select(CAMPOS).single();
  if (error) throw error;
  return data as Cobro;
}

servir(async (req, json) => {
  try {
    // 1) Quién llama y de qué negocio (mismo patrón que lealtad-canje).
    const token = bearerDe(req);
    if (!token) return json({ error: "NO_AUTH" }, 401);
    const { data: userResp, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userResp?.user) return json({ error: "AUTH_INVALIDA" }, 401);
    const claims = claimsDe(token);
    const tenantId = tenantDeClaims(claims);
    if (!tenantId) return json({ error: "SIN_TENANT" }, 403);
    const { data: acceso } = await admin.from("usuarios_acceso").select("tenant_id")
      .eq("usuario_id", userResp.user.id).eq("tenant_id", tenantId).eq("activo", true).limit(1).maybeSingle();
    if (!acceso) return json({ error: "SIN_TENANT" }, 403);

    let crudo: unknown;
    try { crudo = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
    const v = validarCuerpo(crudo);
    if (!v.ok) return json({ error: v.error }, 400);
    const b = v.cuerpo;

    // 2) La caja: la del dispositivo; en web, la del cuerpo. Siempre del negocio, activa y no borrada.
    const esDispositivo = claims.tipo_identidad === "DISPOSITIVO";
    const cajaPedida = esDispositivo ? cajaIdDeEmail(userResp.user.email) : b.caja_id;
    const { data: caja } = cajaPedida
      ? await admin.from("cajas").select("id, sucursal_id")
        .eq("id", cajaPedida).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null).maybeSingle()
      : { data: null };
    if (!caja) return json({ error: "CAJA_NO_VALIDA" }, 403);
    const { id: cajaId, sucursal_id: sucursalId } = caja as { id: string; sucursal_id: string };

    if (b.accion === "pendientes") {
      const { data, error } = await admin.from("terminal_cobros").select(CAMPOS)
        .eq("tenant_id", tenantId).eq("caja_id", cajaId).eq("estado", "APROBADO").is("aplicado_at", null);
      if (error) throw error;
      return json({ ok: true, cobros: (data as Cobro[]).map(publico) });
    }

    const leer = async (): Promise<Cobro | null> => {
      const { data, error } = await admin.from("terminal_cobros").select(CAMPOS)
        .eq("id", b.cobro_id).eq("tenant_id", tenantId).eq("caja_id", cajaId).maybeSingle();
      if (error) throw error;
      return data as Cobro | null;
    };

    if (b.accion === "crear") {
      // Reintento de la caja con el mismo id: se contesta el cobro que ya existe, no se crea otro.
      const previo = await leer();
      if (previo) return json({ ok: true, cobro: publico(previo) });

      const { data: disp } = await admin.from("terminal_dispositivos").select("conexion_id, terminal_id_externo")
        .eq("caja_id", cajaId).eq("tenant_id", tenantId).eq("activa", true).maybeSingle();
      const d = disp as { conexion_id: string; terminal_id_externo: string | null } | null;
      if (!d?.terminal_id_externo) return json({ ok: false, error: "SIN_TERMINAL" }, 409);
      const { data: cfg } = await admin.from("terminal_config_sucursal").select("imprime_terminal, espera_segundos")
        .eq("sucursal_id", sucursalId).maybeSingle();
      const config = (cfg as { imprime_terminal: boolean; espera_segundos: number } | null) ?? { imprime_terminal: true, espera_segundos: 180 };
      const tokenMp = await tokenDe(d.conexion_id);
      if (!tokenMp) return json({ ok: false, error: "CONEXION_INVALIDA" }, 409);

      // El empleado: en web, quien se autenticó; desde una caja, el que manda su puente si es del negocio.
      let empleadoId: string | null = esDispositivo ? null : userResp.user.id;
      if (esDispositivo && b.usuario_id) {
        const { data: emp } = await admin.from("usuarios_acceso").select("usuario_id")
          .eq("usuario_id", b.usuario_id).eq("tenant_id", tenantId).eq("activo", true).limit(1).maybeSingle();
        if (emp) empleadoId = b.usuario_id;
      }

      // Primero la fila, luego Mercado Pago: si el aviso llega antes de que contestemos, ya hay a quién aplicarlo.
      const { data: nuevo, error: eIns } = await admin.from("terminal_cobros").insert({
        id: b.cobro_id, tenant_id: tenantId, sucursal_id: sucursalId, caja_id: cajaId, conexion_id: d.conexion_id,
        ticket_id: b.ticket_id, folio: b.folio, monto_mxn: b.monto, empleado_id: empleadoId,
      }).select(CAMPOS).single();
      if (eIns) throw eIns;

      const r = await clienteMp(tokenMp).crearOrden({
        cobroId: b.cobro_id, monto: b.monto, terminalId: d.terminal_id_externo,
        descripcion: b.folio ? `Ticket ${b.folio}` : "Cobro en caja",
        esperaSeg: config.espera_segundos, imprime: config.imprime_terminal,
      });
      if (r.status === 201 || r.status === 200) return json({ ok: true, cobro: publico(await aplicarOrden(nuevo as Cobro, r.cuerpo)) });

      // No se creó: el intento queda cerrado y la caja puede volver a intentar con otro id.
      const codigo = r.status === 401 ? "CONEXION_INVALIDA"
        : r.codigo === "already_queued_order_for_terminal" ? "TERMINAL_OCUPADA"
        : r.codigo === "forbidden_checking_terminal_owner" ? "TERMINAL_AJENA" : "NO_SE_PUDO_CREAR";
      registrarError("terminal-cobro", codigo, `HTTP ${r.status} ${r.codigo ?? ""}`);
      await admin.from("terminal_cobros").update({ estado: "RECHAZADO", detalle: codigo }).eq("id", b.cobro_id);
      if (r.status === 401) {
        await admin.from("terminal_conexiones").update({ estado: "ERROR", ultimo_error: "Mercado Pago rechazó el token" }).eq("id", d.conexion_id);
      }
      return json({ ok: false, error: codigo }, 409);
    }

    let cobro = await leer();
    if (!cobro) return json({ ok: false, error: "COBRO_NO_ENCONTRADO" }, 404);

    if (b.accion === "confirmar") {
      if (cobro.estado !== "APROBADO") return json({ ok: false, error: "COBRO_NO_APROBADO" }, 409);
      if (!cobro.aplicado_at) {
        const { error } = await admin.from("terminal_cobros").update({ aplicado_at: new Date().toISOString() }).eq("id", cobro.id);
        if (error) throw error;
      }
      return json({ ok: true });
    }

    if (cobro.estado === "EN_TERMINAL" && cobro.orden_id_externo) {
      const cancelar = b.accion === "cancelar";
      if (cancelar || Date.now() - Date.parse(cobro.updated_at) > RESPALDO_MS) {
        const tokenMp = await tokenDe(cobro.conexion_id);
        if (tokenMp) {
          const mp = clienteMp(tokenMp);
          const r = cancelar ? await mp.cancelarOrden(cobro.orden_id_externo) : await mp.consultarOrden(cobro.orden_id_externo);
          // 202 al cancelar = pedido, no hecho: el estado sigue EN_TERMINAL hasta el aviso (o el respaldo).
          if (r.status === 200) cobro = await aplicarOrden(cobro, r.cuerpo);
          else if (!cancelar || r.status !== 202) registrarError("terminal-cobro", cancelar ? "CANCELAR" : "CONSULTAR", `HTTP ${r.status} ${r.codigo ?? ""}`);
        }
      }
    }
    return json({ ok: true, cobro: publico(cobro) });
  } catch (e) {
    registrarError("terminal-cobro", "ERROR_INTERNO", textoDeError(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
