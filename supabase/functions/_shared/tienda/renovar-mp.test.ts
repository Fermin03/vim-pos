import { test } from "node:test";
import assert from "node:assert/strict";
import { avisoDeCredencialesDeLaAplicacion, avisoDeRenovacionFallida, type PuertoRenovacion, renovarConexion, renovarConexiones, type RespuestaDeTokens } from "./renovar-mp.ts";
import { pedirTokensDeTienda } from "./conexion-mp.ts";

const NUEVO = { access_token: "APP_USR-acceso-nuevo", refresh_token: "TG-refresco-nuevo", user_id: "3754297554", vence_at: "2027-04-09T10:50:00.000Z", de_prueba: false };
const BIEN: RespuestaDeTokens = { tokens: NUEVO, publicKey: "APP_USR-d0a26210-1111-2222-3333-479f0400869e" };
const VENCE = "2026-11-01T00:00:00+00:00";
const no = (status: number, codigo: string | null = null): RespuestaDeTokens => ({ tokens: null, status, codigo });

function doble(o: {
  tomar?: string | null | Error; refresh?: string | null | Error; respuesta?: RespuestaDeTokens; guardar?: (intento: number) => string | null | Error;
  /** Lo que contesta la base al marcar el fallo: ¿quedó en ERROR? Por omisión, lo que se le pidió. */
  quedaEnError?: boolean | Error; avisarFalla?: boolean;
} = {}) {
  const hechos: string[] = [];
  let guardados = 0;
  const p: PuertoRenovacion = {
    tomar: async (id) => { hechos.push(`tomar ${id}`); if (o.tomar instanceof Error) throw o.tomar; return o.tomar === undefined ? VENCE : o.tomar; },
    leerRefresh: async () => { if (o.refresh instanceof Error) throw o.refresh; return o.refresh === undefined ? "TG-refresco-viejo" : o.refresh; },
    pedirTokens: async (refresh) => { hechos.push(`pedir ${refresh}`); return o.respuesta ?? BIEN; },
    guardar: async (id, t, pk) => {
      const r = o.guardar?.(++guardados) ?? null;
      hechos.push(`guardar ${id} ${t.access_token}+${t.refresh_token} ${pk ?? "-"} → ${r instanceof Error ? "lanza" : r ?? "ok"}`);
      if (r instanceof Error) throw r;
      return r;
    },
    fallida: async (id, vence, motivo, definitiva) => {
      hechos.push(`fallida ${id} ${vence} ${definitiva ? "ERROR" : "igual"}: ${motivo}`);
      if (o.quedaEnError instanceof Error) throw o.quedaEnError;
      return o.quedaEnError ?? definitiva;
    },
    avisar: async (id, motivo, definitiva) => { hechos.push(`avisar ${id} ${definitiva ? "definitiva" : "revisar"}: ${motivo}`); if (o.avisarFalla) throw new Error("smtp"); },
    avisarNuestro: async (motivo) => { hechos.push(`avisarNuestro: ${motivo}`); },
    registrar: (codigo) => { hechos.push(`registrar ${codigo}`); },
  };
  return { p, hechos };
}
const sin = (hechos: string[], ...prefijos: string[]) => hechos.every((h) => prefijos.every((x) => !h.startsWith(x)));

test("renovar: toma la conexión, pide con el refresh guardado y guarda el par NUEVO entero (y la public key) antes de darla por hecha", async () => {
  const { p, hechos } = doble();
  assert.equal(await renovarConexion(p, "cx1"), "RENOVADA");
  assert.deepEqual(hechos, ["tomar cx1", "pedir TG-refresco-viejo", "guardar cx1 APP_USR-acceso-nuevo+TG-refresco-nuevo APP_USR-d0a26210-1111-2222-3333-479f0400869e → ok"]);
  // Sin public key en la respuesta se guarda el par y la que había se queda (la base hace COALESCE).
  const sinPk = doble({ respuesta: { tokens: NUEVO, publicKey: null } });
  assert.equal(await renovarConexion(sinPk.p, "cx1"), "RENOVADA");
  assert.ok(sinPk.hechos[2]!.includes(" - → ok"));
});

test("renovar: si otra pasada ya la tiene (o ya no está activa) no se le pide nada a Mercado Pago", async () => {
  const { p, hechos } = doble({ tomar: null });
  assert.equal(await renovarConexion(p, "cx1"), "SALTADA");
  assert.deepEqual(hechos, ["tomar cx1"]);
  // Y si la base no contesta al tomarla, tampoco: mañana.
  const rota = doble({ tomar: new Error("la base no responde") });
  assert.equal(await renovarConexion(rota.p, "cx1"), "PENDIENTE");
  assert.ok(sin(rota.hechos, "pedir", "fallida", "avisar"));
});

test("renovar: un fallo pasajero (sin respuesta, 5xx, 429, respuesta a medias) NO toca la conexión ni guarda nada, y no molesta a nadie", async () => {
  for (const status of [0, 200, 429, 500, 502, 503]) {
    const { p, hechos } = doble({ respuesta: no(status) });
    assert.equal(await renovarConexion(p, "cx1"), "PENDIENTE", String(status));
    assert.ok(sin(hechos, "guardar", "avisar"), String(status));
    assert.ok(hechos.some((h) => h.startsWith(`fallida cx1 ${VENCE} igual: No se pudo renovar el permiso: Mercado Pago respondió`)), String(status));
  }
  const sinBase = doble({ refresh: new Error("la base no responde") });
  assert.equal(await renovarConexion(sinBase.p, "cx1"), "PENDIENTE");
  assert.ok(sin(sinBase.hechos, "pedir", "avisar"));
});

test("renovar: una respuesta de Mercado Pago a medias no es un par: no se pierde el refresh token viejo", async () => {
  for (const cuerpo of [{ access_token: "a", user_id: 1, expires_in: 60 }, { access_token: "a", refresh_token: "r", user_id: 1 }, { refresh_token: "r", user_id: 1, expires_in: 60 }, "no es json"]) {
    const r = await pedirTokensDeTienda({ clientId: "id", clientSecret: "sec", refreshToken: "viejo" },
      (() => Promise.resolve(new Response(typeof cuerpo === "string" ? cuerpo : JSON.stringify(cuerpo), { status: 200 }))) as typeof fetch);
    assert.equal(r.tokens, null, JSON.stringify(cuerpo));
    const { p, hechos } = doble({ respuesta: r });
    assert.equal(await renovarConexion(p, "cx1"), "PENDIENTE");
    assert.ok(sin(hechos, "guardar"));
  }
});

test("renovar: SOLO invalid_grant es definitivo: conexión en ERROR (si sigue como se leyó) y aviso a VIM", async () => {
  const { p, hechos } = doble({ respuesta: no(400, "invalid_grant") });
  assert.equal(await renovarConexion(p, "cx1"), "DEFINITIVA");
  assert.deepEqual(hechos.slice(2), [
    "registrar RENOVACION_DEFINITIVA",
    `fallida cx1 ${VENCE} ERROR: No se pudo renovar el permiso: Mercado Pago respondió 400 invalid_grant; hay que volver a conectar`,
    "avisar cx1 definitiva: Mercado Pago respondió 400 invalid_grant; hay que volver a conectar",
  ]);
  const sinRefresh = doble({ refresh: null });
  assert.equal(await renovarConexion(sinRefresh.p, "cx1"), "DEFINITIVA");
  assert.ok(sin(sinRefresh.hechos, "pedir"));
});

test("renovar: los demás 400 de Mercado Pago (los documentados y uno nuevo) NO marcan en error una conexión sana: se reintenta y se avisa a VIM", async () => {
  for (const codigo of ["invalid_request", "forbidden", "invalid_scope", "unsupported_grant_type", "algo_nuevo", null]) {
    for (const status of [400, 401, 403]) {
      const { p, hechos } = doble({ respuesta: no(status, codigo) });
      assert.equal(await renovarConexion(p, "cx1"), "PENDIENTE", `${status} ${codigo}`);
      assert.ok(hechos.some((h) => h.startsWith(`fallida cx1 ${VENCE} igual:`)), `${status} ${codigo}`);
      assert.ok(hechos.some((h) => h.startsWith("avisar cx1 revisar:")), `${status} ${codigo}`);
      assert.ok(hechos.every((h) => !h.includes(" ERROR:") && !h.includes("definitiva")), `${status} ${codigo}`);
    }
  }
});

test("renovar: invalid_client es problema NUESTRO: no toca ninguna conexión, detiene la pasada y avisa UNA vez", async () => {
  const { p, hechos } = doble({ respuesta: no(400, "invalid_client") });
  assert.equal(await renovarConexion(p, "cx1"), "NUESTRO");
  assert.ok(sin(hechos, "fallida", "avisar", "guardar"));
  const pasada = doble({ respuesta: no(400, "invalid_client") });
  assert.deepEqual(await renovarConexiones(pasada.p, ["a", "b", "c"]), { revisadas: 1, renovadas: 0, pendientes: 0, definitivas: 0, saltadas: 0, credenciales: true });
  assert.deepEqual(pasada.hechos.filter((h) => h.startsWith("tomar")), ["tomar a"]);
  assert.equal(pasada.hechos.filter((h) => h.startsWith("avisarNuestro")).length, 1);
  assert.ok(sin(pasada.hechos, "fallida", "avisar "));
});

test("renovar: definitiva, pero otra pasada la renovó entre tanto (su vencimiento cambió): no quedó en error y no se avisa", async () => {
  const { p, hechos } = doble({ respuesta: no(400, "invalid_grant"), quedaEnError: false });
  assert.equal(await renovarConexion(p, "cx1"), "PENDIENTE");
  assert.ok(hechos.some((h) => h.startsWith(`fallida cx1 ${VENCE} ERROR:`)));   // se pidió con el vencimiento que se leyó…
  assert.ok(sin(hechos, "avisar"));                                              // …y la base dijo que ya no era ese
});

test("renovar: si el par nuevo no entra a la primera se reintenta con el MISMO par (es la única copia); solo si no entra, es definitiva", async () => {
  const alSegundo = doble({ guardar: (n) => (n === 1 ? "timeout" : null) });
  assert.equal(await renovarConexion(alSegundo.p, "cx1"), "RENOVADA");
  assert.equal(alSegundo.hechos.filter((h) => h.startsWith("guardar")).length, 2);
  assert.equal(alSegundo.hechos.filter((h) => h.startsWith("pedir")).length, 1);   // a Mercado Pago, una sola vez
  assert.ok(sin(alSegundo.hechos, "fallida", "avisar"));
  const lanza = doble({ guardar: (n) => (n < 3 ? new Error("red") : null) });
  assert.equal(await renovarConexion(lanza.p, "cx1"), "RENOVADA");

  const nunca = doble({ guardar: () => "VAULT_NO_DISPONIBLE" });
  assert.equal(await renovarConexion(nunca.p, "cx1"), "DEFINITIVA");
  assert.equal(nunca.hechos.filter((h) => h.startsWith("guardar")).length, 3);
  assert.ok(nunca.hechos.includes(`fallida cx1 ${VENCE} ERROR: No se pudo renovar el permiso: el permiso nuevo NO se pudo guardar (VAULT_NO_DISPONIBLE); hay que volver a conectar`));
  assert.ok(nunca.hechos.some((h) => h.startsWith("avisar cx1 definitiva")));
});

test("renovar: que no se pueda anotar o que el correo no salga no cambia el resultado ni revienta", async () => {
  const { p, hechos } = doble({ respuesta: no(400, "invalid_grant"), quedaEnError: new Error("la base no responde"), avisarFalla: true });
  assert.equal(await renovarConexion(p, "cx1"), "DEFINITIVA");
  assert.ok(hechos.includes("registrar ANOTAR") && hechos.includes("registrar AVISO_NO_SALIO") && hechos.some((h) => h.startsWith("avisar")));
});

test("la pasada: una por una, cuenta cada final y el fallo de una no detiene a las demás", async () => {
  const respuestas: Record<string, RespuestaDeTokens> = { a: BIEN, b: no(503), c: no(400, "invalid_grant"), d: BIEN, e: no(400, "forbidden") };
  const { p } = doble();
  let actual = "";
  const tomar = p.tomar;
  p.tomar = (id) => { actual = id; return id === "f" ? Promise.resolve(null) : tomar(id); };
  p.pedirTokens = async () => respuestas[actual]!;
  assert.deepEqual(await renovarConexiones(p, ["a", "b", "c", "d", "e", "f"]), { revisadas: 6, renovadas: 2, pendientes: 2, definitivas: 1, saltadas: 1, credenciales: false });
  assert.deepEqual(await renovarConexiones(p, []), { revisadas: 0, renovadas: 0, pendientes: 0, definitivas: 0, saltadas: 0, credenciales: false });
});

test("los correos de la renovación dicen de quién y por qué, sin tokens ni secretos", () => {
  const c = avisoDeRenovacionFallida({ negocio: "Knock-Out <b>", cuenta: "KNOCKOUT", conexionId: "cx1", motivo: "Mercado Pago respondió 400 invalid_grant; hay que volver a conectar", vence: "2026-11-01T00:00:00Z", definitiva: true });
  assert.ok(c.html.includes("Knock-Out &lt;b&gt;") && c.html.includes("invalid_grant") && c.html.includes("cx1") && c.html.includes("Reconectar Mercado Pago") && c.html.includes("dejó de ofrecer"));
  assert.match(c.subject, /^[\x20-\x7e]+$/);
  // El que solo pide revisar no dice que la tienda dejó de cobrar: no es verdad.
  const r = avisoDeRenovacionFallida({ negocio: "Knock-Out", cuenta: "KNOCKOUT", conexionId: "cx1", motivo: "Mercado Pago respondió 400 forbidden", vence: "2026-11-01T00:00:00Z", definitiva: false });
  assert.ok(r.html.includes("sigue cobrando") && !r.html.includes("dejó de ofrecer") && r.html.includes("forbidden"));
  const n = avisoDeCredencialesDeLaAplicacion("Mercado Pago respondió invalid_client al renovar un permiso de la tienda");
  assert.ok(n.html.includes("MP_TIENDA_CLIENT_SECRET") && n.html.includes("No se tocó ninguna conexión"));
  for (const html of [c.html, r.html, n.html]) assert.doesNotMatch(html, /APP_USR|TG-/);
});
