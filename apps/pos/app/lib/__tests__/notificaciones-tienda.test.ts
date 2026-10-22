import { describe, it, expect } from "vitest";
import type { Producto } from "../catalogo";
import type { Aviso } from "../directivas";
import { notificacionesTienda, sinVer, unirAvisos } from "../notificaciones-tienda";
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

describe("unirAvisos", () => {
  const ahora = Date.parse("2026-10-17T12:00:00Z");
  const av = (id: string, vigente_hasta: string | null = null, titulo = id): Aviso => ({ ...aviso, id, titulo, vigente_hasta });
  it("conserva los guardados que la nube ya no manda (acusados) y une por id, ganando el nuevo", () => {
    const r = unirAvisos([av("a1", null, "viejo"), av("a2")], [av("a1", null, "nuevo"), av("a3")], ahora);
    expect(r.map((a) => [a.id, a.titulo])).toEqual([["a1", "nuevo"], ["a3", "a3"], ["a2", "a2"]]);
  });
  it("tira los que ya vencieron, guardados o nuevos", () => {
    const r = unirAvisos([av("g", "2026-10-17T11:59:59Z"), av("h", "2026-10-18T00:00:00Z")], [av("n", "2026-10-01T00:00:00Z")], ahora);
    expect(r.map((a) => a.id)).toEqual(["h"]);
  });
  it("guarda como mucho los 20 más nuevos", () => {
    const guardados = Array.from({ length: 25 }, (_, i) => av(`g${i}`));
    const r = unirAvisos(guardados, [av("n1"), av("n2")], ahora);
    expect(r).toHaveLength(20);
    expect(r.slice(0, 3).map((a) => a.id)).toEqual(["n1", "n2", "g0"]);
  });
  it("una fecha de vigencia que no se entiende cuenta como vencida", () => {
    expect(unirAvisos([av("x", "ayer")], [av("y", "no es fecha")], ahora)).toEqual([]);
  });
});
