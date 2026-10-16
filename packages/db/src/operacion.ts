/**
 * Giros y módulos de operación (ADR 0034). La tabla de qué módulos arranca cada giro vive en la
 * base (`juego_inicial_de_giro`, 0180); aquí solo están los nombres que ven el dueño y VIM, y la
 * regla para leer un módulo que todavía no llegó.
 */
export type CodigoGiro =
  | "QUICK_SERVICE" | "FULL_SERVICE" | "TAQUERIA" | "CAFETERIA" | "BAR" | "DARK_KITCHEN" | "FOODTRUCK"
  | "RETAIL" | "CAFE_BAR" | "ENTERPRISE";

export const GIROS: readonly { codigo: CodigoGiro; nombre: string; ofrecido: boolean }[] = [
  { codigo: "QUICK_SERVICE", nombre: "Comida rápida", ofrecido: true },
  { codigo: "FULL_SERVICE", nombre: "Restaurante con meseros", ofrecido: true },
  { codigo: "TAQUERIA", nombre: "Taquería o cocina económica", ofrecido: true },
  { codigo: "CAFETERIA", nombre: "Cafetería", ofrecido: true },
  { codigo: "BAR", nombre: "Bar", ofrecido: true },
  { codigo: "DARK_KITCHEN", nombre: "Cocina solo para apps", ofrecido: true },
  { codigo: "FOODTRUCK", nombre: "Food truck", ofrecido: true },
  // Tienda (ADR 0037): existe en la base, pero no se asigna hasta la entrega 5 del giro.
  { codigo: "RETAIL", nombre: "Tienda de ropa o calzado", ofrecido: false },
  // Retirados: se quedan para nombrar a quien ya los tiene.
  { codigo: "CAFE_BAR", nombre: "Cafetería o bar", ofrecido: false },
  { codigo: "ENTERPRISE", nombre: "Cadena", ofrecido: false },
];

export const nombreGiro = (codigo: string | null | undefined): string =>
  GIROS.find((g) => g.codigo === codigo)?.nombre ?? codigo ?? "—";

export type CodigoOperacion =
  | "mostrador" | "comedor" | "meseros" | "domicilio" | "repartidores"
  | "kds" | "reservaciones" | "marcas" | "eventos" | "cuentas_barra" | "existencias";

/** Lo que se enseña en el admin y en /platform. */
export const OPERACION: readonly { codigo: CodigoOperacion; nombre: string; descripcion: string; requiere?: CodigoOperacion }[] = [
  { codigo: "mostrador", nombre: "Mostrador", descripcion: "Para llevar y Pick-up en la caja." },
  { codigo: "comedor", nombre: "Comedor", descripcion: "Mesas, mapa y cuentas abiertas por mesa." },
  { codigo: "meseros", nombre: "Meseros", descripcion: "Mesero por mesa, sus propinas y el reporte por mesero.", requiere: "comedor" },
  { codigo: "domicilio", nombre: "Domicilio", descripcion: "Pedidos a domicilio propios y zonas de envío." },
  { codigo: "repartidores", nombre: "Repartidores", descripcion: "Asignar cada pedido a uno de tus repartidores.", requiere: "domicilio" },
  { codigo: "kds", nombre: "Pantalla de cocina", descripcion: "Las comandas en pantalla, por estación." },
  { codigo: "reservaciones", nombre: "Reservaciones", descripcion: "Mesas reservadas visibles desde la caja." },
  { codigo: "marcas", nombre: "Marcas virtuales", descripcion: "Varias marcas desde la misma cocina." },
  { codigo: "eventos", nombre: "Eventos", descripcion: "Abrir el turno en una feria o un evento." },
  { codigo: "cuentas_barra", nombre: "Cuentas en barra", descripcion: "Cuentas a nombre de una persona, sin mesa." },
  { codigo: "existencias", nombre: "Existencias", descripcion: "Tallas y colores, código de barras y cuánto queda de cada prenda por sucursal." },
];

/**
 * ¿Está encendido? Lo que diga la base manda. Si la llave no llegó (caja con directivas viejas,
 * todavía cargando) se enseña lo de siempre: todo, menos eventos, cuentas en barra y existencias,
 * que antes nadie veía (eventos solo un food truck; existencias es de tienda, ADR 0037).
 */
export function moduloActivo(modulos: Record<string, boolean> | null | undefined, codigo: CodigoOperacion): boolean {
  const v = modulos?.[codigo];
  return typeof v === "boolean" ? v : codigo !== "eventos" && codigo !== "cuentas_barra" && codigo !== "existencias";
}
