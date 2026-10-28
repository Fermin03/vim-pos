import { test } from "node:test"
import assert from "node:assert/strict"
import { filaProspecto, sinNulos } from "./prospecto.ts"

const d = { nombre: " Ana ", negocio: "Tacos", cajas: 1, sucursales: 1, giro: null, ciudad: null, mensaje: null }

test("número de México: 10 dígitos; de otro país: completo", () => {
  assert.equal(filaProspecto(d, "5214771234567").whatsapp, "4771234567")
  assert.equal(filaProspecto(d, "14155550123").whatsapp, "14155550123")
  assert.equal(filaProspecto(d, "573001234567").whatsapp, "573001234567")
})

test("giro fuera de la lista y ciudad van al mensaje", () => {
  const f = filaProspecto({ ...d, giro: "pizzería", ciudad: "León", mensaje: "2 cajas" }, "5214771234567")
  assert.equal(f.giro, null)
  assert.equal(f.mensaje, "2 cajas. Giro: pizzería. Ciudad: León")
  assert.equal(filaProspecto({ ...d, giro: "taqueria" }, "52").giro, "TAQUERIA")
})

test("al actualizar no se pisan con null el giro ni el mensaje", () => {
  const c = sinNulos(filaProspecto(d, "5214771234567"))
  assert.ok(!("giro" in c) && !("mensaje" in c))
  assert.equal(c.nombre, "Ana")
})
