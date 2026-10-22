// Manda el ticket del cliente por correo («Enviar por correo» en «Cobro completado», cuando la caja
// no tiene impresora). La llaman el POS web (JWT del empleado) y el puente de la caja instalada
// (token de dispositivo), igual que terminal-cobro. El contenido son los renglones del ticket que la
// caja ya armó; la forma y el escape están en _shared/ticket-correo.ts. El correo del cliente no se
// guarda.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { enviarCorreo, soloAscii } from "../_shared/correo.ts";
import { registrarError } from "../_shared/errores.ts";
import { bearerDe, claimsDe, tenantDeClaims } from "../_shared/identidad.ts";
import { consumirCupos } from "../_shared/limite.ts";
import { cuposDeEnvio, htmlDeTicket, negocioPuedeEnviar, validarEnvioTicket } from "../_shared/ticket-correo.ts";

const admin = clienteAdmin();

servir(async (req, json) => {
  try {
    // 1) Quién llama y de qué negocio (mismo patrón que terminal-cobro y lealtad-canje).
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
    const v = validarEnvioTicket(crudo);
    if (!v.ok) return json({ error: v.error }, 400);
    const { correo, ticket_id, bloques } = v.cuerpo;

    // 2) El ticket es de este negocio. La caja instalada no se comprueba aquí: su ticket puede no
    //    haber subido aún, y el dispositivo ya está atado al negocio por su token.
    if (claims.tipo_identidad !== "DISPOSITIVO") {
      const { data: tk } = await admin.from("tickets").select("id")
        .eq("id", ticket_id).eq("tenant_id", tenantId).maybeSingle();
      if (!tk) return json({ error: "TICKET_NO_ENCONTRADO" }, 404);
    }

    // 3) Solo un negocio activo (o en prueba vigente) y sin bloqueo manda desde el buzón de VIM.
    const { data: tn } = await admin.from("tenants")
      .select("nombre_comercial, estado, deleted_at, bloqueo_desde, prueba_hasta").eq("id", tenantId).maybeSingle();
    const t = tn as { nombre_comercial: string | null; estado: string; deleted_at: string | null; bloqueo_desde: string | null; prueba_hasta: string | null } | null;
    if (!negocioPuedeEnviar(t, new Date())) return json({ ok: false, error: "NEGOCIO_INACTIVO" }, 403);
    const negocio = t?.nombre_comercial ?? "tu compra";

    // 4) Topes (por ticket, por negocio y global). Si la base no responde, no se envía: el buzón
    //    es el mismo de las altas y los avisos de VIM.
    const cupo = await consumirCupos(admin, cuposDeEnvio(tenantId, ticket_id), "cerrar");
    if (!cupo.permitido) {
      registrarError("enviar-ticket", "SIN_CUPO", `${cupo.motivo} (tenant ${tenantId}, ticket ${ticket_id})`);
      return json({ ok: false, error: "SIN_CUPO" }, 429);
    }

    const r = await enviarCorreo({ to: correo, subject: soloAscii(`Tu ticket de ${negocio}`), html: htmlDeTicket(bloques, negocio) });
    if (!r.enviado) {
      registrarError("enviar-ticket", "NO_ENVIADO", `${r.motivo} (tenant ${tenantId}, ticket ${ticket_id})`);
      return json({ ok: false, error: r.motivo === "SIN_SMTP" ? "SIN_CORREO" : "NO_ENVIADO" }, 502);
    }
    return json({ ok: true });
  } catch (e) {
    registrarError("enviar-ticket", "ERROR", e);
    return json({ ok: false, error: "ERROR" }, 500);
  }
});
