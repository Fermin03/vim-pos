import test from "node:test";
import assert from "node:assert/strict";
import { urlAutorizacionUber, normalizarTiendasUber, cuerpoPosData, transicionConexion } from "./uber-activacion.ts";

test("urlAutorizacionUber: sandbox y producción usan su dominio y llevan state y scope", () => {
  const u = new URL(urlAutorizacionUber({ entorno: "sandbox", clientId: "cid", redirectUri: "http://localhost:3001/cb", state: "abc" }));
  assert.equal(u.origin, "https://sandbox-login.uber.com");
  assert.equal(u.pathname, "/oauth/v2/authorize");
  assert.equal(u.searchParams.get("client_id"), "cid");
  assert.equal(u.searchParams.get("response_type"), "code");
  assert.equal(u.searchParams.get("redirect_uri"), "http://localhost:3001/cb");
  assert.equal(u.searchParams.get("scope"), "eats.pos_provisioning");
  assert.equal(u.searchParams.get("state"), "abc");
  const p = new URL(urlAutorizacionUber({ entorno: "produccion", clientId: "cid", redirectUri: "https://admin.vimpos.com.mx/cb", state: "s" }));
  assert.equal(p.origin, "https://auth.uber.com");
});

test("normalizarTiendasUber: toma id, nombre y dirección; tolera campos faltantes", () => {
  const t = normalizarTiendasUber({ stores: [
    { id: "s1", name: "KOB Centro", location: { street_address_line_one: "Madero 12", unit_number: "L-3", city: "León" } },
    { id: "s2" },
    { name: "sin id" },
  ] });
  assert.deepEqual(t, [
    { id: "s1", nombre: "KOB Centro", direccion: "Madero 12, L-3", ciudad: "León" },
    { id: "s2", nombre: "s2", direccion: "", ciudad: "" },
  ]);
  assert.deepEqual(normalizarTiendasUber(null), []);
  assert.deepEqual(normalizarTiendasUber({ stores: "no" }), []);
});

test("cuerpoPosData: el JSON exacto que espera POST /pos_data", () => {
  assert.deepEqual(cuerpoPosData({ sucursalId: "suc-1", autoAceptar: true }), {
    integrator_store_id: "suc-1",
    integrator_brand_id: "vimpos",
    is_order_manager: true,
    require_manual_acceptance: false,
    allowed_customer_requests: { allow_special_instruction_requests: true, allow_single_use_items_requests: false },
    webhooks_config: {
      webhooks_version: "1.0.0",
      order_release_webhooks: { is_enabled: false },
      schedule_order_webhooks: { is_enabled: true },
      delivery_status_webhooks: { is_enabled: true },
    },
  });
  assert.equal(cuerpoPosData({ sucursalId: "s", autoAceptar: false }).require_manual_acceptance, true);
});

test("transicionConexion: tabla de estados", () => {
  assert.equal(transicionConexion(null, "activar"), "ACTIVA");
  assert.equal(transicionConexion("SIN_CONECTAR", "activar"), "ACTIVA");
  assert.equal(transicionConexion("DESCONECTADA", "activar"), "ACTIVA");
  assert.equal(transicionConexion("ERROR", "activar"), "ACTIVA");
  assert.throws(() => transicionConexion("ACTIVA", "activar"), /TRANSICION_INVALIDA:ACTIVA:activar/);
  assert.equal(transicionConexion("ACTIVA", "pausar"), "PAUSADA");
  assert.throws(() => transicionConexion("PAUSADA", "pausar"), /TRANSICION_INVALIDA/);
  assert.equal(transicionConexion("PAUSADA", "reanudar"), "ACTIVA");
  assert.throws(() => transicionConexion("ACTIVA", "reanudar"), /TRANSICION_INVALIDA/);
  for (const e of ["ACTIVA", "PAUSADA", "ERROR"] as const) assert.equal(transicionConexion(e, "desconectar"), "DESCONECTADA");
  assert.throws(() => transicionConexion("DESCONECTADA", "desconectar"), /TRANSICION_INVALIDA/);
  assert.throws(() => transicionConexion(null, "desconectar"), /TRANSICION_INVALIDA:null:desconectar/);
});
