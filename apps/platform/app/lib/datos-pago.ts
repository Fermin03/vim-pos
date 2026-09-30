// Los datos para pagarle a VIM que ve el dueño en "Plan y pagos" (0141).
//
// Las mismas reglas que los CHECK de `plataforma_datos_pago`: aquí para contestar con un error que
// se entienda antes de llegar a la base, que igual las vuelve a comprobar.
import { clabeValida } from "@vim/db/cobro";

export type DatosPago = {
  banco: string | null;
  titular: string | null;
  clabe: string | null;
  whatsapp: string | null;
  correo: string | null;
  instrucciones: string | null;
};

export const CAMPOS_DATOS_PAGO = ["banco", "titular", "clabe", "whatsapp", "correo", "instrucciones"] as const;

/** Texto limpio o null si viene vacío. Solo acepta texto: un número o un objeto no es un dato de pago. */
function texto(v: unknown): string | null | undefined {
  if (v == null) return null;
  if (typeof v !== "string") return undefined;
  const t = v.trim();
  return t === "" ? null : t;
}

/**
 * Valida y normaliza lo que manda el formulario. La CLABE y el WhatsApp se guardan solo en dígitos
 * (se aceptan con espacios o guiones, como la copia la gente del estado de cuenta).
 */
export function leerDatosPago(body: Record<string, unknown>): { ok: true; datos: DatosPago } | { ok: false; campo: string; detalle: string } {
  const d: Partial<DatosPago> = {};
  for (const c of CAMPOS_DATOS_PAGO) {
    const v = texto(body[c]);
    if (v === undefined) return { ok: false, campo: c, detalle: "Debe ser texto." };
    d[c] = v;
  }
  const clabe = d.clabe ? d.clabe.replace(/[\s-]/g, "") : null;
  const whatsapp = d.whatsapp ? d.whatsapp.replace(/[\s()+-]/g, "") : null;
  if (d.banco && (d.banco.length < 2 || d.banco.length > 80)) return { ok: false, campo: "banco", detalle: "El banco va de 2 a 80 caracteres." };
  if (d.titular && (d.titular.length < 2 || d.titular.length > 120)) return { ok: false, campo: "titular", detalle: "El titular va de 2 a 120 caracteres." };
  if (clabe && !clabeValida(clabe)) return { ok: false, campo: "clabe", detalle: "La CLABE no es válida: son 18 dígitos y el último es de control. Revísala contra el estado de cuenta." };
  if (whatsapp && !/^[0-9]{10,15}$/.test(whatsapp)) return { ok: false, campo: "whatsapp", detalle: "El WhatsApp va en dígitos con lada de país, p. ej. 524771234567." };
  if (d.correo && (d.correo.length > 254 || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.correo))) return { ok: false, campo: "correo", detalle: "El correo no parece válido." };
  if (d.instrucciones && d.instrucciones.length > 500) return { ok: false, campo: "instrucciones", detalle: "Las instrucciones son de 500 caracteres o menos." };
  return { ok: true, datos: { banco: d.banco ?? null, titular: d.titular ?? null, clabe, whatsapp, correo: d.correo ?? null, instrucciones: d.instrucciones ?? null } };
}
