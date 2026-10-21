// Cobro con terminal desde la caja (ADR 0033). La llaman el POS web (JWT del empleado) y el puente
// de la caja instalada (token de dispositivo). Aquí se habla con el proveedor de la conexión (Mercado
// Pago o Clip, por _shared/terminal/proveedor.ts); la caja nunca ve un token. Esta función solo dice
// en qué va el cobro: el pago lo aplica la caja a su ticket.
//
// El negocio sale del token verificado; la caja, del dispositivo (o del cuerpo en web, validada
// contra el negocio). Un cobro solo lo consulta o cancela la caja que lo creó.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { cajaIdDeEmail } from "../_shared/dispositivo.ts";
import { registrarError, textoDeError } from "../_shared/errores.ts";
import { bearerDe, claimsDe, tenantDeClaims } from "../_shared/identidad.ts";
import { validarCuerpo } from "../_shared/terminal/cuerpo.ts";
import { aceptaCambio, cambiosDeCobro, type DatosCobro, type EstadoCobro } from "../_shared/terminal/comun.ts";
import { type Credencial, type NombreProveedor, type Proveedor, proveedorDe } from "../_shared/terminal/proveedor.ts";

const admin = clienteAdmin();
const BASE = Deno.env.get("SUPABASE_URL") ?? "";
const RECHAZO: Record<NombreProveedor, string> = { MERCADO_PAGO: "Mercado Pago rechazó el token", CLIP: "Clip rechazó la clave" };
// Sin aviso en este tiempo, se le pregunta al proveedor (Mercado Pago pide no hacerlo seguido). Como la
// consulta sella updated_at, es a lo sumo una cada RESPALDO_MS por cobro.
const RESPALDO_MS = 15_000;
const CAMPOS = "id, caja_id, ticket_id, monto_mxn, estado, detalle, orden_id_externo, tipo_tarjeta, marca, mensualidades, referencia, pagado_mxn, tarjeta_ultimos4, propina_mxn, aplicado_at, conexion_id, updated_at";

type Cobro = {
  id: string; caja_id: string; ticket_id: string; monto_mxn: number; estado: EstadoCobro; detalle: string | null;
  orden_id_externo: string | null; tipo_tarjeta: string | null; marca: string | null; mensualidades: number | null;
  referencia: string | null; pagado_mxn: number | null; tarjeta_ultimos4: string | null; aplicado_at: string | null; conexion_id: string; updated_at: string;
  /** La propina que el cliente eligió en el lector (Clip), aparte de `monto_mxn`. */
  propina_mxn: number | null;
};

type ConfigSucursal = { imprime_terminal: boolean; espera_segundos: number; propina_en_terminal: boolean; propina_opciones: number[] | null };

/** Los porcentajes que el lector le ofrece al cliente, o null si esa sucursal no pide la propina en el lector. Solo Clip. */
const propinasDelLector = (nombre: NombreProveedor | null | undefined, cfg: ConfigSucursal | null): number[] | null =>
  nombre === "CLIP" && cfg?.propina_en_terminal && cfg.propina_opciones?.length ? cfg.propina_opciones : null;

async function configDeSucursal(sucursalId: string): Promise<ConfigSucursal | null> {
  const { data, error } = await admin.from("terminal_config_sucursal")
    .select("imprime_terminal, espera_segundos, propina_en_terminal, propina_opciones").eq("sucursal_id", sucursalId).maybeSingle();
  if (error) throw error;
  return data as ConfigSucursal | null;
}

/** Lo que ve la caja: nada de ids internos de la conexión. */
const publico = ({ conexion_id: _c, updated_at: _u, caja_id: _k, ...c }: Cobro) => c;

async function nombreDeConexion(conexionId: string): Promise<NombreProveedor> {
  const { data, error } = await admin.from("terminal_conexiones").select("proveedor").eq("id", conexionId).single();
  if (error) throw error;
  return (data as { proveedor: NombreProveedor }).proveedor;
}

/** El proveedor de una conexión con su credencial de Vault; `prov` es null si falta la credencial. */
async function proveedorDeConexion(conexionId: string, nombre?: NombreProveedor): Promise<{ nombre: NombreProveedor; prov: Proveedor | null }> {
  nombre ??= await nombreDeConexion(conexionId);
  const { data, error } = await admin.rpc("terminal_leer_tokens", { p_conexion: conexionId });
  if (error) throw error;
  const cred = (data as Credencial[] | null)?.[0] ?? { access_token: null, refresh_token: null };
  return { nombre, prov: proveedorDe(nombre, cred, BASE) };
}

/** Aplica al cobro lo que dijo el proveedor, respetando que lo que pasó en la terminal gana. */
async function aplicarDatos(cobro: Cobro, d: DatosCobro): Promise<Cobro> {
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

    if (b.accion === "reembolsar") {
      // El dinero solo regresa si VIM ya tiene la devolución CONFIRMADA de ese ticket «al mismo
      // método» (que es la que pide el PIN). Una caja instalada lo comprueba en su propia base antes
      // de reenviar (gateway.mjs): su ticket puede no haber subido. El POS web se comprueba aquí.
      if (!esDispositivo) {
        const { data: dev } = await admin.from("devoluciones").select("id")
          .eq("tenant_id", tenantId).eq("ticket_original_id", b.ticket_id)
          .eq("estado", "CONFIRMADA").eq("medio_devolucion", "MISMO_METODO_PAGO").limit(1).maybeSingle();
        if (!dev) return json({ ok: false, error: "SIN_DEVOLUCION" }, 409);
      }
      // `pago_id_externo` solo aquí (Clip devuelve por transacción): no se le manda a la caja.
      const { data: lista, error: eL } = await admin.from("terminal_cobros").select(`${CAMPOS}, pago_id_externo`)
        .eq("tenant_id", tenantId).eq("sucursal_id", sucursalId).eq("ticket_id", b.ticket_id)
        .in("estado", ["APROBADO", "DEVUELTO"]).not("orden_id_externo", "is", null);
      if (eL) throw eL;
      let devuelto = 0;
      const fallos: string[] = [];
      for (const c of (lista ?? []) as (Cobro & { pago_id_externo: string | null })[]) {
        if (c.estado === "DEVUELTO") { devuelto += Number(c.monto_mxn); continue; } // ya estaba: repetir no devuelve dos veces
        const { prov } = await proveedorDeConexion(c.conexion_id);
        const r = prov
          ? await prov.reembolsar({ ordenId: c.orden_id_externo!, pagoId: c.pago_id_externo, monto: Number(c.monto_mxn).toFixed(2) })
          : { ok: false as const, motivo: "CONEXION_INVALIDA" };
        if (r.ok) {
          const { error } = await admin.from("terminal_cobros")
            .update({ estado: "DEVUELTO", detalle: "refunded", reembolsado_mxn: c.monto_mxn }).eq("id", c.id);
          if (error) throw error;
          devuelto += Number(c.monto_mxn);
        } else {
          registrarError("terminal-cobro", "REEMBOLSO", `${c.id}: ${r.motivo}`);
          fallos.push(r.motivo);
        }
      }
      // `n_cobros`: cuántos pagos de ese ticket pasaron por la terminal. Cero = no hay nada que devolver aquí.
      return json({ ok: fallos.length === 0, n_cobros: (lista ?? []).length, devuelto_mxn: devuelto.toFixed(2), ...(fallos.length ? { error: fallos[0] } : {}) },
        fallos.length ? 409 : 200);
    }

    if (b.accion === "disponible") {
      // ¿Esta caja le puede mandar cobros a una terminal? La caja instalada no tiene estas tablas
      // con datos (viven en la nube), así que lo pregunta aquí al abrir el cobro.
      // `lista`: el lector puede recibir el cobro ahora (Clip lo pregunta; Mercado Pago, siempre).
      const { data } = await admin.from("terminal_dispositivos").select("conexion_id, terminal_id_externo")
        .eq("caja_id", cajaId).eq("tenant_id", tenantId).eq("activa", true).not("terminal_id_externo", "is", null).maybeSingle();
      const disp = data as { conexion_id: string; terminal_id_externo: string } | null;
      if (!disp) return json({ ok: true, terminal: false, lista: false, proveedor: null, propina_en_lector: false });
      // Un tropiezo al leer la conexión o sin credencial no tapa la terminal (antes ni se leía): crear
      // dirá CONEXION_INVALIDA, como siempre.
      // Mercado Pago siempre está listo: no se lee Vault.
      // `propina_en_lector`: el lector de Clip le pregunta la propina al cliente (Mercado Pago, nunca).
      const p = await (async () => {
        const nombre = await nombreDeConexion(disp.conexion_id);
        if (nombre === "MERCADO_PAGO") return { nombre, lista: true, propina: false };
        const { prov } = await proveedorDeConexion(disp.conexion_id, nombre);
        return {
          nombre, lista: prov ? await prov.lectorListo(disp.terminal_id_externo) : true,
          propina: propinasDelLector(nombre, await configDeSucursal(sucursalId).catch(() => null)) !== null,
        };
      })().catch((e) => { registrarError("terminal-cobro", "DISPONIBLE", textoDeError(e)); return null; });
      return json({ ok: true, terminal: true, lista: p?.lista ?? true, proveedor: p?.nombre ?? null, propina_en_lector: p?.propina ?? false });
    }

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
      // Como antes: si no se puede leer, se cobra con lo de siempre (y sin propina en el lector).
      const cfg = await configDeSucursal(sucursalId).catch(() => null);
      const config = cfg ?? { imprime_terminal: true, espera_segundos: 180 };
      const { nombre: proveedor, prov } = await proveedorDeConexion(d.conexion_id);
      if (!prov) return json({ ok: false, error: "CONEXION_INVALIDA" }, 409);

      // El empleado: en web, quien se autenticó; desde una caja, el que manda su puente si es del negocio.
      let empleadoId: string | null = esDispositivo ? null : userResp.user.id;
      if (esDispositivo && b.usuario_id) {
        const { data: emp } = await admin.from("usuarios_acceso").select("usuario_id")
          .eq("usuario_id", b.usuario_id).eq("tenant_id", tenantId).eq("activo", true).limit(1).maybeSingle();
        if (emp) empleadoId = b.usuario_id;
      }

      // Primero la fila, luego el proveedor: si el aviso llega antes de que contestemos, ya hay a quién aplicarlo.
      const { data: nuevo, error: eIns } = await admin.from("terminal_cobros").insert({
        id: b.cobro_id, tenant_id: tenantId, sucursal_id: sucursalId, caja_id: cajaId, conexion_id: d.conexion_id,
        ticket_id: b.ticket_id, folio: b.folio, monto_mxn: b.monto, empleado_id: empleadoId,
      }).select(CAMPOS).single();
      // Dos «crear» con el mismo id casi a la vez: el segundo choca con la fila del primero. No es un
      // error: se contesta ese cobro (quizá aún sin orden) y la caja sigue preguntando por él.
      if (eIns && String((eIns as { code?: string }).code) === "23505") {
        const gemelo = await leer();
        if (gemelo) return json({ ok: true, cobro: publico(gemelo) });
      }
      if (eIns) throw eIns;

      const r = await prov.crear({
        cobroId: b.cobro_id, monto: b.monto, terminal: d.terminal_id_externo, folio: b.folio,
        esperaSeg: config.espera_segundos, imprime: config.imprime_terminal,
        // Solo si la caja lo pide Y es Clip Y la sucursal lo tiene encendido con porcentajes.
        propinas: b.propina_en_lector ? propinasDelLector(proveedor, cfg) : null,
      });
      if (r.ok) return json({ ok: true, cobro: publico(await aplicarDatos(nuevo as Cobro, r.datos)) });

      // No se creó (o Clip no contestó: SIN_RESPUESTA, ya cancelado en el lector): el intento queda
      // cerrado y la caja puede volver a intentar con otro id. El proveedor ya dejó el log.
      await admin.from("terminal_cobros").update({ estado: "RECHAZADO", detalle: r.codigo }).eq("id", b.cobro_id);
      if (r.codigo === "CONEXION_INVALIDA") {
        await admin.from("terminal_conexiones").update({ estado: "ERROR", ultimo_error: RECHAZO[proveedor] }).eq("id", d.conexion_id);
      }
      return json({ ok: false, error: r.codigo }, 409);
    }

    let cobro = await leer();
    if (!cobro) return json({ ok: false, error: "COBRO_NO_ENCONTRADO" }, 404);

    if (b.accion === "confirmar") {
      // Un cobro en REVISAR solo se da por bueno a mano, y queda escrito quién lo autorizó con su PIN
      // (la caja ya validó el PIN; aquí se comprueba que esa persona es de este negocio).
      let aMano: string | null = null;
      if (cobro.estado === "REVISAR" && b.autorizo_id) {
        const { data: quien } = await admin.from("usuarios_acceso").select("usuario_id")
          .eq("usuario_id", b.autorizo_id).eq("tenant_id", tenantId).eq("activo", true).limit(1).maybeSingle();
        if (quien) aMano = b.autorizo_id;
      }
      if (cobro.estado !== "APROBADO" && !aMano) return json({ ok: false, error: "COBRO_NO_APROBADO" }, 409);
      if (!cobro.aplicado_at) {
        const { error } = await admin.from("terminal_cobros")
          .update({ aplicado_at: new Date().toISOString(), ...(aMano ? { confirmado_a_mano_por: aMano } : {}) }).eq("id", cobro.id);
        if (error) throw error;
      }
      return json({ ok: true });
    }

    // Al cancelar se dice además qué pasó con la petición: HECHA, PEDIDA (falta el aviso) o FALLO.
    let cancelacion: "HECHA" | "PEDIDA" | "FALLO" | undefined;
    if (cobro.estado === "EN_TERMINAL" && cobro.orden_id_externo) {
      const cancelar = b.accion === "cancelar";
      if (cancelar || Date.now() - Date.parse(cobro.updated_at) > RESPALDO_MS) {
        const { prov } = await proveedorDeConexion(cobro.conexion_id);
        if (prov) {
          // PEDIDA = pedido, no hecho: el estado sigue EN_TERMINAL hasta el aviso (o el respaldo).
          let datos: DatosCobro | null;
          if (cancelar) ({ cancelacion, datos } = await prov.cancelar(cobro.orden_id_externo));
          else datos = await prov.consultar(cobro.orden_id_externo);
          if (datos) cobro = await aplicarDatos(cobro, datos);
        }
      }
    }
    return json({ ok: true, cobro: publico(cobro), ...(cancelacion ? { cancelacion } : {}) });
  } catch (e) {
    registrarError("terminal-cobro", "ERROR_INTERNO", textoDeError(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
