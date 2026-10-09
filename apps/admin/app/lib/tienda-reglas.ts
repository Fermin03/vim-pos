// Reglas puras del apartado Tienda en línea del admin: dirección, horario y lista de revisión.
// Sin supabase ni efectos: se prueban solas. Los candados de verdad están en la base (0162/0163).

export const BASE_TIENDA = "pedidos.vimpos.com.mx";

/** Las mismas del CHECK de `tienda_config_slug_check` (0163, ampliadas en 0165); una prueba las compara con el .sql vigente. */
export const DIRECCIONES_RESERVADAS: readonly string[] = [
  "api", "admin", "pedido", "cuenta", "privacidad", "terminos", "static", "assets",
  "vim", "vimpos", "soporte", "login", "pago", "ayuda", "www", "tienda",
  // 0165: rutas que la tienda pública usa o puede usar, y parecidos a VIM.
  "seguimiento", "carrito", "entrar", "registro", "salir", "icon", "manifest", "robots", "sitemap",
  "favicon", "menu", "inicio", "app", "legal", "aviso", "contacto", "vim-pos", "soporte-vim", "pedidos",
];

const FORMA_DIRECCION = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

/** null = válida. Si no, el motivo en palabras del dueño. */
export function errorDeDireccion(d: string): string | null {
  if (d.length < 3 || d.length > 40) return "La dirección debe tener de 3 a 40 caracteres.";
  if (!FORMA_DIRECCION.test(d)) return "Usa solo letras, números y guiones, sin acentos y sin guion al inicio ni al final.";
  if (DIRECCIONES_RESERVADAS.includes(d)) return "Esa palabra está reservada. Elige otra.";
  return null;
}

/** "Knock-Out Burger León" → "knock-out-burger-leon". Devuelve "" si no sale una dirección válida. */
export function sugerirDireccion(nombreNegocio: string): string {
  const d = nombreNegocio
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "").slice(0, 40).replace(/-+$/, "");
  return errorDeDireccion(d) === null ? d : "";
}

// Las reglas del horario que también usa la tienda pública viven en @vim/fecha; aquí se re-exportan
// para que el admin las siga importando de un solo lugar.
import { DIAS, cruzaMedianoche, horaValida, type Dia, type Horario } from "@vim/fecha";
export { DIAS, cruzaMedianoche, horaValida, leerHorario, type Dia, type Horario } from "@vim/fecha";

/** null = válido. Apertura = cierre se permite (abre todo el día). */
export function errorDeHorario(h: Horario): string | null {
  for (const { dia, nombre } of DIAS) {
    const r = h[dia];
    if (r && !(horaValida(r[0]) && horaValida(r[1]))) return `${nombre}: escribe las horas como 09:00 o 22:30.`;
  }
  return null;
}

/** Lo que se dice junto a un rango que no es el de siempre. Con una hora a medias no se dice nada. */
export function notaDeRango(rango: [string, string]): string | null {
  if (!horaValida(rango[0]) || !horaValida(rango[1])) return null;
  if (rango[0] === rango[1]) return "Abre todo el día";
  return cruzaMedianoche(rango) ? "Cierra al día siguiente" : null;
}

/** El rango del día dado a los siete; si ese día está cerrado, cierra todos. */
export function copiarATodos(h: Horario, desde: Dia): Horario {
  const r = h[desde];
  const nuevo: Horario = {};
  if (r) for (const { dia } of DIAS) nuevo[dia] = [r[0], r[1]];
  return nuevo;
}

export type SucursalTienda = {
  id: string; nombre: string; telefono: string; activa: boolean;
  participa: boolean; recoger: boolean; domicilio: boolean; horario: Horario; zonasActivas: number;
};

/** Lo que el dueño edita de una sucursal en la tarjeta, antes de guardarlo. */
export type BorradorSucursal = Pick<SucursalTienda, "participa" | "recoger" | "domicilio" | "horario">;

/** ¿La tarjeta tiene algo distinto de lo guardado? El horario se compara por día, no por objeto. */
export function hayCambiosDeSucursal(b: BorradorSucursal, guardada: BorradorSucursal): boolean {
  return b.participa !== guardada.participa || b.recoger !== guardada.recoger || b.domicilio !== guardada.domicilio
    || DIAS.some(({ dia }) => b.horario[dia]?.join() !== guardada.horario[dia]?.join());
}

/** null = se puede guardar. Las horas mal escritas las dice `erroresPorDia`, junto a su renglón. */
export function errorDeSucursal(b: BorradorSucursal): string | null {
  return b.participa && !b.recoger && !b.domicilio ? "Elige si ofrece recoger, domicilio o ambos." : null;
}

/**
 * Una sucursal inactiva no puede empezar a vender; si ya vendía, sí se puede apagar. Lo decide lo
 * GUARDADO: con el borrador, el interruptor se bloquearía solo en cuanto el dueño lo apaga.
 */
export function interruptorDeSucursalBloqueado(guardada: Pick<SucursalTienda, "activa" | "participa">): boolean {
  return !guardada.activa && !guardada.participa;
}

/** Lo que se manda a guardar. Si no participa, el horario no se ve: va el guardado, no uno a medias. */
export function paraGuardarSucursal(b: BorradorSucursal, guardada: BorradorSucursal): BorradorSucursal {
  return { participa: b.participa, recoger: b.recoger, domicilio: b.domicilio, horario: b.participa ? b.horario : guardada.horario };
}

/** El error de `errorDeHorario` repartido por día, para pintarlo junto a su renglón. */
export function erroresPorDia(h: Horario): Partial<Record<Dia, string>> {
  const r: Partial<Record<Dia, string>> = {};
  for (const { dia } of DIAS) {
    const rango = h[dia];
    const e = rango ? errorDeHorario({ [dia]: rango }) : null;
    if (e) r[dia] = e;
  }
  return r;
}

export type Revision = { nivel: "bloquea" | "advierte"; texto: string; enlace?: { href: string; etiqueta: string } };

/** Lo que falta para poder encender. Sin bloqueos = se puede encender. */
export function revisar(d: {
  hayDireccion: boolean; sucursales: SucursalTienda[];
  productosSinFoto: number; productosSinDescripcion: number; productosEnCategoriaInactiva: number;
}): Revision[] {
  const r: Revision[] = [];
  const bloquea = (texto: string, enlace?: Revision["enlace"]) => r.push({ nivel: "bloquea", texto, ...(enlace && { enlace }) });
  if (!d.hayDireccion) bloquea("Elige la dirección de tu tienda.");
  const participantes = d.sucursales.filter((s) => s.participa);
  if (participantes.length === 0) bloquea("Elige al menos una sucursal que venda en la tienda.");
  for (const s of participantes) {
    if (!s.recoger && !s.domicilio) bloquea(`${s.nombre}: elige si ofrece recoger, domicilio o ambos.`);
    if (Object.keys(s.horario).length === 0) bloquea(`${s.nombre}: ponle horario.`);
    if (s.telefono.trim() === "") bloquea(`${s.nombre}: le falta teléfono.`, { href: "/configuracion/sucursales", etiqueta: "Ir a sucursales" });
    if (s.domicilio && s.zonasActivas === 0) {
      bloquea(`${s.nombre}: para domicilio necesita al menos una zona de envío.`, { href: "/configuracion/envios", etiqueta: "Ir a zonas de envío" });
    }
    if (!s.activa) bloquea(`${s.nombre} está inactiva.`);
  }
  const avisa = (n: number, uno: string, varios: string, enlace?: Revision["enlace"]) => {
    if (n > 0) r.push({ nivel: "advierte", texto: n === 1 ? `1 ${uno}` : `${n} ${varios}`, ...(enlace && { enlace }) });
  };
  avisa(d.productosSinFoto, "producto no tiene foto. Se vende igual, pero con foto se pide más.",
    "productos no tienen foto. Se venden igual, pero con foto se piden más.", { href: "/catalogo/productos", etiqueta: "Ir al catálogo" });
  avisa(d.productosSinDescripcion, "producto no tiene descripción.", "productos no tienen descripción.");
  avisa(d.productosEnCategoriaInactiva, "producto está en una categoría inactiva y no aparece en la tienda.",
    "productos están en una categoría inactiva y no aparecen en la tienda.");
  return r;
}

export function puedeEncender(r: Revision[]): boolean {
  return !r.some((x) => x.nivel === "bloquea");
}

/** Traduce un error de la base a palabras del dueño. */
export function mensajeTienda(e: { message?: string; code?: string } | null | undefined, porDefecto: string): string {
  const m = e?.message ?? "";
  if (m.includes("tienda_config_slug_key")) return "Esa dirección ya la usa otro negocio. Prueba con otra.";
  if (m.includes("tienda_config_slug_check")) return "La dirección solo puede llevar letras, números y guiones, de 3 a 40 caracteres, y no puede ser una palabra reservada.";
  if (m.includes("tienda_config_color_check")) return "El color no es válido.";
  if (m.includes("tienda_config_algun_pago")) return "Deja activa al menos una forma de pago.";
  if (m.includes("SIN_ADDON_TIENDA")) return "Tu plan no incluye la tienda en línea.";
  if (m.includes("SIN_TIENDA_CONFIGURADA")) return "Primero guarda la dirección de tu tienda.";
  // 42501 después de los candados de la tienda: esos salen con el mismo código y tienen su frase.
  if (e?.code === "42501" || /row-level security|permission denied|SOLO_ADMIN/i.test(m)) return "Solo el dueño o un administrador puede cambiar esto.";
  return porDefecto;
}
