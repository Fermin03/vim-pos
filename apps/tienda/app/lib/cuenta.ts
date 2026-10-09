// La cuenta del comensal, del lado del navegador y sin pantalla: las reglas de cada formulario (las
// MISMAS que la función, supabase/functions/_shared/tienda/validar.ts, para decir el error en el
// campo y no después de enviar), lo que se manda, las palabras de cada error, a dónde se vuelve
// después de entrar y cómo un pedido viejo se vuelve carrito. Puro: la pantalla solo pinta.
import { ZONA_MX } from "@vim/fecha";
import type { DatosDeCuenta, DatosDeRegistro, DireccionPorGuardar } from "./api";
import { agregar, almacenDelNavegador, carritoNuevo, productoDe, type Almacen, type Carrito, type ItemDeCuerpo } from "./carrito";
import { DE_DIRECCION, errorDeCampo, type Contexto } from "./cliente";
import { FORMA_CODIGO, pedidosDe, type Cuenta, type DireccionGuardada, type Menu, type Modo, type PedidoDeCuenta } from "./contrato";
import { hora12, momentoMx } from "./horario";
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
  // Al entrar o registrarse no hay a quién llamar: el «…o llama al restaurante» es del flujo de pedido.
  if (codigo === "DEMASIADOS_INTENTOS") return "Demasiados intentos. Espera unos minutos y vuelve a intentar.";
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

// ── Lo que deciden las pantallas (entrar, registro, recuperar, «Mi cuenta», «Tus datos») ─────────
/** `/<slug>/entrar` (o registro, recuperar) con su `?volver=`, solo si es una ruta de ese negocio distinta del menú. */
export function enlaceDeAcceso(slug: string, pantalla: "entrar" | "registro" | "recuperar", volver?: unknown): string {
  const destino = volverSeguro(slug, volver);
  return `/${slug}/${pantalla}${destino === `/${slug}` ? "" : `?volver=${encodeURIComponent(destino)}`}`;
}

/** El menú de una sucursal: `?s=` solo cuando el negocio tiene más de una (así lo lee la página). */
export const rutaDelMenu = (negocio: { slug: string; sucursales: readonly { id: string }[] }, sucursalId: string | null): string =>
  `/${negocio.slug}${negocio.sucursales.length > 1 && sucursalId ? `?s=${sucursalId}` : ""}`;

/**
 * Qué paso de «recuperar» toca según el fragmento de la dirección (`location.hash`). El enlace del
 * correo es `…/recuperar#t=<token>`: sin `t`, se pide el correo; con un `t` que no tiene forma de
 * token (cortado al copiarlo, manoseado), el enlace no sirve; con uno bien formado, la contraseña
 * nueva. Que además esté vigente lo dice la función al aplicarlo.
 */
export function pasoDelEnlace(hash: unknown): { paso: "pedir" | "invalido" } | { paso: "nueva"; token: string } {
  const t = typeof hash === "string" ? new URLSearchParams(hash.replace(/^#/, "")).get("t") : null;
  if (t === null) return { paso: "pedir" };
  return FORMA_CODIGO.test(t) ? { paso: "nueva", token: t } : { paso: "invalido" };
}

/**
 * El error de «cambiar contraseña» y «eliminar cuenta». Ahí `CREDENCIALES_INVALIDAS` es «la actual
 * no es» (o la cuenta quedó bloqueada por intentos: no se distingue, a propósito).
 */
export const textoDePasswordActual = (codigo: string): string =>
  codigo === "CREDENCIALES_INVALIDAS" ? "La contraseña actual no coincide." : textoDeCuenta(codigo);

const enLista = (xs: string[]): string => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Lo que `carritoDesdePedido` no pudo meter, en palabras; null si entró todo. */
export function textoDeDescartados(descartados: readonly (string | null)[]): string | null {
  const nombres = [...new Set(descartados.filter((d): d is string => d !== null))];
  const sinNombre = descartados.filter((d) => d === null).length;
  const partes = [
    nombres.length > 0 ? `Ya no se ${nombres.length === 1 ? "puede" : "pueden"} pedir: ${enLista(nombres)}.` : "",
    sinNombre === 1 ? "Un producto de ese pedido ya no está en el menú." : sinNombre > 1 ? `${sinNombre} productos de ese pedido ya no están en el menú.` : "",
  ].filter(Boolean);
  return partes.length > 0 ? partes.join(" ") : null;
}

/** «Madero 12 int. B, Centro, 37000 León». */
export const direccionEnUnaLinea = (d: Pick<DireccionGuardada, "calle" | "numero_exterior" | "numero_interior" | "colonia" | "codigo_postal" | "ciudad">): string =>
  `${d.calle} ${d.numero_exterior}${d.numero_interior ? ` int. ${d.numero_interior}` : ""}, ${d.colonia}, ${d.codigo_postal} ${d.ciudad}`;

// Los meses van escritos: lo que `Intl` abrevia («oct», «oct.») cambia de un navegador a otro.
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const diaMx = new Intl.DateTimeFormat("en-US", { timeZone: ZONA_MX, day: "numeric", month: "numeric" });

/** Cuándo se hizo un pedido, en hora de México: «8 oct, 2:00 p. m.». Vacío si no es una fecha. */
export function fechaDePedido(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = Object.fromEntries(diaMx.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.day} ${MESES[Number(p.month) - 1]!.slice(0, 3)}, ${hora12(momentoMx(d).hora)}`;
}

/** `1990-05-17` → «17 de mayo de 1990». Sin pasar por `Date`: una fecha sin hora no tiene zona que la corra. */
export function fechaDeNacimiento(fecha: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  const mes = m && MESES[Number(m[2]) - 1];
  return m && mes ? `${Number(m[3])} de ${mes} de ${m[1]}` : "";
}

/** La cuenta → el formulario de «Mis datos». */
export const formularioDeCuenta = (c: Cuenta): Record<(typeof FORMULARIOS.datos)[number], string> =>
  ({ nombre: c.nombre, apellido: c.apellido ?? "", telefono: c.telefono, fechaNacimiento: c.fecha_nacimiento ?? "" });

/** La cuenta → lo que prellena «Tus datos» de un pedido (ahí el nombre es uno solo). */
export const paraTusDatos = (c: Cuenta): { nombre: string; telefono: string; email: string } =>
  ({ nombre: [c.nombre, c.apellido].filter(Boolean).join(" "), telefono: c.telefono, email: c.email });

const DIRECCION_VACIA = Object.fromEntries(["etiqueta", ...DE_DIRECCION].map((c) => [c, ""])) as Record<CampoDeDireccion, string>;

/** Una dirección guardada (o ninguna) → su formulario. */
export const formularioDeDireccion = (d: DireccionGuardada | null): Record<CampoDeDireccion, string> => (d === null ? DIRECCION_VACIA : {
  etiqueta: d.etiqueta, calle: d.calle, numeroExterior: d.numero_exterior, numeroInterior: d.numero_interior ?? "", colonia: d.colonia,
  codigoPostal: d.codigo_postal, ciudad: d.ciudad, estado: d.estado, referencias: d.referencias ?? "",
});

/** Un formulario YA validado (`erroresDeDireccion` vacío) → lo que manda `guardarDireccion`. `id: null` = nueva. */
export function direccionPorGuardar(f: Record<CampoDeDireccion, string>, id: string | null): DireccionPorGuardar {
  const t = (c: CampoDeDireccion) => f[c].trim();
  return {
    id, etiqueta: t("etiqueta"), calle: t("calle"), numero_exterior: t("numeroExterior"), numero_interior: t("numeroInterior") || null,
    colonia: t("colonia"), codigo_postal: t("codigoPostal"), ciudad: t("ciudad"), estado: t("estado"), referencias: t("referencias") || null,
  };
}

// ── El relevo de «Pedir de nuevo» ────────────────────────────────────────────────────────────────
// «Mi cuenta» no tiene el menú; la página del menú sí. La cuenta DEJA el pedido en el teléfono y
// navega; el menú de esa sucursal lo TOMA (una vez), arma el carrito con `carritoDesdePedido` y
// avisa lo que ya no está. Lo dejado se lee como lo que es, texto de fuera: pasa por `pedidosDe`.
export const claveDeRepetir = (slug: string): string => `vim.tienda.${slug}.repetir`;
/** Lo dejado vale para la navegación que sigue, no para una visita de otro día. */
const REPETIR_VALE_MS = 2 * 60_000;

/** `false` = no se pudo dejar (sin `items`, sin almacén o almacén lleno): no tiene caso navegar. */
export function dejarPorRepetir(slug: string, pedido: PedidoDeCuenta, almacen: Almacen | null = almacenDelNavegador(), ahora: number = Date.now()): boolean {
  if (!pedido.items || !almacen) return false;
  try {
    almacen.setItem(claveDeRepetir(slug), JSON.stringify({ cuando: ahora, pedido }));
    return true;
  } catch { return false; }
}

/** Lo dejado para ESA sucursal, ya vuelto carrito; null si no hay. Siempre lo borra: se toma una vez. */
export function tomarPorRepetir(
  slug: string, sucursalId: string, menu: Menu, almacen: Almacen | null = almacenDelNavegador(), ahora: number = Date.now(),
): { carrito: Carrito; descartados: (string | null)[] } | null {
  try {
    const crudo = almacen?.getItem(claveDeRepetir(slug));
    if (!crudo) return null;
    almacen?.removeItem(claveDeRepetir(slug));
    const x: unknown = JSON.parse(crudo);
    if (typeof x !== "object" || x === null) return null;
    const { cuando, pedido: dejado } = x as { cuando?: unknown; pedido?: unknown };
    const pedido = pedidosDe({ pedidos: [dejado] })?.[0];
    if (typeof cuando !== "number" || ahora - cuando > REPETIR_VALE_MS || !pedido?.items || pedido.sucursal_id !== sucursalId) return null;
    return carritoDesdePedido(pedido.items, sucursalId, pedido.modo, menu);
  } catch {
    try { almacen?.removeItem(claveDeRepetir(slug)); } catch { /* sin almacén no hay nada que limpiar */ }
    return null;
  }
}
