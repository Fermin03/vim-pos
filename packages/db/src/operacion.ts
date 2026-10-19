/**
 * Giros y módulos de operación (ADR 0034). La tabla de qué módulos arranca cada giro vive en la
 * base (`juego_inicial_de_giro`, 0180); aquí solo están los nombres que ven el dueño y VIM, y la
 * regla para leer un módulo que todavía no llegó.
 */
export type CodigoGiro =
  | "QUICK_SERVICE" | "FULL_SERVICE" | "TAQUERIA" | "CAFETERIA" | "BAR" | "DARK_KITCHEN" | "FOODTRUCK"
  | "RETAIL" | "ABARROTES" | "FRUTERIA" | "FERRETERIA" | "VINOS"
  | "SALON" | "SPA" | "PELUQUERIA" | "BARBERIA" | "TATUAJES" | "CAFE_BAR" | "ENTERPRISE";

export const GIROS: readonly { codigo: CodigoGiro; nombre: string; ofrecido: boolean }[] = [
  { codigo: "QUICK_SERVICE", nombre: "Comida rápida", ofrecido: true },
  { codigo: "FULL_SERVICE", nombre: "Restaurante con meseros", ofrecido: true },
  { codigo: "TAQUERIA", nombre: "Taquería o cocina económica", ofrecido: true },
  { codigo: "CAFETERIA", nombre: "Cafetería", ofrecido: true },
  { codigo: "BAR", nombre: "Bar", ofrecido: true },
  { codigo: "DARK_KITCHEN", nombre: "Cocina solo para apps", ofrecido: true },
  { codigo: "FOODTRUCK", nombre: "Food truck", ofrecido: true },
  // Tienda (ADR 0037).
  { codigo: "RETAIL", nombre: "Tienda de ropa o calzado", ofrecido: true },
  { codigo: "ABARROTES", nombre: "Tienda de abarrotes o supermercado", ofrecido: true },
  { codigo: "FRUTERIA", nombre: "Frutería y verdulería", ofrecido: true },
  { codigo: "FERRETERIA", nombre: "Ferretería", ofrecido: true },
  { codigo: "VINOS", nombre: "Vinos y licores", ofrecido: true },
  // Belleza: se abren en la entrega 4 (cambiar_giro los rechaza hasta entonces).
  { codigo: "SALON", nombre: "Salón de belleza", ofrecido: false },
  { codigo: "SPA", nombre: "Spa", ofrecido: false },
  { codigo: "PELUQUERIA", nombre: "Peluquería", ofrecido: false },
  { codigo: "BARBERIA", nombre: "Barbería", ofrecido: false },
  { codigo: "TATUAJES", nombre: "Tatuajes y piercings", ofrecido: false },
  // Retirados: se quedan para nombrar a quien ya los tiene.
  { codigo: "CAFE_BAR", nombre: "Cafetería o bar", ofrecido: false },
  { codigo: "ENTERPRISE", nombre: "Cadena", ofrecido: false },
];

/** Giros de tienda: espejo de `es_giro_tienda` en la base (0206). */
export const GIROS_TIENDA: readonly CodigoGiro[] = ["RETAIL", "ABARROTES", "FRUTERIA", "FERRETERIA", "VINOS"];

export const esGiroTienda = (g: string | null | undefined): boolean => GIROS_TIENDA.some((t) => t === g);

/** Giros de belleza: espejo de `es_giro_belleza` en la base (0217). */
export const GIROS_BELLEZA: readonly CodigoGiro[] = ["SALON", "SPA", "PELUQUERIA", "BARBERIA", "TATUAJES"];

export const esGiroBelleza = (g: string | null | undefined): boolean => GIROS_BELLEZA.some((b) => b === g);

export const nombreGiro = (codigo: string | null | undefined): string =>
  GIROS.find((g) => g.codigo === codigo)?.nombre ?? codigo ?? "—";

export type CodigoOperacion =
  | "mostrador" | "comedor" | "meseros" | "domicilio" | "repartidores"
  | "kds" | "reservaciones" | "marcas" | "eventos" | "cuentas_barra" | "existencias" | "agenda";

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
  { codigo: "existencias", nombre: "Existencias", descripcion: "Existencias por producto: piezas, kilos, metros o litros." },
  { codigo: "agenda", nombre: "Agenda", descripcion: "Calendario de citas por colaborador." },
];

/**
 * ¿Está encendido? Lo que diga la base manda. Si la llave no llegó (caja con directivas viejas,
 * todavía cargando) se enseña lo de siempre: todo, menos eventos, cuentas en barra, existencias y agenda,
 * que antes nadie veía (eventos solo un food truck; existencias es de tienda, ADR 0037).
 */
export function moduloActivo(modulos: Record<string, boolean> | null | undefined, codigo: CodigoOperacion): boolean {
  const v = modulos?.[codigo];
  return typeof v === "boolean" ? v : codigo !== "eventos" && codigo !== "cuentas_barra" && codigo !== "existencias" && codigo !== "agenda";
}

/** Unidad de venta de un producto (`productos.tipo_venta`, 0206). La clave SAT la deriva la base. */
export const TIPOS_VENTA = ["UNIDAD", "PESO", "LONGITUD", "VOLUMEN"] as const;
export type TipoVenta = (typeof TIPOS_VENTA)[number];

/** La tabla de unidades del admin y de la caja: decimales que admite y título de la ventana de cantidad. */
export const UNIDADES_VENTA: Record<TipoVenta, { sat: string; nombre: string; abrev: string; decimales: number; titulo: string }> = {
  UNIDAD: { sat: "H87", nombre: "Pieza", abrev: "pz", decimales: 0, titulo: "Piezas" },
  PESO: { sat: "KGM", nombre: "Kilogramo", abrev: "kg", decimales: 3, titulo: "Peso" },
  LONGITUD: { sat: "MTR", nombre: "Metro", abrev: "m", decimales: 2, titulo: "Metros" },
  VOLUMEN: { sat: "LTR", nombre: "Litro", abrev: "l", decimales: 2, titulo: "Litros" },
};
