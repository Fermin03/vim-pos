// Edge Function: buscar-clave-sat — busca claves del catálogo del SAT (c_ClaveProdServ) en
// Facturama para el formulario de producto del admin. Solo para usuarios con sesión: el PAC cobra
// por cuenta, no por consulta, pero no se deja abierto a internet.
//
// Entrada: { texto }   Salida: { ok: true, claves: [{ clave, descripcion }] }
import { clienteDe, servir } from "../_shared/http.ts";
import { bearerDe } from "../_shared/identidad.ts";
import { obtenerFacturama } from "../_shared/pac/index.ts";

servir(async (req, json) => {
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH", mensaje: "Tu sesión venció; vuelve a entrar." }, 401);
  const { data: u, error } = await clienteDe(token).auth.getUser(token);
  if (error || !u?.user) return json({ error: "AUTH_INVALIDA", mensaje: "Tu sesión venció; vuelve a entrar." }, 401);

  let body: { texto?: unknown };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON", mensaje: "Solicitud inválida." }, 400); }
  const texto = String(body.texto ?? "").trim().slice(0, 60);
  if (texto.length < 3) return json({ error: "TEXTO_CORTO", mensaje: "Escribe al menos 3 letras" }, 400);

  const pac = obtenerFacturama();
  if (!pac) return json({ error: "PAC_NO_CONFIGURADO", mensaje: "La búsqueda de claves del SAT no está disponible; escribe la clave a mano." }, 503);
  try {
    return json({ ok: true, claves: await pac.buscarClavesSat(texto) });
  } catch (e) {
    console.error(`[buscar-clave-sat] ${e instanceof Error ? e.message : e}`);
    return json({ error: "PAC_ERROR", mensaje: "El catálogo del SAT no respondió; intenta de nuevo" }, 502);
  }
});
