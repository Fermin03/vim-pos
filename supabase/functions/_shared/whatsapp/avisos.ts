// Texto de los avisos a Fermín por WhatsApp. Puro: lo usa la función whatsapp-avisos.

const MAX = 1000; // Meta admite 1024 en un parámetro de plantilla; queda margen
const TZ = "America/Mexico_City";

/** ¿Es horario de avisos (9:00 a 18:00 en Ciudad de México)? */
export function enHorario(ahora: Date): boolean {
  const hora = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hour12: false }).format(ahora));
  return hora >= 9 && hora < 18;
}

// Un parámetro de plantilla no admite saltos de línea ni más de 4 espacios seguidos: todo va en una
// sola línea (los «•» separan avisos) y el texto libre se aplana a espacios simples.
const plano = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

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
