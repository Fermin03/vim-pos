"use client";
import type { Producto } from "./catalogo";
import type { GrupoModificadores, OpcionModificador } from "./modificadores";
import type { ClienteDomicilio } from "./clientes-domicilio";

export type ModoServicio = "COMER_AQUI" | "PARA_LLEVAR" | "DRIVE_THRU" | "DELIVERY_PROPIO";

export type ModificadorSel = {
  opcionId: string;
  grupoNombre: string;
  opcionNombre: string;
  precioExtra: number;
  cantidad: number;
};

export type LineaCarrito = {
  clientId: string;
  producto: Producto;
  cantidad: number;
  modificadores: ModificadorSel[];
  notaCocina: string | null;
};

export type EstadoCarrito = {
  modoServicio: ModoServicio;
  lineas: LineaCarrito[];
  clienteDomicilio?: ClienteDomicilio | null;
};

export const estadoInicial: EstadoCarrito = { modoServicio: "COMER_AQUI", lineas: [], clienteDomicilio: null };

export type AccionCarrito =
  | { tipo: "agregar"; linea: LineaCarrito }
  | { tipo: "cantidad"; clientId: string; cantidad: number }
  | { tipo: "quitar"; clientId: string }
  | { tipo: "modo"; modo: ModoServicio }
  | { tipo: "cliente"; cliente: ClienteDomicilio | null }
  | { tipo: "cargar"; estado: EstadoCarrito }
  | { tipo: "limpiar" };

export function reducerCarrito(estado: EstadoCarrito, accion: AccionCarrito): EstadoCarrito {
  switch (accion.tipo) {
    case "agregar":
      return { ...estado, lineas: [...estado.lineas, accion.linea] };
    case "cargar":
      // T2 — reemplaza el carrito completo (reconstrucción desde un ticket persistido de mesa).
      return accion.estado;
    case "cantidad":
      return {
        ...estado,
        lineas: estado.lineas
          .map((l) => (l.clientId === accion.clientId ? { ...l, cantidad: accion.cantidad } : l))
          .filter((l) => l.cantidad > 0),
      };
    case "quitar":
      return { ...estado, lineas: estado.lineas.filter((l) => l.clientId !== accion.clientId) };
    case "modo":
      // Al salir de Domicilio se limpia el cliente asociado.
      return { ...estado, modoServicio: accion.modo, clienteDomicilio: accion.modo === "DELIVERY_PROPIO" ? estado.clienteDomicilio ?? null : null };
    case "cliente":
      return { ...estado, clienteDomicilio: accion.cliente };
    case "limpiar":
      return { modoServicio: estado.modoServicio, lineas: [], clienteDomicilio: estado.clienteDomicilio ?? null };
    default:
      return estado;
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

/** Precio unitario de una línea: base + suma de modificadores (precio_extra * cantidad de cada modif). */
export function precioUnitarioLinea(l: LineaCarrito): number {
  const modif = l.modificadores.reduce((acc, m) => acc + m.precioExtra * m.cantidad, 0);
  return r2(l.producto.precio_base_mxn + modif);
}

/** Total bruto de una línea (precio unitario * cantidad). */
export function totalLinea(l: LineaCarrito): number {
  return r2(precioUnitarioLinea(l) * l.cantidad);
}

export type TotalesDisplay = { subtotal: number; iva: number; total: number };

/**
 * Totales de DISPLAY. Asume IVA incluido en precio (caso Knock-Out: productos.iva_incluido_en_precio=true).
 * Tasa fija 16% para display; la BD recalcula con la tasa real por producto al cobrar.
 */
export function calcularTotalesDisplay(lineas: LineaCarrito[], tasaIva = 16): TotalesDisplay {
  const total = r2(lineas.reduce((acc, l) => acc + totalLinea(l), 0));
  const subtotal = r2(total / (1 + tasaIva / 100));
  const iva = r2(total - subtotal);
  return { subtotal, iva, total };
}

/** Construye la selección de modificadores por defecto de un grupo (para UNICA_OBLIGATORIA). */
export function seleccionInicialGrupo(g: GrupoModificadores): OpcionModificador[] {
  if (g.tipoSeleccion === "UNICA_OBLIGATORIA") {
    const def = g.opciones.find((o) => o.esDefault) ?? g.opciones[0];
    return def ? [def] : [];
  }
  return [];
}

/** Genera un uuid de cliente para `client_id_local`. */
export function nuevoClientId(): string {
  return crypto.randomUUID();
}
