// Manda el ticket del cliente por correo («Enviar por correo» en «Cobro completado», cuando la caja
// no tiene impresora). La llaman el POS web (JWT del empleado) y el puente de la caja instalada
// (token de dispositivo), igual que terminal-cobro. El contenido son los renglones del ticket que la
// caja ya armó; la forma y el escape están en _shared/ticket-correo.ts. El correo del cliente no se
// guarda.
import { clienteAdmin, servir } from "../_shared/http.ts";
import { enviarCorreo, soloAscii } from "../_shared/correo.ts";
import { registrarError } from "../_shared/errores.ts";
import { bearerDe, claimsDe, tenantDeClaims } from "../_shared/identidad.ts";
import { htmlDeTicket, validarEnvioTicket } from "../_shared/ticket-correo.ts";

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
    // ponytail: sin tope de envíos por negocio; hace falta una sesión de empleado o de caja de un
    // negocio activo. Si se abusa, contar envíos por tenant en una tabla.

    const { data: tn } = await admin.from("tenants").select("nombre_comercial").eq("id", tenantId).maybeSingle();
    const negocio = (tn as { nombre_comercial: string | null } | null)?.nombre_comercial ?? "tu compra";

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
