// Forma de lo que le llega a la función `tienda`. Validación A MANO y no con zod: estos módulos se
// prueban con Node, que no resuelve `npm:` (mismo criterio que _shared/alta.ts).
//
// Aquí solo se mira la FORMA. Que el producto exista, que el precio sea el de hoy o que la tienda
// esté abierta lo deciden las funciones SQL (0162), que son las que tienen los datos.
import { esCodigo } from "./seguimiento.ts";

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: string };
export type Modo = "RECOGER" | "DOMICILIO";
export type Direccion = {
  calle: string; numero_exterior: string; numero_interior: string | null; colonia: string;
  codigo_postal: string; ciudad: string; estado: string; referencias: string | null;
};
export type Peticion =
  | { accion: "negocio"; negocio: string }
  | { accion: "menu"; negocio: string; sucursal_id: string }
  | { accion: "cotizar"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[] }
  | { accion: "pedir"; negocio: string; sucursal_id: string; modo: Modo; zona_id: string | null; items: unknown[];
      cliente: { nombre: string; telefono: string; email: string | null }; direccion: Direccion | null;
      pago: "EFECTIVO" | "TARJETA"; paga_con: string | null; nota: string | null; captcha: string | null;
      /** El total que el cliente vio al cotizar: si ya no es ese, el pedido no se crea (TOTAL_CAMBIO). */
      total_esperado: string | null }
  | { accion: "seguimiento"; negocio: string; codigo: string }
  // ── Cuentas (entrega 6). La sesión NO viene en el cuerpo: llega en la cabecera `x-tienda-sesion`. ──
  | { accion: "registrar"; negocio: string; nombre: string; apellido: string; email: string; telefono: string; password: string; captcha: string | null }
  | { accion: "entrar"; negocio: string; email: string; password: string }
  | { accion: "salir" | "cuenta" | "mis_pedidos"; negocio: string }
  | { accion: "recuperar_pedir"; negocio: string; email: string; captcha: string | null }
  | { accion: "recuperar_aplicar"; negocio: string; token: string; password: string }
  | { accion: "cuenta_guardar"; negocio: string; nombre: string; apellido: string; telefono: string; fecha_nacimiento: string | null }
  | { accion: "cuenta_password"; negocio: string; actual: string; nueva: string }
  | { accion: "direccion_guardar"; negocio: string; id: string | null; etiqueta: string | null; direccion: Direccion }
  | { accion: "direccion_borrar"; negocio: string; id: string }
  | { accion: "eliminar_cuenta"; negocio: string; password: string };

const ACCIONES: ReadonlySet<string> = new Set<Peticion["accion"]>([
  "negocio", "menu", "cotizar", "pedir", "seguimiento", "registrar", "entrar", "salir", "recuperar_pedir", "recuperar_aplicar",
  "cuenta", "cuenta_guardar", "cuenta_password", "direccion_guardar", "direccion_borrar", "mis_pedidos", "eliminar_cuenta",
]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
// Solo ASCII: el correo acaba en cabeceras SMTP y en la base; nada de invisibles, comas ni comillas.
const CORREO = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;
const MAX_RENGLONES = 40;

const mal = (error: string): { ok: false; error: string } => ({ ok: false, error });
const objeto = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

export function esUuid(x: unknown): x is string {
  return typeof x === "string" && UUID.test(x);
}

/** Diez dígitos nacionales, o null. Quita adornos (espacios y `()+-.`) y el prefijo de México (52, o
 *  521 de celular). Una letra no es adorno, y la lada nacional no empieza en 0 ni en 1. */
export function normalizarTelefono(x: unknown): string | null {
  if (typeof x !== "string" || !/^[\d\s()+.-]+$/.test(x)) return null;
  let d = x.replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return /^[2-9]\d{9}$/.test(d) ? d : null;
}

/** Texto de una sola línea recortado a `max` CARACTERES (no unidades UTF-16: no parte un emoji).
 *  Los controles (Cc, incluidos los C1) y los separadores de línea/párrafo se vuelven espacio; los de
 *  formato (Cf: ancho cero, bidi, BOM) y los sustitutos sueltos se quitan. Sin nada visible = null. */
export function textoLimpio(x: unknown, max: number): string | null {
  if (typeof x !== "string") return null;
  const t = x.replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ").replace(/[\p{Cf}\p{Cs}]/gu, "")
    .replace(/\s+/g, " ").trim();
  const corto = Array.from(t).slice(0, max).join("").trim();
  return /[\p{L}\p{N}\p{P}\p{S}]/u.test(corto) ? corto : null;
}

function leerDireccion(x: unknown): Direccion | null {
  if (!objeto(x)) return null;
  const calle = textoLimpio(x.calle, 255), numero_exterior = textoLimpio(x.numero_exterior, 20);
  const colonia = textoLimpio(x.colonia, 150), ciudad = textoLimpio(x.ciudad, 100), estado = textoLimpio(x.estado, 50);
  const codigo_postal = typeof x.codigo_postal === "string" ? x.codigo_postal.trim() : "";
  if (!calle || !numero_exterior || !colonia || !ciudad || !estado || !/^[0-9]{5}$/.test(codigo_postal)) return null;
  return { calle, numero_exterior, numero_interior: textoLimpio(x.numero_interior, 20), colonia,
           codigo_postal, ciudad, estado, referencias: textoLimpio(x.referencias, 300) };
}

/** Importe como texto con dos decimales, o undefined si no es un importe válido. null/ausente = null.
 *  Un número se juzga por su texto: más de dos decimales (o notación científica) se rechaza, no se redondea. */
function leerImporte(x: unknown): string | null | undefined {
  if (x === null || x === undefined || x === "") return null;
  const s = typeof x === "number" ? String(x) : typeof x === "string" ? x.trim() : "";
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return undefined;
  const n = Number(s);
  return n > 999999 ? undefined : n.toFixed(2);
}

/** ¿El cuerpo CRUDO trae un NUL, literal o como escape `\u0000` (número impar de barras delante)?
 *  Postgres no admite U+0000 en un jsonb ni en un texto: sin esta guarda, cada petición así sería un
 *  503 con su línea de log. Se mira el texto y no el JSON ya leído para cubrir también las claves. */
export function tieneNul(crudo: string): boolean {
  return crudo.includes("\u0000") || /(?<!\\)(?:\\\\)*\\u0000/.test(crudo);
}

/** El correo de una cuenta: sin espacios alrededor, en minúsculas, ≤ 254 y con la forma de CORREO. O null. */
function leerCorreo(x: unknown): string | null {
  const v = typeof x === "string" ? x.trim().toLowerCase() : "";
  return v.length <= 254 && CORREO.test(v) ? v : null;
}

/** Una contraseña TAL CUAL llega: ni se recorta ni se normaliza (lo que el cliente escribió es lo
 *  que se cifra y lo que se compara). Al menos `min` caracteres y como mucho 72 BYTES en UTF-8, o
 *  null: bcrypt solo mira los primeros 72 bytes, y con acentos o emojis se llega antes que con 72
 *  letras. Lo que pasara de ahí no contaría, así que no se acepta (igual que la pantalla y el SQL). */
function leerClave(x: unknown, min: number): string | null {
  if (typeof x !== "string" || x.length > 72) return null;   // 72 bytes nunca son más de 72 unidades UTF-16
  return Array.from(x).length >= min && new TextEncoder().encode(x).length <= 72 ? x : null;
}

const leerCaptcha = (x: unknown): string | null => (typeof x === "string" && x.length <= 4096 ? x : null);

/** Fecha de nacimiento `YYYY-MM-DD`: que exista en el calendario, desde 1900 y anterior a hoy (UTC,
 *  que va por delante de México: lo que aquí es pasado, allá también). Vacía = null; inválida = undefined. */
export function leerFecha(x: unknown, hoy: Date = new Date()): string | null | undefined {
  if (x === null || x === undefined || x === "") return null;
  if (typeof x !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(x)) return undefined;
  const d = new Date(`${x}T00:00:00Z`);
  // `new Date("1990-02-30")` no falla: se corre a marzo. Si al volver a escribirla no es la misma, no existe.
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== x) return undefined;
  return x >= "1900-01-01" && x < hoy.toISOString().slice(0, 10) ? x : undefined;
}

/**
 * Las acciones de cuenta. La forma que no cuadra es `CUENTA_INVALIDA_DATOS` (o `DIRECCION_INVALIDA`,
 * o `ENLACE_INVALIDO` para un token de recuperación que no tiene forma de token), y nunca depende de
 * si la cuenta existe. Una contraseña que se va a COMPROBAR (entrar, la actual, eliminar) solo se
 * acota a 1 carácter–72 bytes: si es corta, que la rechace la base como cualquier otra equivocada.
 */
function leerCuenta(accion: Exclude<Peticion["accion"], "negocio" | "menu" | "cotizar" | "pedir" | "seguimiento">,
                    negocio: string, x: Record<string, unknown>): Resultado<Peticion> {
  const invalida = mal("CUENTA_INVALIDA_DATOS");
  switch (accion) {
    case "salir": case "cuenta": case "mis_pedidos":
      return { ok: true, valor: { accion, negocio } };
    case "registrar": {
      const nombre = textoLimpio(x.nombre, 100), apellido = textoLimpio(x.apellido, 100);
      const email = leerCorreo(x.email), telefono = normalizarTelefono(x.telefono), password = leerClave(x.password, 8);
      if (!nombre || !apellido || !email || !telefono || password === null) return invalida;
      return { ok: true, valor: { accion, negocio, nombre, apellido, email, telefono, password, captcha: leerCaptcha(x.captcha) } };
    }
    case "entrar": {
      const email = leerCorreo(x.email), password = leerClave(x.password, 1);
      return email && password !== null ? { ok: true, valor: { accion, negocio, email, password } } : invalida;
    }
    case "recuperar_pedir": {
      const email = leerCorreo(x.email);
      return email ? { ok: true, valor: { accion, negocio, email, captcha: leerCaptcha(x.captcha) } } : invalida;
    }
    case "recuperar_aplicar": {
      if (!esCodigo(x.token)) return mal("ENLACE_INVALIDO");
      const password = leerClave(x.password, 8);
      return password !== null ? { ok: true, valor: { accion, negocio, token: x.token, password } } : invalida;
    }
    case "cuenta_guardar": {
      const nombre = textoLimpio(x.nombre, 100), apellido = textoLimpio(x.apellido, 100);
      const telefono = normalizarTelefono(x.telefono), fecha_nacimiento = leerFecha(x.fecha_nacimiento);
      if (!nombre || !apellido || !telefono || fecha_nacimiento === undefined) return invalida;
      return { ok: true, valor: { accion, negocio, nombre, apellido, telefono, fecha_nacimiento } };
    }
    case "cuenta_password": {
      const actual = leerClave(x.actual, 1), nueva = leerClave(x.nueva, 8);
      return actual !== null && nueva !== null ? { ok: true, valor: { accion, negocio, actual, nueva } } : invalida;
    }
    case "eliminar_cuenta": {
      const password = leerClave(x.password, 1);
      return password !== null ? { ok: true, valor: { accion, negocio, password } } : invalida;
    }
    case "direccion_guardar": {
      const id = x.id ?? null;
      // Los campos pueden venir sueltos o bajo `direccion` (como en `pedir`): se leen igual.
      const direccion = leerDireccion(objeto(x.direccion) ? x.direccion : x);
      if ((id !== null && !esUuid(id)) || !direccion) return mal("DIRECCION_INVALIDA");
      return { ok: true, valor: { accion, negocio, id, etiqueta: textoLimpio(x.etiqueta, 40), direccion } };
    }
    case "direccion_borrar":
      return esUuid(x.id) ? { ok: true, valor: { accion, negocio, id: x.id } } : mal("DIRECCION_INVALIDA");
  }
}

export function leerCuerpo(x: unknown): Resultado<Peticion> {
  if (!objeto(x)) return mal("CUERPO_INVALIDO");
  if (typeof x.accion !== "string" || !ACCIONES.has(x.accion)) return mal("ACCION_INVALIDA");
  const accion = x.accion as Peticion["accion"];
  const negocio = typeof x.negocio === "string" ? x.negocio.trim().toLowerCase() : "";
  if (!SLUG.test(negocio)) return mal("NEGOCIO_INVALIDO");

  if (accion !== "negocio" && accion !== "menu" && accion !== "cotizar" && accion !== "pedir" && accion !== "seguimiento") {
    return leerCuenta(accion, negocio, x);
  }
  if (accion === "negocio") return { ok: true, valor: { accion, negocio } };
  if (accion === "seguimiento") {
    return esCodigo(x.codigo) ? { ok: true, valor: { accion, negocio, codigo: x.codigo } } : mal("CODIGO_INVALIDO");
  }

  if (!esUuid(x.sucursal_id)) return mal("SUCURSAL_INVALIDA");
  const sucursal_id = x.sucursal_id;
  if (accion === "menu") return { ok: true, valor: { accion, negocio, sucursal_id } };

  if (x.modo !== "RECOGER" && x.modo !== "DOMICILIO") return mal("MODO_INVALIDO");
  const modo: Modo = x.modo;
  const zonaCruda = x.zona_id ?? null;
  if (zonaCruda !== null && !esUuid(zonaCruda)) return mal("ZONA_INVALIDA");
  const zona_id = zonaCruda as string | null;
  if (!Array.isArray(x.items) || x.items.length === 0 || x.items.length > MAX_RENGLONES || !x.items.every(objeto)) return mal("CARRITO_INVALIDO");
  // La nota de cada renglón es texto libre del público, como el nombre o la dirección: sale limpia
  // y acotada, o no sale. Del resto del renglón aquí no se mira nada: lo valida SQL contra el menú.
  const items: unknown[] = x.items.map(({ nota, ...resto }) => {
    const limpia = textoLimpio(nota, 200);
    return limpia === null ? resto : { ...resto, nota: limpia };
  });
  if (accion === "cotizar") return { ok: true, valor: { accion, negocio, sucursal_id, modo, zona_id, items } };

  // pedir
  if (!objeto(x.cliente)) return mal("CLIENTE_INVALIDO");
  const nombre = textoLimpio(x.cliente.nombre, 100);
  const telefono = normalizarTelefono(x.cliente.telefono);
  const emailCrudo = x.cliente.email ?? null;
  // Un campo opcional del formulario que llega vacío es un correo ausente, no un error.
  const email = emailCrudo === null ? null : typeof emailCrudo === "string" ? (emailCrudo.trim().toLowerCase() || null) : "";
  if (!nombre || !telefono || (email !== null && (email.length > 254 || !CORREO.test(email)))) return mal("CLIENTE_INVALIDO");

  let direccion: Direccion | null = null;
  if (modo === "DOMICILIO") {
    direccion = leerDireccion(x.direccion);
    if (!direccion) return mal("DIRECCION_INVALIDA");
  } else if ((x.direccion ?? null) !== null) {
    return mal("DIRECCION_INVALIDA");
  }

  if (x.pago !== "EFECTIVO" && x.pago !== "TARJETA") return mal("PAGO_INVALIDO");
  const paga_con = leerImporte(x.paga_con);
  if (paga_con === undefined || (x.pago === "TARJETA" && paga_con !== null)) return mal("PAGO_INVALIDO");
  const total_esperado = leerImporte(x.total_esperado);
  if (total_esperado === undefined) return mal("PAGO_INVALIDO");

  return { ok: true, valor: {
    accion, negocio, sucursal_id, modo, zona_id, items,
    cliente: { nombre, telefono, email }, direccion, pago: x.pago, paga_con, total_esperado,
    nota: textoLimpio(x.nota, 300), captcha: typeof x.captcha === "string" && x.captcha.length <= 4096 ? x.captcha : null,
  } };
}
