import { test } from "node:test";
import assert from "node:assert/strict";
import { pedirTokensDeTienda, conexionDeTienda, destinoDe, publicKeyDe } from "./conexion-mp.ts";

const RESPUESTA = { access_token: "APP_USR-acceso", refresh_token: "TG-refresco", user_id: 3754297554, expires_in: 15552000, live_mode: true,
                    public_key: "APP_USR-d0a26210-1111-2222-3333-479f0400869e" };
const CREDENCIALES = { clientId: "ID-TIENDA", clientSecret: "SECRETO-TIENDA", code: "CODIGO", redirectUri: "https://admin.vimpos.com.mx/integraciones/mercado-pago/callback" };

test("el destino es de una lista cerrada; sin destino, la terminal (como siempre)", () => {
  assert.equal(destinoDe(undefined), "terminal");
  assert.equal(destinoDe("terminal"), "terminal");
  assert.equal(destinoDe("tienda"), "tienda");
  for (const mal of [null, "", "TIENDA", "tienda ", "otra", 1, {}, ["tienda"], "__proto__"]) assert.equal(destinoDe(mal), null, JSON.stringify(mal));
});

test("la public key solo se acepta con su forma: va tal cual al navegador de los clientes", () => {
  assert.equal(publicKeyDe(RESPUESTA), RESPUESTA.public_key);
  assert.equal(publicKeyDe({ public_key: "TEST-d0a26210-1111-2222-3333-479f0400869e" }), "TEST-d0a26210-1111-2222-3333-479f0400869e");
  for (const pk of [undefined, null, "", "corta", "con espacios y <script>…………", 12345, "x".repeat(101)]) assert.equal(publicKeyDe({ public_key: pk }), null, String(pk));
  assert.equal(publicKeyDe(null), null);
});

test("el canje va con las credenciales de la aplicación de la TIENDA y devuelve tokens, public key y si es de prueba", async () => {
  let visto: { url: string; cuerpo: Record<string, unknown> } | null = null;
  const pedir = ((url: string, init: RequestInit) => {
    visto = { url, cuerpo: JSON.parse(String(init.body)) };
    return Promise.resolve(new Response(JSON.stringify(RESPUESTA), { status: 200 }));
  }) as typeof fetch;
  const r = await pedirTokensDeTienda(CREDENCIALES, pedir);
  assert.ok(r.tokens);
  assert.equal(r.tokens.access_token, "APP_USR-acceso");
  assert.equal(r.tokens.user_id, "3754297554");
  assert.equal(r.tokens.de_prueba, false);
  assert.equal(r.publicKey, RESPUESTA.public_key);
  assert.equal(visto!.url, "https://api.mercadopago.com/oauth/token");
  assert.deepEqual(visto!.cuerpo, { client_id: "ID-TIENDA", client_secret: "SECRETO-TIENDA", grant_type: "authorization_code", code: "CODIGO", redirect_uri: CREDENCIALES.redirectUri });

  // live_mode = false: la conexión es de prueba (y entonces no cobra: tienda_conexion_cobro).
  const prueba = await pedirTokensDeTienda(CREDENCIALES, (() => Promise.resolve(new Response(JSON.stringify({ ...RESPUESTA, live_mode: false }), { status: 200 }))) as typeof fetch);
  assert.equal(prueba.tokens?.de_prueba, true);
  // Sin public key en la respuesta: hay tokens pero no hay con qué tokenizar; lo decide quien llama.
  const sinPk = await pedirTokensDeTienda(CREDENCIALES, (() => Promise.resolve(new Response(JSON.stringify({ ...RESPUESTA, public_key: undefined }), { status: 200 }))) as typeof fetch);
  assert.ok(sinPk.tokens && sinPk.publicKey === null);
  // Mercado Pago rechaza el código: nada, con su estado.
  const no = await pedirTokensDeTienda(CREDENCIALES, (() => Promise.resolve(new Response(JSON.stringify({ error: "invalid_grant", public_key: RESPUESTA.public_key }), { status: 400 }))) as typeof fetch);
  assert.deepEqual(no, { tokens: null, status: 400, codigo: "invalid_grant" });
});

// ── Desconectar: contra una base de mentira ────────────────────────────────────────────────────
type Fila = Record<string, unknown>;
function baseDeMentira(o: { conexion: Fila | null; ocupada: Fila | null | Error; /** La fila de tienda_config del negocio (la marca del modo de prueba). */ config?: Fila | null }) {
  const hechos: string[] = [];
  const filtros: Record<string, unknown>[] = [];
  const admin = {
    from(tabla: string) {
      const f: Record<string, unknown> = { tabla };
      filtros.push(f);
      const q = {
        select: (_c: string, op?: { head?: boolean }) => { if (op?.head) f.cuenta = true; return q; },
        eq: (k: string, v: unknown) => { f[k] = v; return q; },
        in: (k: string, v: unknown) => { f[k] = v; return q; },
        update: (v: Fila) => { hechos.push(`update ${tabla} ${JSON.stringify(v)}`); return q; },
        maybeSingle: async () => ({ data: tabla === "tienda_config" ? (f.tenant_id === o.config?.tenant_id ? o.config : null)
          : tabla === "tienda_conexiones" && f.id === o.conexion?.id && f.tenant_id === o.conexion?.tenant_id ? o.conexion : null, error: null }),
      };
      return q;
    },
    rpc: async (fn: string, args: Fila) => {
      hechos.push(`rpc ${fn} ${JSON.stringify(args)}`);
      if (fn !== "tienda_conexion_ocupada") return { data: null, error: null };
      return o.ocupada instanceof Error ? { data: null, error: { message: o.ocupada.message } } : { data: o.ocupada, error: null };
    },
  };
  return { admin: admin as unknown as Parameters<typeof conexionDeTienda>[0], hechos, filtros };
}
const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status });
const CX = "11111111-2222-3333-4444-555555555555", NEGOCIO = "aaaaaaaa-0000-0000-0000-000000000001";
test("desconectar: borra los tokens de la TIENDA y deja la conexión desconectada; solo la del negocio de la sesión", async () => {
  const { admin, hechos, filtros } = baseDeMentira({ conexion: { id: CX, tenant_id: NEGOCIO, estado: "ACTIVA" }, ocupada: null });
  const r = await conexionDeTienda(admin, NEGOCIO, { accion: "desconectar", conexion_id: CX.toUpperCase() }, json);
  assert.equal(r.status, 200);
  // Antes de borrar nada se le pregunta a la base si algún dinero depende de esos tokens.
  assert.deepEqual(hechos, [`rpc tienda_conexion_ocupada {"p_conexion":"${CX}"}`, `rpc tienda_borrar_tokens {"p_conexion":"${CX}"}`, 'update tienda_conexiones {"estado":"DESCONECTADA"}']);
  // Nunca toca nada de la terminal.
  assert.ok(filtros.every((f) => !String(f.tabla).startsWith("terminal_")) && hechos.every((h) => !h.includes("terminal_")));
  // La conexión de OTRO negocio no existe para esta sesión.
  const ajena = baseDeMentira({ conexion: { id: CX, tenant_id: "otro", estado: "ACTIVA" }, ocupada: null });
  assert.equal((await conexionDeTienda(ajena.admin, NEGOCIO, { accion: "desconectar", conexion_id: CX }, json)).status, 404);
  assert.deepEqual(ajena.hechos, []);
});

test("desconectar: NO mientras haya un cobro sin resolver, una devolución por hacer o fallida, o un cobro de las últimas 48 horas; y dice por qué y hasta cuándo", async () => {
  // Cobro sin resolver o devolución pendiente o fallida: no, sin fecha.
  const pend = baseDeMentira({ conexion: { id: CX, tenant_id: NEGOCIO, estado: "ACTIVA" }, ocupada: { motivo: "PENDIENTES" } });
  const r = await conexionDeTienda(pend.admin, NEGOCIO, { accion: "desconectar", conexion_id: CX }, json);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "PAGOS_PENDIENTES" });
  // Cobró hace poco (una cancelación todavía devolvería ese pago): no, y cuándo sí.
  const rec = baseDeMentira({ conexion: { id: CX, tenant_id: NEGOCIO, estado: "ACTIVA" }, ocupada: { motivo: "RECIENTES", hasta: "2026-10-13T18:00:00+00:00" } });
  const r2 = await conexionDeTienda(rec.admin, NEGOCIO, { accion: "desconectar", conexion_id: CX }, json);
  assert.equal(r2.status, 409);
  assert.deepEqual(await r2.json(), { error: "PAGOS_RECIENTES", hasta: "2026-10-13T18:00:00+00:00" });
  // En ninguno de los dos casos se borró un token ni se tocó la conexión.
  for (const b of [pend, rec]) assert.deepEqual(b.hechos, [`rpc tienda_conexion_ocupada {"p_conexion":"${CX}"}`]);
  // Y si la base no contesta a esa pregunta, tampoco se desconecta: se lanza.
  const rota = baseDeMentira({ conexion: { id: CX, tenant_id: NEGOCIO, estado: "ACTIVA" }, ocupada: new Error("la base no responde") });
  await assert.rejects(() => conexionDeTienda(rota.admin, NEGOCIO, { accion: "desconectar", conexion_id: CX }, json));
  assert.ok(rota.hechos.every((h) => !h.includes("tienda_borrar_tokens")));
});

test("la conexión de la tienda: lo que no es canjear ni desconectar, o viene mal, no hace nada", async () => {
  const { admin, hechos } = baseDeMentira({ conexion: null, ocupada: null });
  assert.equal((await conexionDeTienda(admin, NEGOCIO, { accion: "sucursal" }, json)).status, 400);
  assert.equal((await conexionDeTienda(admin, NEGOCIO, { accion: "desconectar", conexion_id: "no-es-uuid" }, json)).status, 400);
  // Sin las credenciales de la aplicación de la tienda no se canjea nada (aquí no hay Deno ni secretos).
  assert.equal((await conexionDeTienda(admin, NEGOCIO, { accion: "canjear", code: "X" }, json)).status, 503);
  assert.deepEqual(hechos, []);
});

// ── La conexión de prueba no es del dueño (modo de prueba, 0177) ───────────────────────────────
test("desconectar: una conexión de PRUEBA no se desconecta desde el admin; ni se pregunta si está ocupada ni se toca un token", async () => {
  const b = baseDeMentira({ conexion: { id: CX, tenant_id: NEGOCIO, estado: "ACTIVA", de_prueba: true }, ocupada: null });
  const r = await conexionDeTienda(b.admin, NEGOCIO, { accion: "desconectar", conexion_id: CX }, json);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "CONEXION_DE_PRUEBA" });
  assert.deepEqual(b.hechos, []);
  // Solo un `true` es de prueba: una real se desconecta como siempre.
  for (const de_prueba of [false, null, undefined]) {
    const real = baseDeMentira({ conexion: { id: CX, tenant_id: NEGOCIO, estado: "ACTIVA", de_prueba }, ocupada: null });
    assert.equal((await conexionDeTienda(real.admin, NEGOCIO, { accion: "desconectar", conexion_id: CX }, json)).status, 200, String(de_prueba));
  }
});

test("canjear: con el negocio en modo de prueba no se conecta nada (ni se llega a hablar con Mercado Pago)", async () => {
  const b = baseDeMentira({ conexion: null, ocupada: null, config: { tenant_id: NEGOCIO, pago_de_prueba: true } });
  const r = await conexionDeTienda(b.admin, NEGOCIO, { accion: "canjear", code: "CODIGO" }, json);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { error: "MODO_DE_PRUEBA" });
  assert.deepEqual(b.hechos, []);
  // Sin la marca (o con otra cosa que no sea `true`) sigue su camino: aquí, hasta que faltan las credenciales.
  for (const pago_de_prueba of [false, null, "true"]) {
    const normal = baseDeMentira({ conexion: null, ocupada: null, config: { tenant_id: NEGOCIO, pago_de_prueba } });
    assert.equal((await conexionDeTienda(normal.admin, NEGOCIO, { accion: "canjear", code: "CODIGO" }, json)).status, 503, String(pago_de_prueba));
  }
});

test("canjear: una conexión de prueba que ya existe para esa cuenta no se pisa", async () => {
  // El canje completo necesita Deno y a Mercado Pago; aquí se comprueba que la guarda está, y dónde:
  // después de saber qué cuenta autorizó el dueño y ANTES de escribir la conexión o sus tokens.
  const { readFileSync } = await import("node:fs");
  const fuente = readFileSync(new URL("./conexion-mp.ts", import.meta.url), "utf8");
  const canje = fuente.slice(fuente.indexOf('if (b.accion === "canjear")'), fuente.indexOf('if (b.accion === "desconectar")'));
  const orden = ["const t = r.tokens;", '.eq("cuenta_id_externo", t.user_id).maybeSingle()', "(previa.data as", 'json({ error: "CUENTA_DE_PRUEBA" }, 409)',
                 '.from("tienda_conexiones").upsert(', 'admin.rpc("tienda_guardar_tokens"'].map((t) => canje.indexOf(t));
  assert.ok(orden.every((i) => i > 0), JSON.stringify(orden));
  assert.deepEqual(orden, [...orden].sort((a, b) => a - b));
});
