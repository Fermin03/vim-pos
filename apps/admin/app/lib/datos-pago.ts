// Lo que el dueño necesita para pagarle a VIM (0141): la cuenta y a quién mandar el comprobante.
// Funciones puras; la lectura vive en `lib/plan.ts` (RPC `datos_pago_plataforma`).

export type DatosPago = {
  banco: string | null;
  titular: string | null;
  clabe: string | null;
  whatsapp: string | null;
  correo: string | null;
  instrucciones: string | null;
};

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

/** "octubre 2026" para una fecha `YYYY-MM-DD` (se toma tal cual: sin `new Date`, que en México resta un día). */
export function mesDe(fecha: string): string {
  const [a, m] = fecha.slice(0, 10).split("-").map(Number);
  if (!a || !m) return "";
  return `${MESES[m - 1]} ${a}`;
}

/** El mensaje que ya va escrito en WhatsApp. El mes es el que se está pagando (la fecha de cobro). */
export function mensajeComprobante(nombreComercial: string, mes: string): string {
  return `Hola, les envío el comprobante de pago de ${nombreComercial.trim() || "mi negocio"}${mes ? `, ${mes}` : ""}.`;
}

/** wa.me con el mensaje. Null si el número no son 10 a 15 dígitos: mejor sin botón que uno que no abre. */
export function enlaceWhatsapp(numero: string | null | undefined, texto: string): string | null {
  const n = (numero ?? "").replace(/\D/g, "");
  if (!/^[0-9]{10,15}$/.test(n)) return null;
  return `https://wa.me/${n}?text=${encodeURIComponent(texto)}`;
}

/** "0020 1007 7777 7777 71": la CLABE en grupos de cuatro, para leerla y dictarla. Se copia sin espacios. */
export function clabeLegible(clabe: string): string {
  return clabe.replace(/(\d{4})(?=\d)/g, "$1 ");
}

/** ¿Hay algo que enseñar? Sin cuenta ni contacto, la pantalla dice que se escriba a VIM, sin inventar datos. */
export function hayDatosPago(d: DatosPago | null): boolean {
  return Boolean(d && (d.clabe || d.whatsapp || d.correo));
}
