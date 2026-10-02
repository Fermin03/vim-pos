// Pantalla del cliente: el segundo monitor, de cara al mostrador, que enseña la cuenta en captura.
//
// La caja la abre SOLA en cuanto hay un segundo monitor conectado: un restaurantero no va a entrar
// a un menú a elegir pantallas, y lo normal es que solo haya una candidata. La configuración local
// existe para los dos casos que la detección no puede adivinar: quien usa el segundo monitor para
// otra cosa (apagada) y quien tiene tres (cuál).
//
// Es local por la misma razón que la impresora: el hardware es de cada computadora.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const CONFIG_INICIAL = Object.freeze({ modo: "auto", displayId: null });

/** @returns {{ modo: "auto" | "apagada", displayId: number | null }} */
export function normalizarConfig(crudo) {
  if (!crudo || typeof crudo !== "object") return { ...CONFIG_INICIAL };
  if (crudo.modo !== "auto" && crudo.modo !== "apagada") return { ...CONFIG_INICIAL };
  const displayId = Number.isFinite(crudo.displayId) ? crudo.displayId : null;
  if (crudo.displayId != null && displayId === null) return { ...CONFIG_INICIAL };
  return { modo: crudo.modo, displayId };
}

export function leerConfig(archivo) {
  try { return normalizarConfig(JSON.parse(readFileSync(archivo, "utf8"))); } catch { return { ...CONFIG_INICIAL }; }
}

export function guardarConfig(archivo, config) {
  mkdirSync(path.dirname(archivo), { recursive: true });
  writeFileSync(archivo, JSON.stringify(normalizarConfig(config), null, 2));
}

/**
 * El monitor donde va la pantalla del cliente, o null si no debe abrirse. Función PURA.
 * El de la caja nunca es candidato: taparle la venta al cajero es peor que no tener pantalla.
 */
export function elegirMonitor(monitores, idCaja, config) {
  if (config.modo === "apagada") return null;
  const otros = monitores.filter((m) => m.id !== idCaja);
  if (otros.length === 0) return null;
  return otros.find((m) => m.id === config.displayId) ?? otros[0];
}
