// Texto de los avisos a Fermín por WhatsApp. Puro: lo usa la función whatsapp-avisos.

const MAX = 1000; // Meta admite 1024 en un parámetro de plantilla; queda margen
const TZ = "America/Mexico_City";

/** ¿Es horario de avisos (9:00 a 18:00 en Ciudad de México)? */
export function enHorario(ahora: Date): boolean {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(ahora));
  return hora >= 9 && hora < 18;
}

// Un parámetro de plantilla no admite saltos de línea ni más de 4 espacios seguidos: todo va en una
// sola línea (los «•» separan avisos) y el texto libre se aplana a espacios simples. El recorte va por
// puntos de código (un emoji partido es texto inválido para Meta). Las URLs se quitan: motivo y
// resumen los escribe el modelo y el cliente podría colarle un enlace que llegue al WhatsApp de Fermín.
const ENLACE = /(?:https?:\/\/|www\.)\S+|[\w.-]+\.(?:com|mx|net|org|io|co|app|ly|me|info|xyz|link|site|online|shop|store|biz|us|ai)\b\S*/gi;
const plano = (s: string, max: number) => [...s.replace(ENLACE, "[enlace]").replace(/\s+/g, " ").trim()].slice(0, max).join("");

export function textoDeAvisos(
  avisos: { motivo: string; resumen: string; conversacion_id: string | null }[],
  urlPanel: string,
): string {
  const lista = `${urlPanel}/whatsapp`;
  const lineas = avisos.map((a) =>
    `• ${plano(a.motivo, 60)}: ${plano(a.resumen, 250)} — ${a.conversacion_id ? `${lista}/${a.conversacion_id}` : lista}`
  );
  let texto = "";
  let n = 0;
  for (const l of lineas) {
    const resto = lineas.length - n - 1;
    const cola = resto > 0 ? ` … y ${resto} más en ${lista}` : "";
    if ((texto ? texto + " " : "").length + l.length + cola.length > MAX) break;
    texto = texto ? `${texto} ${l}` : l;
    n++;
  }
  const faltan = lineas.length - n;
  return faltan > 0 ? `${texto} … y ${faltan} más en ${lista}`.trim() : texto;
}

type Aviso = { id: string; motivo: string; resumen: string; conversacion_id: string | null };
type Envio = { ok: boolean; status: number | null };

// 4xx por el contenido del aviso. 401/403 (token, permiso), 408 y 429 (ritmo) no son culpa del aviso:
// se reintentan en la siguiente vuelta como un 5xx.
const rechazado = (s: number | null) => s !== null && s >= 400 && s < 500 && ![401, 403, 408, 429].includes(s);

/**
 * Manda los avisos en un solo mensaje. Si Meta rechaza el lote (4xx), reintenta cada aviso solo: los
 * que pasan quedan `enviados`; los que Meta rechaza solos quedan `rechazados` (se marcan igual, para
 * que uno malo no bloquee la cola). 5xx o red: nada se marca y todo espera a la siguiente vuelta.
 */
export async function repartirAvisos(
  avisos: Aviso[],
  urlPanel: string,
  mandar: (texto: string) => Promise<Envio>,
): Promise<{ enviados: string[]; rechazados: string[] }> {
  const lote = await mandar(textoDeAvisos(avisos, urlPanel));
  if (lote.ok) return { enviados: avisos.map((a) => a.id), rechazados: [] };
  const enviados: string[] = [], rechazados: string[] = [];
  if (!rechazado(lote.status)) return { enviados, rechazados };
  for (const a of avisos) {
    const r = avisos.length === 1 ? lote : await mandar(textoDeAvisos([a], urlPanel));
    if (r.ok) enviados.push(a.id);
    else if (rechazado(r.status)) rechazados.push(a.id);
  }
  return { enviados, rechazados };
}
