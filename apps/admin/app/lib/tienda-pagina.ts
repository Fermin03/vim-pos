// Lógica pura de la página de la tienda (el estado vive en `(panel)/tienda/use-tienda.ts`).
import type { BloqueConfig, ConfigTienda, DatosConfigTienda } from "./tienda";
import type { BorradorSucursal, SucursalTienda } from "./tienda-reglas";

/** Lo que hay en la base. `config` null = el dueño todavía no elige dirección. */
export type Leido = {
  config: ConfigTienda | null;
  sucursales: SucursalTienda[];
  /** El interruptor crudo: puede seguir en `true` con el complemento vencido. */
  interruptor: boolean;
  enPlan: boolean;
  pendientes: { sinFoto: number; sinDescripcion: number; enCategoriaInactiva: number };
};

/** Una escritura que la base ya aceptó, con lo que se le mandó. */
export type Escritura =
  /** `datos` es la configuración como la armó la página; a la base solo viajó lo de `bloque`. */
  | { tipo: "config"; bloque: BloqueConfig; datos: DatosConfigTienda }
  | { tipo: "interruptor"; encendida: boolean }
  | { tipo: "sucursal"; id: string; datos: BorradorSucursal }
  /** El logo se sube y se quita aparte del formulario; `null` = quedó sin logo. */
  | { tipo: "logo"; ruta: string | null; url: string | null };

/**
 * Lo guardado DESPUÉS de una escritura que sí entró, sin esperar a volver a leer. Si la relectura
 * falla, la pantalla ya tiene lo que quedó en la base, y una sucursal guardada no se ve como sin
 * guardar. De la configuración solo cambia lo del bloque que guardó: lo del otro no viajó.
 */
export function trasEscribir(l: Leido, e: Escritura): Leido {
  if (e.tipo === "interruptor") return { ...l, interruptor: e.encendida };
  // Sin dirección guardada no hay fila que tenga logo: no se inventa una configuración.
  if (e.tipo === "logo") return l.config ? { ...l, config: { ...l.config, logoRuta: e.ruta, logoUrl: e.url } } : l;
  if (e.tipo === "sucursal") return { ...l, sucursales: l.sucursales.map((s) => (s.id === e.id ? { ...s, ...e.datos } : s)) };
  const d = e.datos;
  // Igual que `guardarConfigTienda`: en blanco se guarda vacía.
  const deDatos = { direccion: d.direccion, color: d.color, descripcion: d.descripcion.trim() === "" ? "" : d.descripcion };
  const dePedidos = { aceptacion: d.aceptacion, minutosAceptacion: d.minutosAceptacion, pagoEfectivo: d.pagoEfectivo, pagoTarjeta: d.pagoTarjeta };
  // Sin fila todavía, el primer guardado la crea con todo (y sin logo).
  if (!l.config) return { ...l, config: { logoRuta: null, logoUrl: null, ...deDatos, ...dePedidos } };
  return { ...l, config: { ...l.config, ...(e.bloque === "datos" ? deDatos : dePedidos) } };
}

/**
 * Lo que el dueño escribió, como dirección: sin acentos (igual que `sugerirDireccion`: ü → u, ñ → n),
 * en minúsculas y con guiones en vez de espacios. No arregla lo demás.
 */
export function normalizarDireccion(d: string): string {
  return d.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, "-");
}
