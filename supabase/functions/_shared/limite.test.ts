import { test } from "node:test";
import assert from "node:assert/strict";
import { consumirCupo, consumirCupos, cupoAgotado, ipCliente, leerCuerpoAcotado, pareceIp, type ClienteRpc } from "./limite.ts";

const h = (o: Record<string, string>) => new Headers(o);

// ── IP de confianza (C2-1) ─────────────────────────────────────────────────────────────────────

test("la PRIMERA entrada de X-Forwarded-For la escribe el cliente: no se usa", () => {
  // Así se saltaba el límite anterior: una IP inventada por petición.
  assert.equal(ipCliente(h({ "x-forwarded-for": "1.2.3.4, 203.0.113.9" })), "203.0.113.9");
  assert.notEqual(ipCliente(h({ "x-forwarded-for": "6.6.6.6, 203.0.113.9" })), "6.6.6.6");
});

test("cf-connecting-ip manda sobre x-real-ip y sobre XFF", () => {
  assert.equal(ipCliente(h({
    "cf-connecting-ip": "198.51.100.7", "x-real-ip": "10.0.0.1", "x-forwarded-for": "6.6.6.6, 10.0.0.2",
  })), "198.51.100.7");
  assert.equal(ipCliente(h({ "x-real-ip": "198.51.100.8", "x-forwarded-for": "6.6.6.6, 10.0.0.2" })), "198.51.100.8");
});

test("IPv6 se acepta y se normaliza a minúsculas", () => {
  assert.equal(ipCliente(h({ "cf-connecting-ip": "2001:DB8::1" })), "2001:db8::1");
});

test("basura en las cabeceras no acaba como clave: se pasa a la siguiente o a 'desconocida'", () => {
  assert.equal(ipCliente(h({ "cf-connecting-ip": "no-soy-ip", "x-real-ip": "198.51.100.9" })), "198.51.100.9");
  assert.equal(ipCliente(h({ "cf-connecting-ip": "x".repeat(5000) })), "desconocida");
  assert.equal(ipCliente(h({ "x-forwarded-for": "999.1.1.1" })), "desconocida");
  assert.equal(ipCliente(h({})), "desconocida");
});

test("VIM_IP_CABECERA fija una sola cabecera (y en XFF, su última entrada)", () => {
  const hs = h({ "cf-connecting-ip": "6.6.6.6", "x-real-ip": "198.51.100.10", "x-forwarded-for": "6.6.6.6, 198.51.100.11" });
  assert.equal(ipCliente(hs, "x-real-ip"), "198.51.100.10");
  assert.equal(ipCliente(hs, "X-Forwarded-For"), "198.51.100.11");
  assert.equal(ipCliente(h({ "cf-connecting-ip": "6.6.6.6" }), "x-real-ip"), "desconocida");
});

test("pareceIp", () => {
  assert.equal(pareceIp("192.168.0.1"), true);
  assert.equal(pareceIp("256.1.1.1"), false);
  assert.equal(pareceIp("::1"), true);
  assert.equal(pareceIp("abc"), false);
});

// ── consumirCupo ───────────────────────────────────────────────────────────────────────────────

function dbFalsa(respuestas: Array<{ data: unknown; error: { message: string } | null } | Error>) {
  const llamadas: Array<{ fn: string; args: Record<string, unknown> }> = [];
  const db: ClienteRpc = {
    rpc(fn, args) {
      llamadas.push({ fn, args });
      const r = respuestas.shift() ?? { data: true, error: null };
      return r instanceof Error ? Promise.reject(r) : Promise.resolve(r);
    },
  };
  return { db, llamadas };
}

test("consumirCupo llama a la RPC con la ventana en segundos", async () => {
  const { db, llamadas } = dbFalsa([{ data: true, error: null }]);
  const r = await consumirCupo(db, { clave: "demo:ip:1.2.3.4", ventanaSeg: 3600, max: 5 }, "abrir");
  assert.deepEqual(r, { permitido: true, motivo: "OK" });
  assert.deepEqual(llamadas[0], { fn: "consumir_cupo", args: { p_clave: "demo:ip:1.2.3.4", p_ventana: "3600 seconds", p_max: 5 } });
});

test("cupo agotado → no permitido", async () => {
  const { db } = dbFalsa([{ data: false, error: null }]);
  assert.deepEqual(await consumirCupo(db, { clave: "k", ventanaSeg: 60, max: 1 }, "abrir"), { permitido: false, motivo: "AGOTADO" });
});

test("si la base no responde decide alFallar (abrir / cerrar)", async () => {
  const errorRpc = { data: null, error: { message: "timeout" } };
  const orig = console.error; console.error = () => {};
  try {
    assert.equal((await consumirCupo(dbFalsa([errorRpc]).db, { clave: "k", ventanaSeg: 60, max: 1 }, "abrir")).permitido, true);
    assert.equal((await consumirCupo(dbFalsa([errorRpc]).db, { clave: "k", ventanaSeg: 60, max: 1 }, "cerrar")).permitido, false);
    const lanzado = await consumirCupo(dbFalsa([new Error("red")]).db, { clave: "k", ventanaSeg: 60, max: 1 }, "cerrar");
    assert.deepEqual(lanzado, { permitido: false, motivo: "BD_NO_RESPONDE" });
    assert.equal(await cupoAgotado(dbFalsa([errorRpc]).db, { clave: "k", ventanaSeg: 60, max: 1 }, "cerrar"), true);
    assert.equal(await cupoAgotado(dbFalsa([errorRpc]).db, { clave: "k", ventanaSeg: 60, max: 1 }, "abrir"), false);
  } finally { console.error = orig; }
});

test("consumirCupos se detiene en el primero que no cabe", async () => {
  const { db, llamadas } = dbFalsa([{ data: false, error: null }, { data: true, error: null }]);
  const r = await consumirCupos(db, [
    { clave: "ip", ventanaSeg: 60, max: 1 }, { clave: "global", ventanaSeg: 60, max: 1 },
  ], "cerrar");
  assert.equal(r.permitido, false);
  assert.equal(llamadas.length, 1);
});

// ── leerCuerpoAcotado (C2-4) ───────────────────────────────────────────────────────────────────

test("un content-length mayor al tope ni se lee", async () => {
  const req = new Request("http://x/", { method: "POST", body: "a".repeat(10), headers: { "content-length": "999999" } });
  assert.equal(await leerCuerpoAcotado(req, 100), null);
});

test("sin content-length (chunked) se corta al pasar el tope mientras llega", async () => {
  const flujo = new ReadableStream<Uint8Array>({
    start(c) { for (let i = 0; i < 10; i++) c.enqueue(new Uint8Array(50)); c.close(); },
  });
  const req = new Request("http://x/", { method: "POST", body: flujo, duplex: "half" } as RequestInit);
  assert.equal(await leerCuerpoAcotado(req, 100), null);
});

test("un cuerpo dentro del tope se devuelve entero (UTF-8 incluido)", async () => {
  const req = new Request("http://x/", { method: "POST", body: '{"a":"ñandú"}' });
  assert.equal(await leerCuerpoAcotado(req, 1000), '{"a":"ñandú"}');
});
