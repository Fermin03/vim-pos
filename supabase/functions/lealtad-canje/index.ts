// Entrada única del saldo y del canje de lealtad (ADR 0030). La nube es la única que autoriza un
// canje. La llaman el POS web (JWT del empleado) y el puente de la caja (token de dispositivo).
//
// Qué decide el llamante y qué no: el negocio sale del token verificado, el empleado de la sesión
// (web) o del puente validado contra el negocio (caja), la caja y la sucursal de la identidad del
// dispositivo. En `asentar` el navegador solo aporta canje, ticket y renglón; puntos, monto, cliente,
// teléfono y premio son los que autorizó la nube (lealtad_canje_datos).
//
// Los errores de SQL no salen de aquí: van al log (registrarError) y el cliente recibe ERROR_INTERNO.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { cajaIdDeEmail } from "../_shared/dispositivo.ts";
import { registrarError, textoDeError } from "../_shared/errores.ts";
import { bearerDe, claimsDe, tenantDeClaims } from "../_shared/identidad.ts";
import {
  codigoDeAsentar, moduloLealtadActivo, payloadAsentar, usuarioDelCanje, validarCuerpo, validarVinculoDelCanje,
} from "../_shared/lealtad/cuerpo.ts";

const admin = clienteAdmin();

type Resultado = { ok?: boolean; error?: string } & Record<string, unknown>;

servir(async (req, json) => {
  try {
    // 1) Quién llama y de qué negocio (mismo patrón que delivery-accion).
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

    // Un dispositivo ES una caja: su id sale de su correo y tiene que estar en regla (misma comprobación
    // que sync-push: del negocio, activa y no borrada). La sucursal sale de la caja, no del cuerpo.
    const esDispositivo = claims.tipo_identidad === "DISPOSITIVO";
    let caja: { id: string; sucursal_id: string } | null = null;
    if (esDispositivo) {
      const cid = cajaIdDeEmail(userResp.user.email);
      if (cid) {
        const { data: c } = await admin.from("cajas").select("id, sucursal_id")
          .eq("id", cid).eq("tenant_id", tenantId).eq("activa", true).is("deleted_at", null).maybeSingle();
        caja = (c as { id: string; sucursal_id: string } | null) ?? null;
      }
      if (!caja) return json({ error: "CAJA_NO_VALIDA" }, 403);
    }

    // 2) Cuerpo.
    let crudo: unknown;
    try { crudo = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
    const v = validarCuerpo(crudo);
    if (!v.ok) return json({ error: v.error }, 400);
    const b = v.cuerpo;

    // 3) El módulo, encendido de verdad (add-on Y interruptor).
    const { data: mod } = await admin.rpc("modulos_efectivos", { p_tenant: tenantId });
    if (!moduloLealtadActivo(mod)) return json({ error: "SIN_MODULO_LEALTAD" }, 403);

    // El empleado: en web, quien se autenticó; desde una caja, el que manda su puente si es del negocio.
    let delCuerpoEsDelNegocio = false;
    if (esDispositivo && b.usuario_id) {
      const { data: emp } = await admin.from("usuarios_acceso").select("usuario_id")
        .eq("usuario_id", b.usuario_id).eq("tenant_id", tenantId).eq("activo", true).limit(1).maybeSingle();
      delCuerpoEsDelNegocio = Boolean(emp);
    }
    const usuarioId = usuarioDelCanje({
      esDispositivo, autenticadoId: userResp.user.id, delCuerpo: b.usuario_id, delCuerpoEsDelNegocio,
    });
    const responder = (r: Resultado | null) => (r?.ok ? json(r) : json(r ?? { ok: false, error: "SIN_RESPUESTA" }, 409));

    if (b.accion === "saldo") {
      const { data, error } = await admin.rpc("lealtad_saldo", {
        p_tenant: tenantId, p_cliente_id: b.cliente_id ?? null, p_telefono: b.telefono ?? null,
      });
      if (error) throw error;
      return responder(data as Resultado);
    }

    if (b.accion === "canjear") {
      // Sucursal: la de la caja del dispositivo; en web, la del cuerpo solo si es de este negocio.
      let sucursalId: string | null = caja?.sucursal_id ?? null;
      if (!caja && b.sucursal_id) {
        const { data: s } = await admin.from("sucursales").select("id")
          .eq("id", b.sucursal_id).eq("tenant_id", tenantId).maybeSingle();
        sucursalId = s ? b.sucursal_id : null;
      }
      const { data, error } = await admin.rpc("lealtad_canjear", {
        p_canje_id: b.canje_id, p_tenant: tenantId,
        p_cliente_id: b.cliente_id ?? null, p_telefono: b.telefono ?? null,
        p_puntos: b.puntos ?? null, p_premio_id: b.premio_id ?? null, p_ticket_id: b.ticket_id ?? null,
        p_sucursal_id: sucursalId, p_caja_id: caja?.id ?? null,
        p_usuario_id: usuarioId,
      });
      if (error) throw error;
      return responder(data as Resultado);
    }

    // asentar. Desde una caja esta acción es solo una CONSULTA: el ticket vive en su Postgres y lo
    // asienta el puente con estos datos. Desde el POS web el ticket vive aquí y se asienta aquí.
    const { data: datos, error: e1 } = await admin.rpc("lealtad_canje_datos", { p_canje_id: b.canje_id, p_tenant: tenantId });
    if (e1) throw e1;
    const canje = datos as Resultado;
    if (!canje?.ok) return responder(canje);
    // El canje es de ESTA cuenta y de ESTA caja (o de la web, sin caja); si no, no se entrega ni se asienta.
    const vinculo = validarVinculoDelCanje({ canje, ticketIdPedido: b.ticket_id!, cajaDispositivoId: caja?.id ?? null });
    if (!vinculo.ok) return json({ ok: false, error: vinculo.error }, 409);
    if (esDispositivo) return json(canje);

    const { error: e2 } = await admin.rpc("lealtad_asentar_canje", {
      p: payloadAsentar(canje, {
        tenantId, ticketId: b.ticket_id!, ticketItemId: b.ticket_item_id ?? null, usuarioId,
      }),
    });
    if (e2) {
      const codigo = codigoDeAsentar(e2.message);
      if (codigo) return json({ ok: false, error: codigo }, 409);
      throw e2;
    }
    return json({ ok: true, canje_id: b.canje_id });
  } catch (e) {
    registrarError("lealtad-canje", "ERROR_INTERNO", textoDeError(e));
    return json({ error: "ERROR_INTERNO" }, 500);
  }
});
