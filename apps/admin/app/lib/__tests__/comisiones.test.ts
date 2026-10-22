import { describe, expect, it } from "vitest";
import { agruparVentasColaborador, filaComision } from "../reportes";

const DIEGO = "99999999-0000-0000-0000-0000000000f1";
const MARIA = "99999999-0000-0000-0000-000000000001";
const nombres = new Map([[DIEGO, "Diego"], [MARIA, "María"]]);

const renglones = [
  { colaborador_id: DIEGO, producto_nombre: "Corte", ticket_id: "t1", venta_mxn: 139.66, comision_mxn: 55.86 },
  { colaborador_id: DIEGO, producto_nombre: "Shampoo", ticket_id: "t1", venta_mxn: 86.21, comision_mxn: 8.62 },
  { colaborador_id: DIEGO, producto_nombre: "Corte", ticket_id: "t2", venta_mxn: 155.17, comision_mxn: 62.07 },
  { colaborador_id: MARIA, producto_nombre: "Corte", ticket_id: "t3", venta_mxn: 155.17, comision_mxn: 0 },
];

describe("agruparVentasColaborador", () => {
  it("por colaborador: renglones, tickets distintos y ventas al centavo, de más a menos", () => {
    expect(agruparVentasColaborador(renglones, "colaborador", nombres)).toEqual([
      { clave: DIEGO, nombre: "Diego", veces: 3, tickets: 2, ventas: 381.04, comision: 126.55 },
      { clave: MARIA, nombre: "María", veces: 1, tickets: 1, ventas: 155.17, comision: 0 },
    ]);
  });
  it("por servicio junta a todos los colaboradores", () => {
    const f = agruparVentasColaborador(renglones, "servicio", nombres);
    expect(f.map((x) => [x.nombre, x.veces, x.tickets, x.ventas])).toEqual([["Corte", 3, 3, 450], ["Shampoo", 1, 1, 86.21]]);
  });
  it("un colaborador que ya no está en la lista de empleados no se pierde", () => {
    expect(agruparVentasColaborador(renglones.slice(0, 1), "colaborador", new Map())[0]!.nombre).toBe("Empleado dado de baja");
  });
  it("sin renglones, sin filas", () => {
    expect(agruparVentasColaborador([], "colaborador", nombres)).toEqual([]);
  });
});

describe("filaComision", () => {
  it("lee la fila de comisiones_periodo (numeric puede llegar como texto)", () => {
    expect(filaComision({
      usuario_id: DIEGO, nombre: "Diego", servicios: 2, ventas_mxn: "381.04", comision_servicios_mxn: "117.93",
      comision_productos_mxn: 8.62, sueldo_mxn: "1500.00", total_mxn: "1626.55",
    })).toEqual({ clave: DIEGO, nombre: "Diego", servicios: 2, ventas: 381.04, comisionServicios: 117.93, comisionProductos: 8.62, sueldo: 1500, total: 1626.55 });
  });
});
