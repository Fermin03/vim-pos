import { describe, it, expect } from "vitest";
import type { Producto } from "../catalogo";
import type { Aviso } from "../directivas";
import { notificacionesTienda, sinVer } from "../notificaciones-tienda";
import type { Existencia } from "../tienda";

const prod = (id: string, extra: Partial<Producto> = {}): Producto => ({
  id, nombre: id, descripcion: null, precio_base_mxn: 100, categoria_id: "c", agotado: false, esCombo: false, seVendeAqui: true, controla_existencias: true, ...extra,
});
const ex = (producto_id: string, cantidad: number, minimo: number | null = null, sucursal_id = "s1"): Existencia => ({ producto_id, sucursal_id, cantidad, minimo });
const aviso: Aviso = { id: "a1", nivel: "info", titulo: "Mantenimiento", cuerpo: "Martes 8 pm", requiere_confirmacion: false, vigente_hasta: null };
const padre = prod("P", { nombre: "Playera", variante_ejes: ["Talla"], controla_existencias: true });
const hija = prod("h1", { nombre: "Playera M", producto_padre_id: "P", variante_valores: { Talla: "M" }, codigo_interno: "PL-M" });
const productos = [padre, hija, prod("A", { nombre: "Gorra" }), prod("B", { nombre: "Cinto" }), prod("C", { nombre: "Calcetas" }), prod("N", { controla_existencias: false })];

describe("notificacionesTienda", () => {
  it("agotadas y negativas primero, luego pocas, luego avisos", () => {
    const r = notificacionesTienda([ex("B", 1), ex("A", -2), ex("C", 0)], productos, "s1", [aviso]);
    expect(r.map((n) => n.titulo)).toEqual(["Calcetas", "Gorra", "Cinto", "Mantenimiento"]);
    expect(r.map((n) => n.nivel)).toEqual(["danger", "danger", "warning", "info"]);
  });
  it("una existencia normal no genera alerta; tampoco otra sucursal ni lo que no controla existencias", () => {
    const r = notificacionesTienda([ex("A", 50), ex("B", 0, null, "s2"), ex("N", 0), ex("P", 0)], productos, "s1", []);
    expect(r).toEqual([]);
  });
  it("los textos y la firma de cada alerta son exactos", () => {
    const r = notificacionesTienda([ex("A", -2), ex("C", 0), ex("B", 1)], productos, "s1", []);
    expect(r.map((n) => [n.id, n.detalle])).toEqual([
      ["C:agotada:0", "Agotada"],
      ["A:agotada:-2", "En negativo: -2"],
      ["B:pocas:1", "Pocas: 1"],
    ]);
  });
  it("una variante lleva el nombre del padre y su variante", () => {
    const [n] = notificacionesTienda([ex("h1", 0)], productos, "s1", []);
    expect(n!.titulo).toBe("Playera · M · PL-M");
    expect(n!.productoId).toBe("h1");
  });
  it("sin existencias cargadas solo salen los avisos", () => {
    expect(notificacionesTienda(null, productos, "s1", [aviso]).map((n) => n.id)).toEqual(["a1"]);
  });
});

describe("sinVer", () => {
  it("cuenta solo lo que no está en vistas", () => {
    const r = notificacionesTienda([ex("A", 0), ex("B", 1)], productos, "s1", [aviso]);
    expect(sinVer(r, [])).toBe(3);
    expect(sinVer(r, ["a1", "A:agotada:0"])).toBe(1);
  });
  it("al cambiar la cantidad, la alerta vuelve a contar", () => {
    const vistas = notificacionesTienda([ex("B", 1)], productos, "s1", []).map((n) => n.id);
    const despues = notificacionesTienda([ex("B", 0)], productos, "s1", []);
    expect(sinVer(despues, vistas)).toBe(1);
  });
});
