// El instalador de la caja que se ofrece en Configuración → Cajas → Descargar (0142).
//
// La fuente de verdad es el mismo `latest.json` público que lee el actualizador de las cajas: lo
// que se descarga aquí es exactamente lo que una caja ya instalada recibiría. Sin servidor ni
// sesión: el archivo es público. Funciones puras + una lectura con tiempo límite.
import { z } from "zod";

export const MANIFIESTO_URL =
  "https://pbiaxzvmssjsxdwqrumb.supabase.co/storage/v1/object/public/actualizaciones/latest.json";

/** Si el manifiesto no responde: la página de la última versión publicada en GitHub.
 *  Los instaladores viven en un repo público aparte (`vim-pos-descargas`): el del código es privado
 *  desde el 1 oct 2026 y sus releases responden 404 a quien no inició sesión. */
export const RESPALDO_URL = "https://github.com/Fermin03/vim-pos-descargas/releases/latest";

export type Instalador = { version: string; url: string; fecha: string | null };

// Solo se ofrece un .exe de NUESTRAS releases de GitHub (el mismo prefijo que exige /versiones,
// PLATFORM_RELEASES_PREFIX) o de nuestro Storage, por https. En github.com publica cualquiera: un
// manifiesto manipulado no puede convertir este botón en la descarga del binario de otro.
const PREFIJOS_PERMITIDOS = [
  "https://github.com/Fermin03/vim-pos-descargas/releases/download/",
  "https://pbiaxzvmssjsxdwqrumb.supabase.co/storage/v1/object/public/actualizaciones/",
];

const Manifiesto = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  url: z.string().url().refine((u) => {
    try {
      const x = new URL(u);
      return PREFIJOS_PERMITIDOS.some((p) => x.href.startsWith(p)) && x.pathname.toLowerCase().endsWith(".exe");
    } catch {
      return false;
    }
  }),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}/).nullable().optional(),
});

/** El manifiesto validado, o null si no tiene forma de manifiesto (mejor el respaldo que un botón roto). */
export function leerManifiesto(x: unknown): Instalador | null {
  const r = Manifiesto.safeParse(x);
  return r.success ? { version: r.data.version, url: r.data.url, fecha: r.data.fecha?.slice(0, 10) ?? null } : null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "30 de septiembre de 2026" para `YYYY-MM-DD`, sin `new Date` (que en México resta un día). */
export function fechaLarga(fecha: string | null): string | null {
  if (!fecha) return null;
  const [a, m, d] = fecha.slice(0, 10).split("-").map(Number);
  if (!a || !m || !d || m > 12) return null;
  return `${d} de ${MESES[m - 1]} de ${a}`;
}

/** Lee el manifiesto en el momento (sin caché). Null si tarda, falla o no se entiende. */
export async function leerInstalador(f: typeof fetch = fetch, msLimite = 4000): Promise<Instalador | null> {
  try {
    const r = await f(MANIFIESTO_URL, { cache: "no-store", signal: AbortSignal.timeout(msLimite) });
    if (!r.ok) return null;
    return leerManifiesto(await r.json());
  } catch {
    return null;
  }
}
