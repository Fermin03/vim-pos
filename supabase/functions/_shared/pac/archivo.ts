// Archivo de comprobantes: dónde y cómo se guardan el XML, el PDF y el acuse de cada CFDI.
//
// En Multiemisor, Facturama no es nuestro archivo: el comprobante se puede volver a bajar por su
// referencia, pero nada garantiza por cuánto tiempo, y el cliente tiene derecho a su XML aunque
// cambiemos de PAC. Por eso, al timbrar, los archivos se bajan y se guardan en el bucket privado
// `cfdi` (migración 0098). Nadie lee ese bucket desde el navegador: los sirve `descargar-cfdi`
// tras comprobar que quien pide es del negocio.
//
// Módulo puro: la subida se inyecta, así se prueba con `node --test` sin Deno ni Supabase.

export type TipoArchivoCfdi = "xml" | "pdf" | "acuse";

export const BUCKET_CFDI = "cfdi";

/** Bucket, nombre de objeto, tipo MIME y la ruta lógica que se guarda en `tickets_cfdi`. */
export function rutaArchivoCfdi(cfdiId: string, tipo: TipoArchivoCfdi): {
  bucket: string;
  nombre: string;
  contentType: string;
  rutaLogica: string;
} {
  const nombre = tipo === "acuse" ? `${cfdiId}-acuse.xml` : `${cfdiId}.${tipo}`;
  return {
    bucket: BUCKET_CFDI,
    nombre,
    contentType: tipo === "pdf" ? "application/pdf" : "application/xml",
    rutaLogica: `${BUCKET_CFDI}/${nombre}`,
  };
}

/** "cfdi/<id>.xml" (lo que hay en `tickets_cfdi.*_storage_path`) → bucket y nombre de objeto. */
export function partirRutaLogica(ruta: string | null | undefined): { bucket: string; nombre: string } | null {
  const t = (ruta ?? "").trim();
  const i = t.indexOf("/");
  if (i <= 0 || i === t.length - 1) return null;
  return { bucket: t.slice(0, i), nombre: t.slice(i + 1) };
}

export function base64ABytes(b64: string): Uint8Array {
  const bin = atob(b64.replace(/\s+/g, ""));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Sin `String.fromCharCode(...bytes)`: con un PDF de 60 KB revienta la pila de argumentos. */
export function bytesABase64(bytes: Uint8Array): string {
  let bin = "";
  const paso = 0x8000;
  for (let i = 0; i < bytes.length; i += paso) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + paso)));
  }
  return btoa(bin);
}

/** Sube un objeto; devuelve `null` si quedó guardado o el mensaje de error si no. */
export type Subidor = (bucket: string, nombre: string, bytes: Uint8Array, contentType: string) => Promise<string | null>;

/**
 * Guarda los archivos que vengan (en base64). Nunca lanza: el CFDI ya existe ante el SAT y un
 * archivo que no se pudo guardar se repone después desde el PAC (`descargar-cfdi`).
 */
export async function archivarCfdi(
  cfdiId: string,
  contenidos: Partial<Record<TipoArchivoCfdi, string | null | undefined>>,
  subir: Subidor,
): Promise<{ guardados: TipoArchivoCfdi[]; errores: string[] }> {
  const guardados: TipoArchivoCfdi[] = [];
  const errores: string[] = [];
  for (const tipo of ["xml", "pdf", "acuse"] as const) {
    const b64 = contenidos[tipo];
    if (!b64) continue;
    const r = rutaArchivoCfdi(cfdiId, tipo);
    try {
      const err = await subir(r.bucket, r.nombre, base64ABytes(b64), r.contentType);
      if (err === null) guardados.push(tipo);
      else errores.push(`${tipo}: ${err}`);
    } catch (e) {
      errores.push(`${tipo}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { guardados, errores };
}

/** Lo mínimo del cliente de Supabase que hace falta, para no atar el módulo al SDK. */
type ClienteStorage = {
  storage: {
    from(bucket: string): {
      upload(
        nombre: string,
        datos: Uint8Array,
        opciones: { contentType: string; upsert: boolean },
      ): Promise<{ error: { message: string } | null }>;
    };
  };
};

/** Subidor real, con el cliente de service_role (el bucket no tiene políticas para usuarios). */
export function subidorSupabase(cliente: ClienteStorage): Subidor {
  return async (bucket, nombre, bytes, contentType) => {
    const { error } = await cliente.storage.from(bucket).upload(nombre, bytes, { contentType, upsert: true });
    return error ? error.message : null;
  };
}
