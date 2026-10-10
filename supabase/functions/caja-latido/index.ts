// Edge Function: caja-latido  (ADR 0014, entrega 2)
// La caja llama cada ~10 minutos, haya o no ventas: sella que está viva, reporta su versión y
// recibe las DIRECTIVAS que debe obedecer (acceso con gracia, módulos efectivos, límites).
//
// Llamada: POST /functions/v1/caja-latido  (Authorization: Bearer <JWT del dispositivo>)
//   body: { version?, so?, avisos_vistos?: uuid[] }   ← avisos_vistos: acuses de lectura (0106)
// Respuesta: { directivas }
import { clienteAdmin, servir } from "../_shared/http.ts";
import { bearerDe, claimsDe } from "../_shared/identidad.ts";
import { registrarError } from "../_shared/errores.ts";
import { cajaIdDeEmail, validarCuerpo } from "../_shared/latido.ts";

const admin = clienteAdmin();

// getUser sigue aquí a propósito: el porqué está en sync-pull.

/** Primera IP de x-forwarded-for. Solo se guarda para soporte. */
function ipDe(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  const ip = fwd ? fwd.split(",")[0]!.trim() : req.headers.get("x-real-ip");
  return ip && /^[0-9a-f.:]+$/i.test(ip) ? ip : null;
}

servir(async (req, json) => {
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);
  const { data: u, error: uErr } = await admin.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  const claims = claimsDe(token);
  if (claims.tipo_identidad !== "DISPOSITIVO") return json({ error: "NO_ES_DISPOSITIVO" }, 403);

  // El caja_id sale del correo del dispositivo, NUNCA del cuerpo: si viniera de fuera, una caja
  // podría sellar el latido de otra y, peor, leer sus directivas.
  const cajaId = cajaIdDeEmail(u.user.email);
  if (!cajaId) return json({ error: "DISPOSITIVO_SIN_CAJA" }, 403);

  const cuerpo = validarCuerpo(await req.json().catch(() => ({})));

  const { data, error } = await admin.rpc("caja_latido", {
    p_caja: cajaId,
    p_version: cuerpo.version,
    p_so: cuerpo.so,
    p_ip: ipDe(req),
    // Acuses de los avisos que el cajero cerró (ADR 0014, entrega 3). Van en el latido y no en
    // una llamada propia para que un aviso leído sin internet no se pierda: la caja los guarda
    // y los reporta cuando puede.
    p_avisos_vistos: cuerpo.avisos_vistos.length > 0 ? cuerpo.avisos_vistos : null,
    // Pantalla de la caja (0121). Las cajas anteriores a 0.4.87 no la mandan: va null y la base
    // conserva lo último que se supo.
    p_pantalla_ancho: cuerpo.pantalla?.ancho ?? null,
    p_pantalla_alto: cuerpo.pantalla?.alto ?? null,
    p_pantalla_escala: cuerpo.pantalla?.escala ?? null,
  });
  if (error) { registrarError("caja-latido", "RPC_ERROR", error); return json({ error: "RPC_ERROR" }, 500); }
  // La caja fue borrada o desactivada mientras seguía encendida: que lo sepa con un código
  // propio, en vez de un 500 que parecería un problema de la nube.
  if (!data) return json({ error: "CAJA_NO_EXISTE" }, 404);

  return json({ directivas: data });
});
