// Lógica pura de la página de la tienda (el estado vive en `(panel)/tienda/use-tienda.ts`).
import type { ConfigTienda, DatosConfigTienda } from "./tienda";
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
  | { tipo: "config"; datos: DatosConfigTienda }
  | { tipo: "interruptor"; encendida: boolean }
  | { tipo: "sucursal"; id: string; datos: BorradorSucursal };

/**
 * Lo guardado DESPUÉS de una escritura que sí entró, sin esperar a volver a leer. Si la relectura
 * falla, la pantalla ya tiene lo que quedó en la base: el otro bloque no manda de vuelta la dirección
 * vieja, y una sucursal guardada no se ve como sin guardar.
 */
export function trasEscribir(l: Leido, e: Escritura): Leido {
  if (e.tipo === "interruptor") return { ...l, interruptor: e.encendida };
  if (e.tipo === "sucursal") return { ...l, sucursales: l.sucursales.map((s) => (s.id === e.id ? { ...s, ...e.datos } : s)) };
  return {
    ...l,
    config: {
      // El logo no viaja en este guardado: se conserva el que había.
      logoRuta: l.config?.logoRuta ?? null, logoUrl: l.config?.logoUrl ?? null,
      ...e.datos,
      // Igual que `guardarConfigTienda`: en blanco se guarda vacía.
      descripcion: e.datos.descripcion.trim() === "" ? "" : e.datos.descripcion,
    },
  };
}

/** Lo que el dueño escribió, como dirección: minúsculas y guiones en vez de espacios. No arregla lo demás. */
export function normalizarDireccion(d: string): string {
  return d.trim().toLowerCase().replace(/\s+/g, "-");
}
