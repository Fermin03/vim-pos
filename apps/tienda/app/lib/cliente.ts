// «Tus datos»: lo que el cliente escribe para pedir, sus reglas (las MISMAS que la función, anexo
// §1.9, para decir el error en el campo y no después de enviar), cómo se vuelve el cuerpo de `pedir`
// y lo que se recuerda en su teléfono para la próxima vez. Puro: la pantalla solo pinta.
import type { DireccionDePedido } from "./api";
import type { Modo, Negocio, Pago } from "./contrato";
import { aTexto, formato, leerImporte } from "./dinero";
import { normalizarTelefono } from "./telefono";

/** En el orden en que se ven: el primer error es el primer campo que hay que corregir. */
export const CAMPOS = [
  "nombre", "telefono", "email",
  "calle", "numeroExterior", "numeroInterior", "colonia", "codigoPostal", "ciudad", "estado", "referencias",
  "pagaCon",
] as const;
export type Campo = (typeof CAMPOS)[number];
export type Formulario = Record<Campo, string>;

export const DE_DIRECCION = ["calle", "numeroExterior", "numeroInterior", "colonia", "codigoPostal", "ciudad", "estado", "referencias"] as const;

export const FORMULARIO_VACIO: Formulario = Object.fromEntries(CAMPOS.map((c) => [c, ""])) as Formulario;

/** Lo más que acepta la función en cada texto (caracteres). También es el `maxLength` del campo. */
export const LIMITES: Record<Exclude<Campo, "pagaCon">, number> = {
  nombre: 100, telefono: 20, email: 254,
  calle: 255, numeroExterior: 20, numeroInterior: 20, colonia: 150, codigoPostal: 5, ciudad: 100, estado: 50, referencias: 300,
};

/** Lo más que se puede dar de más al pagar en efectivo: el total + $5,000 (centavos). */
export const CAMBIO_MAXIMO = 500_000;

// El mismo patrón que la función: solo ASCII (el correo acaba en cabeceras de correo).
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const OBLIGATORIO: Partial<Record<Campo, string>> = {
  nombre: "Escribe tu nombre.",
  calle: "Escribe tu calle.",
  numeroExterior: "Escribe el número de tu casa o edificio.",
  colonia: "Escribe tu colonia.",
  ciudad: "Escribe tu ciudad.",
  estado: "Escribe tu estado.",
};

export type Contexto = {
  modo: Modo; pago: Pago | null;
  /** El total que ve el cliente, en centavos; null si todavía no se sabe (no se revisa «¿Con cuánto pagas?»). */
  total: number | null;
};

/** Qué tiene mal un campo, en palabras, o null. Un campo que no toca (dirección al recoger) nunca tiene error. */
export function errorDeCampo(campo: Campo, valor: string, c: Contexto): string | null {
  const v = valor.trim();
  if ((DE_DIRECCION as readonly string[]).includes(campo) && c.modo !== "DOMICILIO") return null;
  if (campo === "pagaCon") {
    if (!v || c.pago !== "EFECTIVO") return null;
    const n = leerImporte(v);
    if (n === null) return "Escribe solo la cantidad, por ejemplo 500.";
    if (c.total === null) return null;
    if (n < c.total) return `Tiene que alcanzar para el total: ${formato(c.total)}.`;
    if (n > c.total + CAMBIO_MAXIMO) return `Lo más que podemos recibir es ${formato(c.total + CAMBIO_MAXIMO)}.`;
    return null;
  }
  if (!v) return campo === "telefono" ? "Escribe tu teléfono." : campo === "codigoPostal" ? "Escribe tu código postal." : OBLIGATORIO[campo] ?? null;
  if (campo === "telefono") return normalizarTelefono(v) ? null : "Escribe los 10 dígitos de tu teléfono, con lada.";
  if (campo === "email") return v.length <= LIMITES.email && CORREO.test(v) ? null : "Revisa tu correo: le falta algo o tiene un carácter que no se puede usar.";
  if (campo === "codigoPostal") return /^\d{5}$/.test(v) ? null : "El código postal tiene 5 dígitos.";
  return Array.from(v).length > LIMITES[campo] ? `Usa ${LIMITES[campo]} caracteres o menos.` : null;
}

/** Los campos con error, en el orden de la pantalla. Vacío = se puede enviar. */
export function erroresDe(f: Formulario, c: Contexto): Partial<Record<Campo, string>> {
  const e: Partial<Record<Campo, string>> = {};
  for (const campo of CAMPOS) {
    const error = errorDeCampo(campo, f[campo], c);
    if (error) e[campo] = error;
  }
  return e;
}

/** Las formas de pago que el negocio tiene encendidas. Con una sola no se pregunta: se informa. */
export function formasDePago(negocio: Pick<Negocio, "pago_efectivo" | "pago_tarjeta">): Pago[] {
  return [...(negocio.pago_efectivo ? ["EFECTIVO" as const] : []), ...(negocio.pago_tarjeta ? ["TARJETA" as const] : [])];
}

export type DatosDelPedido = {
  cliente: { nombre: string; telefono: string; email: string | null };
  direccion: DireccionDePedido | null; pago: Pago; paga_con: string | null;
};

/** Un formulario YA validado (`erroresDe` vacío) → la parte del cuerpo de `pedir` que sale de él. */
export function datosDelPedido(f: Formulario, c: { modo: Modo; pago: Pago }): DatosDelPedido {
  const t = (campo: Campo) => f[campo].trim();
  const pagaCon = c.pago === "EFECTIVO" ? leerImporte(t("pagaCon")) : null;
  return {
    cliente: { nombre: t("nombre"), telefono: normalizarTelefono(t("telefono")) ?? t("telefono"), email: t("email").toLowerCase() || null },
    // Al recoger DEBE ir null: la función rechaza una dirección que no toca.
    direccion: c.modo !== "DOMICILIO" ? null : {
      calle: t("calle"), numero_exterior: t("numeroExterior"), numero_interior: t("numeroInterior") || null, colonia: t("colonia"),
      codigo_postal: t("codigoPostal"), ciudad: t("ciudad"), estado: t("estado"), referencias: t("referencias") || null,
    },
    pago: c.pago,
    paga_con: pagaCon === null ? null : aTexto(pagaCon),
  };
}

// ── Lo que se recuerda en el teléfono ────────────────────────────────────────────────────────────
// Nombre, teléfono, correo y la última dirección. NUNCA el código de seguimiento, la nota, la forma
// de pago ni con cuánto pagó. Es de todas las tiendas (la clave no lleva el negocio): el cliente es
// el mismo en cualquiera.
type Almacen = Pick<Storage, "getItem" | "setItem" | "removeItem">;
const almacenDelNavegador = (): Almacen | null => (typeof localStorage === "undefined" ? null : localStorage);

export const CLAVE_DEL_CLIENTE = "vim.tienda.cliente";
const RECORDADOS = ["nombre", "telefono", "email", ...DE_DIRECCION] as const satisfies readonly Campo[];

/** Lo recordado, como los campos del formulario que rellena; null si no hay nada (o no se entiende). */
export function leerCliente(almacen: Almacen | null = almacenDelNavegador()): Partial<Formulario> | null {
  try {
    const crudo = almacen?.getItem(CLAVE_DEL_CLIENTE);
    if (!crudo) return null;
    const x: unknown = JSON.parse(crudo);
    if (typeof x !== "object" || x === null || (x as { v?: unknown }).v !== 1) throw new Error("forma");
    const leido: Partial<Formulario> = {};
    for (const campo of RECORDADOS) {
      const v = (x as Record<string, unknown>)[campo];
      // Lo guardado se trata como lo que es: texto de fuera. Recortado al tope del campo.
      if (typeof v === "string" && v.trim()) leido[campo] = Array.from(v).slice(0, LIMITES[campo]).join("");
    }
    return Object.keys(leido).length > 0 ? leido : null;
  } catch {
    olvidarCliente(almacen);
    return null;
  }
}

/**
 * Recuerda los datos de un pedido que SÍ entró. Al recoger no se escribió dirección: se conserva la
 * que hubiera de antes. Si el almacén falla (modo privado), no se recuerda y ya.
 */
export function guardarCliente(f: Formulario, modo: Modo, almacen: Almacen | null = almacenDelNavegador()): void {
  const campos: readonly Campo[] = modo === "DOMICILIO" ? RECORDADOS : ["nombre", "telefono", "email"];
  const previo = modo === "DOMICILIO" ? {} : Object.fromEntries(Object.entries(leerCliente(almacen) ?? {}).filter(([k]) => (DE_DIRECCION as readonly string[]).includes(k)));
  try {
    almacen?.setItem(CLAVE_DEL_CLIENTE, JSON.stringify({ v: 1, ...previo, ...Object.fromEntries(campos.map((c) => [c, f[c].trim()])) }));
  } catch { /* cuota llena o modo privado */ }
}

/** «Olvidar mis datos». */
export function olvidarCliente(almacen: Almacen | null = almacenDelNavegador()): void {
  try { almacen?.removeItem(CLAVE_DEL_CLIENTE); } catch { /* sin almacén no hay nada que olvidar */ }
}
