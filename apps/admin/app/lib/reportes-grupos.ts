import { puedeVer } from "./acceso";
import type { ReportesDisponibles } from "./reportes";

/** Los reportes del índice, agrupados por la pregunta que responde cada uno. Los usa el índice
 *  (`/reportes`) y el menú lateral (Informes), para que ambos enseñen lo mismo. */
export type Modulo = keyof ReportesDisponibles;
export type Reporte = { href: string; titulo: string; descripcion: string; modulo?: Modulo };
export type GrupoReportes = { id: string; titulo: string; ayuda: string; reportes: Reporte[] };

export const GRUPOS: GrupoReportes[] = [
  {
    id: "que-se-vende",
    titulo: "Qué se vende",
    ayuda: "La venta desglosada por producto, por categoría y por canal.",
    reportes: [
      { href: "/reportes/ventas-producto", titulo: "Ventas por producto", descripcion: "Qué se vende más: unidades, venta y la parte que aporta cada producto." },
      { href: "/reportes/ventas-variantes", titulo: "Ventas por talla y color", descripcion: "Qué talla y color se vende más y cuánto te deja cada uno.", modulo: "existencias" },
      { href: "/reportes/ventas-categoria", titulo: "Ventas por categoría", descripcion: "La venta repartida por las categorías de tu menú." },
      { href: "/reportes/modo-servicio", titulo: "Ventas por tipo de servicio", descripcion: "Comer aquí, para llevar, a domicilio y apps: cuánto aporta cada uno." },
      { href: "/reportes/apps-externas", titulo: "Ventas por apps de delivery", descripcion: "Uber Eats, Rappi y DiDi: venta, comisión y lo que depositó cada app.", modulo: "apps" },
      { href: "/reportes/ventas-marca", titulo: "Ventas por marca virtual", descripcion: "Cómo le va a cada marca que opera desde tu cocina.", modulo: "marcas" },
      { href: "/reportes/eventos", titulo: "Ventas por evento", descripcion: "Ferias y eventos: venta, comisión del organizador y lo que te quedó.", modulo: "eventos" },
    ],
  },
  {
    id: "operacion",
    titulo: "Cómo va la operación",
    ayuda: "Cierres de caja, el equipo y los tiempos de cocina.",
    reportes: [
      { href: "/reportes/z-historico", titulo: "Cortes de turno", descripcion: "Cada cierre de caja: lo vendido, el efectivo esperado contra el contado y quién cerró." },
      { href: "/reportes/ventas-mesero", titulo: "Ventas por mesero", descripcion: "Tickets, venta y propinas de cada mesero.", modulo: "meseros" },
      { href: "/reportes/comisiones", titulo: "Comisiones", descripcion: "Cuánto se le paga a cada colaborador en el periodo: comisiones y sueldo.", modulo: "agenda" },
      { href: "/reportes/ventas-colaborador", titulo: "Ventas por colaborador", descripcion: "Qué vende cada colaborador y qué servicios se venden más.", modulo: "agenda" },
      { href: "/reportes/citas", titulo: "Citas y faltas", descripcion: "Citas atendidas, canceladas y clientas que no llegaron, por colaborador y por servicio.", modulo: "agenda" },
      { href: "/reportes/ocupacion", titulo: "Ocupación", descripcion: "Qué parte del horario de cada colaborador estuvo agendada.", modulo: "agenda" },
      { href: "/reportes/ventas-area", titulo: "Ventas por estación", descripcion: "Cuánto prepara y cuánto vende cada estación de la cocina." },
      { href: "/reportes/tiempos-cocina", titulo: "Tiempos de cocina", descripcion: "Cuánto tarda en salir la comida contra tu objetivo." },
    ],
  },
  {
    id: "inventario-costos",
    titulo: "Inventario y costos",
    ayuda: "Lo que entra y sale de tu inventario, y cuánto te cuesta lo que vendes.",
    reportes: [
      { href: "/reportes/costo-ventas", titulo: "Costo de ventas y margen", descripcion: "Cuánto te costó lo que vendiste y cuánto te quedó, producto por producto.", modulo: "inventario" },
      { href: "/inventario/movimientos", titulo: "Movimientos de inventario", descripcion: "Compras, consumo por ventas, mermas y ajustes, insumo por insumo.", modulo: "inventario" },
    ],
  },
  {
    id: "que-vigilar",
    titulo: "Qué vigilar",
    ayuda: "Señales que conviene revisar de cerca.",
    reportes: [
      { href: "/reportes/descuentos", titulo: "Descuentos por usuario", descripcion: "Quién da descuentos y cortesías, y cuánto suman frente a la venta." },
      { href: "/reportes/reimpresiones", titulo: "Reimpresiones por cajero", descripcion: "Reimprimir mucho puede esconder producto que salió sin cobrar." },
      { href: "/reportes/no-shows", titulo: "Reservas que no llegaron", descripcion: "Reservas que se quedaron esperando y comensales perdidos.", modulo: "reservaciones" },
    ],
  },
  {
    id: "varias-sucursales",
    titulo: "Varias sucursales",
    ayuda: "Tu cadena, sucursal por sucursal.",
    reportes: [
      { href: "/reportes/consolidado", titulo: "Consolidado por sucursal", descripcion: "Venta, tickets y participación de cada sucursal, una junto a otra.", modulo: "variasSucursales" },
    ],
  },
];

/** La regla del índice: el rol lo puede abrir y, salvo `verTodos`, su módulo está en uso. Sin
 *  jerarquía (perfil cargando) o sin disponibilidad (lectura fallida) no se esconde nada. Lo de
 *  tienda y de belleza es la excepción: solo con el módulo confirmado, ni cargando ni con «Verlos». */
export function reporteVisible(r: Reporte, disponibles: ReportesDisponibles | null, jerarquia: number | null, verTodos = false): boolean {
  const permitido = (jerarquia === null || puedeVer(jerarquia, r.href))
    && (r.modulo !== "existencias" || disponibles?.existencias === true)
    && (r.modulo !== "agenda" || disponibles?.agenda === true);
  return permitido && (verTodos || !r.modulo || !disponibles || disponibles[r.modulo]);
}

/** Los grupos que el índice enseñaría a este negocio y rol. */
export function idsGruposVisibles(disponibles: ReportesDisponibles | null, jerarquia: number | null): ReadonlySet<string> {
  return new Set(GRUPOS.filter((g) => g.reportes.some((r) => reporteVisible(r, disponibles, jerarquia))).map((g) => g.id));
}
