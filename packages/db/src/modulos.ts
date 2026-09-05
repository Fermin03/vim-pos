/**
 * Catálogo de módulos que VIM permite por cliente (ADR 0014). Los códigos son los mismos que
 * escribe la migración 0103 en `planes.features_incluidos->'modulos'` y los que lee
 * `modulos_efectivos()`. Agregar uno aquí sin migración no lo enciende en ningún lado.
 */
export type CodigoModulo = "cfdi" | "delivery_apps" | "kds" | "recetas" | "reservaciones" | "promociones";

export type Modulo = {
  codigo: CodigoModulo;
  nombre: string;
  descripcion: string;
  /** Columna de configuracion_tenant que el dueño enciende, o null si no hay interruptor. */
  interruptorDueno: "modulo_inventario_activo" | null;
  /** true = el permiso lo decide el add-on CFDI, no un flag. */
  porAddon: boolean;
};

export const MODULOS: readonly Modulo[] = [
  { codigo: "cfdi", nombre: "Facturación electrónica", descripcion: "Timbrado CFDI desde el admin y el portal de autofactura.", interruptorDueno: null, porAddon: true },
  { codigo: "delivery_apps", nombre: "Apps de delivery", descripcion: "Uber Eats, DiDi y Rappi entrando a la caja.", interruptorDueno: null, porAddon: false },
  { codigo: "kds", nombre: "Pantalla de cocina", descripcion: "Comandas en pantalla por área de preparación.", interruptorDueno: null, porAddon: false },
  { codigo: "recetas", nombre: "Recetas e inventario", descripcion: "Insumos, compras y descuento de inventario al vender.", interruptorDueno: "modulo_inventario_activo", porAddon: false },
  { codigo: "reservaciones", nombre: "Reservaciones", descripcion: "Mesas reservadas visibles desde la caja.", interruptorDueno: null, porAddon: false },
  { codigo: "promociones", nombre: "Promociones", descripcion: "Descuentos programados por producto o categoría.", interruptorDueno: null, porAddon: false },
];
