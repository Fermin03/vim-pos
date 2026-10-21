// Edge Function: descargar-cfdi — entrega el XML, el PDF o el acuse de un comprobante del negocio.
//
// El bucket `cfdi` es privado y sin políticas: el navegador no lo lee. Aquí se comprueba, con el
// JWT del llamante y bajo RLS, que el CFDI es de su negocio, y solo entonces se lee el archivo con
// service_role. Si el archivo no está (los primeros comprobantes se timbraron antes de que se
// archivara nada), se baja del PAC por su referencia, se guarda y se entrega: el archivo se
// repone solo.
//
// Entrada:  { cfdi_id, formato: "xml" | "pdf" | "acuse" }
// Salida:   { ok: true, formato, content_type, nombre, base64 }
import { clienteAdmin, clienteDe, servir } from "../_shared/http.ts";
import { bearerDe } from "../_shared/identidad.ts";
import { obtenerFacturama } from "../_shared/pac/index.ts";
import { archivarCfdi, bytesABase64, objetoArchivoCfdi, rutaArchivoCfdi, subidorSupabase, type TipoArchivoCfdi } from "../_shared/pac/archivo.ts";

const FORMATOS: TipoArchivoCfdi[] = ["xml", "pdf", "acuse"];

servir(async (req, json) => {
  const token = bearerDe(req);
  if (!token) return json({ error: "NO_AUTH" }, 401);

  const sb = clienteDe(token);
  const { data: u, error: uErr } = await sb.auth.getUser(token);
  if (uErr || !u?.user) return json({ error: "AUTH_INVALIDA" }, 401);

  let body: { cfdi_id?: string; formato?: string };
  try { body = await req.json(); } catch { return json({ error: "BAD_JSON" }, 400); }
  const cfdiId = String(body.cfdi_id ?? "").trim();
  const formato = String(body.formato ?? "").trim() as TipoArchivoCfdi;
  if (!/^[0-9a-f-]{36}$/i.test(cfdiId)) return json({ error: "FALTA_CFDI_ID" }, 400);
  if (!FORMATOS.includes(formato)) return json({ error: "FORMATO_INVALIDO" }, 400);

  // Bajo RLS: si no es de su negocio, no existe.
  const { data: cfdi, error: cErr } = await sb
    .from("tickets_cfdi")
    .select("id, estado_sat, uuid_fiscal, pac_proveedor, pac_referencia")
    .eq("id", cfdiId)
    .maybeSingle();
  if (cErr) return json({ error: "RLS_ERROR", detalle: cErr.message }, 500);
  if (!cfdi) return json({ error: "NO_ENCONTRADO" }, 404);
  const c = cfdi as {
    estado_sat: string; uuid_fiscal: string | null; pac_proveedor: string | null; pac_referencia: string | null;
  };
  if (!c.uuid_fiscal) return json({ error: "SIN_TIMBRAR", mensaje: "Este comprobante no está timbrado" }, 409);

  const admin = clienteAdmin();
  const ruta = rutaArchivoCfdi(cfdiId, formato);
  // El objeto se deriva del id, NO de `*_storage_path`: esa columna la podía reescribir cualquier
  // usuario del tenant y aquí se lee con service_role — era leer cualquier objeto de cualquier
  // bucket (auditoría 30/09/2026, C1-3). Todas las rutas guardadas siempre fueron estas.
  const guardada = objetoArchivoCfdi(cfdiId, formato);
  if (!guardada) return json({ error: "FALTA_CFDI_ID" }, 400);
  const nombre = `${formato === "acuse" ? "acuse" : "factura"}-${c.uuid_fiscal}.${formato === "pdf" ? "pdf" : "xml"}`;

  // 1) Del archivo, si está.
  const { data: blob } = await admin.storage.from(guardada.bucket).download(guardada.nombre);
  if (blob) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return json({ ok: true, formato, content_type: ruta.contentType, nombre, base64: bytesABase64(bytes) });
  }

  // 2) Del PAC, y de paso se archiva. El acuse no se repone así: `descargarAcuse` devuelve el
  //    propio CFDI cuando no hay acuse, y servir eso como acuse sería mentir.
  if (formato === "acuse") return json({ error: "SIN_ACUSE", mensaje: "Todavía no hay acuse de cancelación" }, 404);
  if (c.pac_proveedor !== "FACTURAMA" || !c.pac_referencia) {
    return json({ error: "SIN_ARCHIVO", mensaje: "El archivo no está guardado y este comprobante no se puede volver a pedir al PAC" }, 404);
  }
  const pac = obtenerFacturama();
  if (!pac) return json({ error: "PAC_NO_CONFIGURADO" }, 503);
  const b64 = await pac.descargar(c.pac_referencia, formato);
  if (!b64) return json({ error: "PAC_SIN_ARCHIVO", mensaje: "El PAC no devolvió el archivo" }, 502);
  const r = await archivarCfdi(cfdiId, { [formato]: b64 }, subidorSupabase(admin));
  if (r.errores.length) console.error(`[descargar-cfdi] ${cfdiId} repuesto del PAC pero sin archivar: ${r.errores.join("; ")}`);
  return json({ ok: true, formato, content_type: ruta.contentType, nombre, base64: b64, repuesto: true });
});
