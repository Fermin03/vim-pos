// La cuenta del comensal, del lado del navegador y sin pantalla: las reglas de cada formulario (las
// MISMAS que la función, supabase/functions/_shared/tienda/validar.ts, para decir el error en el
// campo y no después de enviar), lo que se manda, las palabras de cada error, a dónde se vuelve
// después de entrar y cómo un pedido viejo se vuelve carrito. Puro: la pantalla solo pinta.
import type { DatosDeCuenta, DatosDeRegistro } from "./api";
import { agregar, carritoNuevo, productoDe, type Carrito, type ItemDeCuerpo } from "./carrito";
import { DE_DIRECCION, errorDeCampo, type Contexto } from "./cliente";
import type { Menu, Modo } from "./contrato";
import { normalizarTelefono } from "./telefono";
import { textoDeError } from "./textos";

// ── Formularios ──────────────────────────────────────────────────────────────────────────────────
/**
 * `password` es una contraseña NUEVA (8 a 72); `passwordActual`, una que ya existe y solo se pide:
 * sus reglas no se enseñan al entrar.
 */
export type CampoDeCuenta = "nombre" | "apellido" | "email" | "telefono" | "password" | "passwordActual" | "fechaNacimiento" | "etiqueta";

/** Los campos de cada formulario, en el orden en que se ven. */
export const FORMULARIOS = {
  registro: ["nombre", "apellido", "email", "telefono", "password"],
  entrar: ["email", "passwordActual"],
  recuperar: ["email"],
  nuevaPassword: ["password"],
  datos: ["nombre", "apellido", "telefono", "fechaNacimiento"],
  cambiarPassword: ["passwordActual", "password"],
  eliminar: ["passwordActual"],
} as const satisfies Record<string, readonly CampoDeCuenta[]>;

/** El `maxLength` de cada campo de texto. La contraseña no lleva: cortarla en silencio sería peor. */
export const LIMITES_DE_CUENTA = { nombre: 100, apellido: 100, email: 254, telefono: 20, etiqueta: 40 } as const;
export const PASSWORD = { min: 8, max: 72 } as const;

const SIN_PEDIDO: Contexto = { modo: "DOMICILIO", pago: null, total: null };
const largo = (v: string, max: number): string | null => (Array.from(v).length > max ? `Usa ${max} caracteres o menos.` : null);
// ponytail: «hoy» en UTC, igual que la función; por la tarde en México ya es mañana allá, y da igual.
const hoyUtc = (): string => new Date().toISOString().slice(0, 10);

/** Qué tiene mal un campo, en palabras, o null. `hoy` (`YYYY-MM-DD`) solo cuenta para la fecha de nacimiento. */
export function errorDeCampoDeCuenta(campo: CampoDeCuenta, valor: string, hoy: string = hoyUtc()): string | null {
  // Las contraseñas no se recortan: lo que se escribió es lo que se guarda y lo que se compara.
  if (campo === "passwordActual") return valor ? null : "Escribe tu contraseña.";
  if (campo === "password") {
    if (!valor) return "Escribe una contraseña.";
    const n = Array.from(valor).length;
    if (n < PASSWORD.min) return `Usa al menos ${PASSWORD.min} caracteres.`;
    if (n > PASSWORD.max) return `Usa ${PASSWORD.max} caracteres o menos.`;
    // El cifrado solo mira los primeros 72 BYTES: con acentos o emojis se llega antes que con 72 letras.
    return new TextEncoder().encode(valor).length > PASSWORD.max ? "Usa una contraseña más corta." : null;
  }
  const v = valor.trim();
  if (campo === "fechaNacimiento") {
    if (!v) return null;
    // `new Date("1990-02-30")` no falla, se corre a marzo: si al volver a escribirla no es la misma, no existe.
    const d = /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T00:00:00Z`) : null;
    const existe = d !== null && !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
    return existe && v >= "1900-01-01" && v < hoy ? null : "Revisa la fecha.";
  }
  if (campo === "apellido") return v ? largo(v, LIMITES_DE_CUENTA.apellido) : "Escribe tu apellido.";
  if (campo === "etiqueta") return v ? largo(v, LIMITES_DE_CUENTA.etiqueta) : "Ponle un nombre, por ejemplo «Casa».";
  if (campo === "email" && !v) return "Escribe tu correo.";   // en el pedido es opcional; en la cuenta, no
  return errorDeCampo(campo, v, SIN_PEDIDO);                  // nombre, teléfono y correo: como en «Tus datos»
}

/** Los campos con error de ese formulario (`FORMULARIOS.registro`…), en su orden. Vacío = se puede enviar. */
export function erroresDeCuenta<C extends CampoDeCuenta>(campos: readonly C[], f: Record<C, string>, hoy?: string): Partial<Record<C, string>> {
  const e: Partial<Record<C, string>> = {};
  for (const campo of campos) {
    const error = errorDeCampoDeCuenta(campo, f[campo], hoy);
    if (error) e[campo] = error;
  }
  return e;
}

export type CampoDeDireccion = "etiqueta" | (typeof DE_DIRECCION)[number];
/** Una dirección guardada: su etiqueta y los mismos campos (y reglas) que la de un pedido a domicilio. */
export function erroresDeDireccion(f: Record<CampoDeDireccion, string>): Partial<Record<CampoDeDireccion, string>> {
  const e: Partial<Record<CampoDeDireccion, string>> = {};
  const etiqueta = errorDeCampoDeCuenta("etiqueta", f.etiqueta);
  if (etiqueta) e.etiqueta = etiqueta;
  for (const campo of DE_DIRECCION) {
    const error = errorDeCampo(campo, f[campo], SIN_PEDIDO);
    if (error) e[campo] = error;
  }
  return e;
}

const telefono = (x: string): string => normalizarTelefono(x.trim()) ?? x.trim();

/** Un registro YA validado → lo que manda `registrar` (falta el `captcha`). La contraseña, intacta. */
export function datosDeRegistro(f: Record<(typeof FORMULARIOS.registro)[number], string>): DatosDeRegistro {
  return { nombre: f.nombre.trim(), apellido: f.apellido.trim(), email: f.email.trim().toLowerCase(), telefono: telefono(f.telefono), password: f.password };
}

/** «Mis datos» YA validado → lo que manda `guardarCuenta`. */
export function datosDeCuenta(f: Record<(typeof FORMULARIOS.datos)[number], string>): DatosDeCuenta {
  return { nombre: f.nombre.trim(), apellido: f.apellido.trim(), telefono: telefono(f.telefono), fecha_nacimiento: f.fechaNacimiento.trim() || null };
}

// ── Errores ──────────────────────────────────────────────────────────────────────────────────────
/**
 * Lo que se le dice al cliente ante un código de error de cuenta (o cualquier otro de la tienda), en
 * una frase: «Tu sesión terminó. Entra otra vez.». Los textos viven con los demás, en textos.ts.
 */
export function textoDeCuenta(codigo: string): string {
  const t = textoDeError(codigo);
  return `${t.texto} ${t.hacer}`;
}

// ── A dónde se vuelve después de entrar ──────────────────────────────────────────────────────────
/**
 * El `?volver=` de entrar/registro/recuperar, o `/<slug>` si no es de fiar. Solo vale una ruta
 * interna de ESE negocio: nada con esquema ni dos puntos, `//`, `\`, espacios o caracteres de
 * control (el navegador los quita y `/\t/evil.com` se vuelve `//evil.com`), ni una que al resolverse
 * (`..`, `%2e%2e`) salga de `/<slug>`.
 */
export function volverSeguro(slug: string, valor: unknown): string {
  const inicio = `/${slug}`;
  if (typeof valor !== "string" || valor.length > 200 || !valor.startsWith(inicio)) return inicio;
  if (!/^($|[/?#])/.test(valor.slice(inicio.length))) return inicio;   // `/knockout-2` no es `/knockout`
  if (/\/\/|\\|:|[\s\u0000-\u001f\u007f]/.test(valor)) return inicio;
  let ruta: string;
  try { ruta = new URL(valor, "https://tienda.invalid").pathname; } catch { return inicio; }
  return ruta === inicio || ruta.startsWith(`${inicio}/`) ? valor : inicio;
}

// ── Pedir de nuevo ───────────────────────────────────────────────────────────────────────────────
/**
 * Los `items` de un pedido anterior → un carrito nuevo contra el menú DE AHORA. Cada renglón pasa
 * por las mismas reglas que al agregarlo a mano (`agregar`): lo que ya no está, se agotó o cambió
 * de opciones no entra. `descartados` trae uno por renglón que no entró: su nombre de hoy, o null si
 * el producto ya ni está en el menú. Precios no se copian: el carrito nunca los guarda.
 * La zona queda sin elegir (a domicilio el cliente la confirma).
 */
export function carritoDesdePedido(items: readonly ItemDeCuerpo[], sucursalId: string, modo: Modo, menu: Menu): { carrito: Carrito; descartados: (string | null)[] } {
  const mods = (m: ItemDeCuerpo["modificadores"]) => (m ?? []).map((x) => ({ opcionId: x.opcion_id, cantidad: x.cantidad }));
  let carrito = carritoNuevo(sucursalId, modo);
  const descartados: (string | null)[] = [];
  for (const i of items) {
    const producto = productoDe(menu, i.producto_id);
    const antes = carrito;
    if (producto) {
      carrito = agregar(carrito, producto, {
        modificadores: mods(i.modificadores),
        componentes: (i.componentes ?? []).map((c) => ({ grupoId: c.grupo_id, productoId: c.producto_id, cantidad: c.cantidad, modificadores: mods(c.modificadores) })),
      }, i.cantidad, i.nota ?? "");
    }
    if (carrito === antes) descartados.push(producto?.nombre ?? null);   // `agregar` devuelve EL MISMO carrito si no entró
  }
  return { carrito, descartados };
}
