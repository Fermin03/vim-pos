"use client";
import type { Producto } from "./catalogo";
import type { GrupoModificadores, OpcionModificador } from "./modificadores";
import type { ClienteDomicilio } from "./clientes-domicilio";
import type { ComboDef, ComponenteSel } from "./combos";

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
  /** Solo líneas de combo: el padre es `producto`, los hijos son `componentes`. `precioUnitario` se
   *  congela al confirmar (precioCombo) para que la línea no dependa del catálogo después. */
  combo?: { def: ComboDef; componentes: ComponenteSel[]; precioUnitario: number };
};

export type EstadoCarrito = {
  modoServicio: ModoServicio;
  lineas: LineaCarrito[];
  clienteDomicilio?: ClienteDomicilio | null;
  /** Nota de cocina de TODA la orden (va a tickets.nota_general). */
  notaOrden?: string | null;
  /** Pick-up: nombre suelto para identificar la cuenta. NO es un cliente registrado. */
  nombreCuenta?: string | null;
};

export const estadoInicial: EstadoCarrito = { modoServicio: "COMER_AQUI", lineas: [], clienteDomicilio: null, notaOrden: null, nombreCuenta: null };

export type AccionCarrito =
  | { tipo: "agregar"; linea: LineaCarrito }
  | { tipo: "reemplazar"; linea: LineaCarrito }
  | { tipo: "cantidad"; clientId: string; cantidad: number }
  | { tipo: "quitar"; clientId: string }
  | { tipo: "modo"; modo: ModoServicio }
  | { tipo: "cliente"; cliente: ClienteDomicilio | null }
  | { tipo: "nota_linea"; clientId: string; nota: string | null }
  | { tipo: "nota_orden"; nota: string | null }
  | { tipo: "nombre_cuenta"; nombre: string | null }
  | { tipo: "cargar"; estado: EstadoCarrito }
  | { tipo: "limpiar" };

export function reducerCarrito(estado: EstadoCarrito, accion: AccionCarrito): EstadoCarrito {
  switch (accion.tipo) {
    case "agregar":
      return { ...estado, lineas: [...estado.lineas, accion.linea] };
    case "reemplazar":
      // Sustituye la línea EN SU LUGAR (edición de combo desde el ticket): no se debe reordenar.
      return { ...estado, lineas: estado.lineas.map((l) => (l.clientId === accion.linea.clientId ? accion.linea : l)) };
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
      return { ...estado, modoServicio: accion.modo, clienteDomicilio: accion.modo === "DELIVERY_PROPIO" ? estado.clienteDomicilio ?? null : null, nombreCuenta: accion.modo === "DRIVE_THRU" ? estado.nombreCuenta ?? null : null };
    case "cliente":
      return { ...estado, clienteDomicilio: accion.cliente };
    case "nombre_cuenta":
      return { ...estado, nombreCuenta: accion.nombre };
    case "nota_linea":
      return {
        ...estado,
        lineas: estado.lineas.map((l) => (l.clientId === accion.clientId ? { ...l, notaCocina: accion.nota } : l)),
      };
    case "nota_orden":
      return { ...estado, notaOrden: accion.nota };
    case "limpiar":
      // La nota de orden es de ESTE pedido: se limpia con él.
      return { modoServicio: estado.modoServicio, lineas: [], clienteDomicilio: estado.clienteDomicilio ?? null, notaOrden: null, nombreCuenta: null };
    default:
      return estado;
  }
}

const r2 = (n: number): number => Math.round(n * 100) / 100;

const extrasDe = (mods: ModificadorSel[]): number => mods.reduce((acc, m) => acc + m.precioExtra * m.cantidad, 0);

/**
 * Precio unitario de una línea. Línea normal: base + extras de sus propios modificadores.
 * Línea de combo: precio del combo YA CONGELADO (no se recalcula del catálogo) + extras del
 * propio padre + extras de cada componente (cada uno multiplicado por su propia cantidad).
 */
export function precioUnitarioLinea(l: LineaCarrito): number {
  if (l.combo) {
    const extrasHijos = l.combo.componentes.reduce((acc, c) => acc + extrasDe(c.modificadores) * c.cantidad, 0);
    return r2(l.combo.precioUnitario + extrasDe(l.modificadores) + extrasHijos);
  }
  return r2(l.producto.precio_base_mxn + extrasDe(l.modificadores));
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
