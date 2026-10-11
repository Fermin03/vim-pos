import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeRenovacionFallida, type PuertoRenovacion, renovarConexion, renovarConexiones, type RespuestaDeTokens } from "./renovar-mp.ts";
import { pedirTokensDeTienda } from "./conexion-mp.ts";

const NUEVO = { access_token: "APP_USR-acceso-nuevo", refresh_token: "TG-refresco-nuevo", user_id: "3754297554", vence_at: "2027-04-09T10:50:00.000Z", de_prueba: false };
const BIEN: RespuestaDeTokens = { tokens: NUEVO, publicKey: "APP_USR-d0a26210-1111-2222-3333-479f0400869e" };

function doble(o: { refresh?: string | null | Error; respuesta?: RespuestaDeTokens; guardar?: (intento: number) => string | null | Error; anotarFalla?: boolean; avisarFalla?: boolean } = {}) {
  const hechos: string[] = [];
  let guardados = 0;
  const p: PuertoRenovacion = {
    leerRefresh: async () => { if (o.refresh instanceof Error) throw o.refresh; return o.refresh === undefined ? "TG-refresco-viejo" : o.refresh; },
    pedirTokens: async (refresh) => { hechos.push(`pedir ${refresh}`); return o.respuesta ?? BIEN; },
    guardar: async (id, t, pk) => {
      const r = o.guardar?.(++guardados) ?? null;
      hechos.push(`guardar ${id} ${t.access_token}+${t.refresh_token} ${pk ?? "-"} → ${r instanceof Error ? "lanza" : r ?? "ok"}`);
      if (r instanceof Error) throw r;
      return r;
    },
    anotar: async (id, motivo, definitiva) => { hechos.push(`anotar ${id} ${definitiva ? "ERROR" : "igual"}: ${motivo}`); if (o.anotarFalla) throw new Error("la base no responde"); },
    avisar: async (id, motivo) => { hechos.push(`avisar ${id}: ${motivo}`); if (o.avisarFalla) throw new Error("smtp"); },
    registrar: (codigo) => { hechos.push(`registrar ${codigo}`); },
  };
  return { p, hechos };
}

test("renovar: pide con el refresh guardado y guarda el par NUEVO entero (y la public key) antes de darla por hecha", async () => {
  const { p, hechos } = doble();
  assert.equal(await renovarConexion(p, "cx1"), "RENOVADA");
  assert.deepEqual(hechos, ["pedir TG-refresco-viejo", `guardar cx1 APP_USR-acceso-nuevo+TG-refresco-nuevo ${BIEN.tokens && "APP_USR-d0a26210-1111-2222-3333-479f0400869e"} → ok`]);
  // Sin public key en la respuesta se guarda el par y la que había se queda (la base hace COALESCE).
  const sinPk = doble({ respuesta: { tokens: NUEVO, publicKey: null } });
  assert.equal(await renovarConexion(sinPk.p, "cx1"), "RENOVADA");
  assert.ok(sinPk.hechos[1]!.includes(" - → ok"));
});

test("renovar: un fallo pasajero (sin respuesta, 5xx, 429, respuesta a medias) NO toca la conexión ni guarda nada; se reintenta mañana", async () => {
  for (const status of [0, 200, 429, 500, 502, 503]) {
    const { p, hechos } = doble({ respuesta: { tokens: null, status, codigo: null } });
    assert.equal(await renovarConexion(p, "cx1"), "PENDIENTE", String(status));
    assert.ok(hechos.every((h) => !h.startsWith("guardar") && !h.startsWith("avisar")), String(status));
    assert.ok(hechos.some((h) => h.startsWith("anotar cx1 igual: No se pudo renovar el permiso: Mercado Pago respondió")), String(status));
  }
  // La base no contesta al leer el refresh: tampoco es definitivo, y no se llega a pedir nada.
  const sinBase = doble({ refresh: new Error("la base no responde") });
  assert.equal(await renovarConexion(sinBase.p, "cx1"), "PENDIENTE");
  assert.ok(sinBase.hechos.every((h) => !h.startsWith("pedir") && !h.startsWith("avisar")));
});

test("renovar: una respuesta de Mercado Pago a medias no es un par: no se pierde el refresh token viejo", async () => {
  // pedirTokens de verdad, con un 200 al que le falta el refresh token (o el vencimiento).
  for (const cuerpo of [{ access_token: "a", user_id: 1, expires_in: 60 }, { access_token: "a", refresh_token: "r", user_id: 1 }, { refresh_token: "r", user_id: 1, expires_in: 60 }, "no es json"]) {
    const r = await pedirTokensDeTienda({ clientId: "id", clientSecret: "sec", refreshToken: "viejo" },
      (() => Promise.resolve(new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status: 200 }))) as typeof fetch);
    assert.equal(r.tokens, null, JSON.stringify(cuerpo));
    const { p, hechos } = doble({ respuesta: r });
    assert.equal(await renovarConexion(p, "cx1"), "PENDIENTE");
    assert.ok(hechos.every((h) => !h.startsWith("guardar")));
  }
});

test("renovar: Mercado Pago rechaza el refresh token (4xx) → definitiva: conexión en ERROR y aviso a VIM", async () => {
  for (const status of [400, 401, 403]) {
    const { p, hechos } = doble({ respuesta: { tokens: null, status, codigo: "invalid_grant" } });
    assert.equal(await renovarConexion(p, "cx1"), "DEFINITIVA", String(status));
    assert.deepEqual(hechos.slice(1), [
      "registrar RENOVACION_DEFINITIVA",
      `anotar cx1 ERROR: No se pudo renovar el permiso: Mercado Pago respondió ${status} invalid_grant; hay que volver a conectar`,
      `avisar cx1: Mercado Pago respondió ${status} invalid_grant; hay que volver a conectar`,
    ]);
  }
  const sinRefresh = doble({ refresh: null });
  assert.equal(await renovarConexion(sinRefresh.p, "cx1"), "DEFINITIVA");
  assert.ok(sinRefresh.hechos.every((h) => !h.startsWith("pedir")));
});

test("renovar: si el par nuevo no entra a la primera se reintenta con el MISMO par (es la única copia); solo si no entra, es definitiva", async () => {
  const alSegundo = doble({ guardar: (n) => (n === 1 ? "timeout" : null) });
  assert.equal(await renovarConexion(alSegundo.p, "cx1"), "RENOVADA");
  assert.equal(alSegundo.hechos.filter((h) => h.startsWith("guardar")).length, 2);
  assert.equal(alSegundo.hechos.filter((h) => h.startsWith("pedir")).length, 1);   // a Mercado Pago, una sola vez
  assert.ok(alSegundo.hechos.every((h) => !h.startsWith("anotar") && !h.startsWith("avisar")));
  const lanza = doble({ guardar: (n) => (n < 3 ? new Error("red") : null) });
  assert.equal(await renovarConexion(lanza.p, "cx1"), "RENOVADA");

  const nunca = doble({ guardar: () => "VAULT_NO_DISPONIBLE" });
  assert.equal(await renovarConexion(nunca.p, "cx1"), "DEFINITIVA");
  assert.equal(nunca.hechos.filter((h) => h.startsWith("guardar")).length, 3);
  assert.ok(nunca.hechos.includes("anotar cx1 ERROR: No se pudo renovar el permiso: el permiso nuevo NO se pudo guardar (VAULT_NO_DISPONIBLE); hay que volver a conectar"));
  assert.ok(nunca.hechos.some((h) => h.startsWith("avisar cx1")));
});

test("renovar: que no se pueda anotar o que el correo no salga no cambia el resultado ni revienta", async () => {
  const { p, hechos } = doble({ respuesta: { tokens: null, status: 400, codigo: "invalid_grant" }, anotarFalla: true, avisarFalla: true });
  assert.equal(await renovarConexion(p, "cx1"), "DEFINITIVA");
  assert.ok(hechos.includes("registrar ANOTAR") && hechos.includes("registrar AVISO_NO_SALIO") && hechos.some((h) => h.startsWith("avisar")));
});

test("la pasada: una por una, cuenta cada final y el fallo de una no detiene a las demás", async () => {
  const respuestas: Record<string, RespuestaDeTokens> = { a: BIEN, b: { tokens: null, status: 503, codigo: null }, c: { tokens: null, status: 400, codigo: "invalid_grant" }, d: BIEN };
  const { p } = doble();
  let actual = "";
  const leer = p.leerRefresh;
  p.leerRefresh = (id) => { actual = id; return leer(id); };
  p.pedirTokens = async () => respuestas[actual]!;
  assert.deepEqual(await renovarConexiones(p, ["a", "b", "c", "d"]), { revisadas: 4, renovadas: 2, pendientes: 1, definitivas: 1 });
  assert.deepEqual(await renovarConexiones(p, []), { revisadas: 0, renovadas: 0, pendientes: 0, definitivas: 0 });
});

test("el correo de la renovación fallida dice de quién y por qué, sin tokens", () => {
  const c = avisoDeRenovacionFallida({ negocio: "Knock-Out <b>", cuenta: "KNOCKOUT", conexionId: "cx1", motivo: "Mercado Pago respondió 400 invalid_grant; hay que volver a conectar", vence: "2026-11-01T00:00:00Z" });
  assert.ok(c.html.includes("Knock-Out &lt;b&gt;") && c.html.includes("invalid_grant") && c.html.includes("cx1") && c.html.includes("Reconectar Mercado Pago"));
  assert.match(c.subject, /^[\x20-\x7e]+$/);
  assert.doesNotMatch(c.html, /APP_USR|TG-/);
});
