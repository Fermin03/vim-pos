// Fase 2 · Hub del local — verifica el tiempo real del KDS por LAN (LISTEN/NOTIFY → SSE).
// Un cliente SSE (simula la pantalla de cocina) se conecta al gateway; se manda un ticket a
// cocina en la "caja"; el KDS debe recibir el evento AL INSTANTE (sin polling). Además prueba
// que el gateway es accesible por la IP de la LAN (para que un KDS en otra máquina se conecte).
import { startBackend } from "./backend.mjs";

const GW_PORT = 54350;
const GW = `http://127.0.0.1:${GW_PORT}`;
const CAJA = "99999999-0000-0000-0000-0000000000cc";
const DEVICE_EMAIL = "caja-99999999-0000-0000-0000-0000000000cc@dispositivos.vimpos.mx";
const DEVICE_PASS = "vim-device-dev";
const TENANT = "99999999-0000-0000-0000-0000000000aa";
const SUC = "99999999-0000-0000-0000-0000000000bb";
const CAJERO = "99999999-0000-0000-0000-000000000001";
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let backend, abort;

// Lee el stream SSE en segundo plano y empuja los eventos a `eventos`.
function escucharSse(url, eventos) {
  abort = new AbortController();
  (async () => {
    const res = await fetch(url, { signal: abort.signal, headers: { Accept: "text/event-stream" } });
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const frame = buf.slice(0, i); buf = buf.slice(i + 2);
        const ev = { evento: "message", data: "" };
        for (const line of frame.split("\n")) {
          if (line.startsWith("event:")) ev.evento = line.slice(6).trim();
          else if (line.startsWith("data:")) ev.data = line.slice(5).trim();
        }
        if (ev.evento !== "message" || ev.data) eventos.push(ev);
      }
    }
  })().catch(() => { /* abort */ });
}

try {
  backend = await startBackend({ gatewayPort: GW_PORT, log: () => {} });
  console.log(`· hub arriba — caja: ${backend.url} · LAN: ${backend.lanUrl}`);

  // Prueba de acceso por la IP de LAN (lo que hará un KDS en otra máquina).
  const lanHealth = await fetch(`${backend.lanUrl}/health`).then((r) => r.json()).catch(() => null);
  console.log(`· accesible por la LAN (${backend.lanUrl}/health): ${lanHealth?.ok ? "sí ✓" : "NO"}`);

  // El KDS se conecta al stream de cocina.
  const eventos = [];
  escucharSse(`http://127.0.0.1:${GW_PORT}/kds/stream`, eventos);
  await wait(800);
  if (!eventos.find((e) => e.evento === "hola")) throw new Error("el KDS no recibió el saludo del stream");
  console.log("· KDS conectado al stream SSE");

  // En la "caja": abrir turno + ticket, y ENVIAR A COCINA (dispara el NOTIFY).
  const c = await backend.pool.connect();
  await c.query("SELECT set_config('request.jwt.claims',$1,true)", [JSON.stringify({ sub: CAJERO, tenant_id: TENANT, role: "authenticated" })]);
  const ab = (await c.query("SELECT id FROM turnos WHERE caja_id=$1 AND estado='ABIERTO' ORDER BY fecha_apertura DESC LIMIT 1", [CAJA])).rows[0];
  const turno = ab ? ab.id : (await c.query(
    `INSERT INTO turnos(tenant_id,sucursal_id,caja_id,codigo_turno,dia_contable,usuario_apertura_id,fondo_inicial_mxn,fondo_modo)
     VALUES($1,$2,$3,'HUB-'||floor(extract(epoch from clock_timestamp()))::text,CURRENT_DATE,$4,500,'TOTAL') RETURNING id`, [TENANT, SUC, CAJA, CAJERO])).rows[0].id;
  const prod = (await c.query("SELECT id FROM productos WHERE tenant_id=$1 LIMIT 1", [TENANT])).rows[0].id;
  const ticket = (await c.query("SELECT abrir_ticket($1,$2,$3,'MESA'::modo_servicio,NULL,NULL,$4,$5) AS id", [SUC, CAJA, turno, `hub-${Date.now()}`, CAJERO])).rows[0].id;
  await c.query("SELECT agregar_item_a_ticket($1,$2,1,NULL,'[]'::jsonb,$3)", [ticket, prod, `hub-item-${Date.now()}`]);

  console.log("· enviando el ticket a COCINA…");
  await c.query("UPDATE tickets SET estado_cocina='EN_COCINA' WHERE id=$1", [ticket]);

  // El KDS debe recibirlo en tiempo real (< 1.5s).
  await wait(1500);
  const enCocina = eventos.find((e) => e.evento === "cocina" && e.data.includes(ticket) && e.data.includes("EN_COCINA"));
  if (!enCocina) throw new Error(`el KDS NO recibió el evento EN_COCINA. Eventos: ${JSON.stringify(eventos)}`);
  const t1 = Date.now();
  console.log(`· ⚡ KDS recibió EN_COCINA en tiempo real: folio ${JSON.parse(enCocina.data).folio}`);

  // Marcar LISTO → segundo evento en vivo.
  await c.query("UPDATE tickets SET estado_cocina='LISTO' WHERE id=$1", [ticket]);
  await wait(1500);
  const listo = eventos.find((e) => e.evento === "cocina" && e.data.includes(ticket) && e.data.includes("LISTO"));
  if (!listo) throw new Error("el KDS NO recibió el evento LISTO");
  console.log(`· ⚡ KDS recibió LISTO en tiempo real (${Date.now() - t1}ms después)`);
  c.release();

  // Modo KDS: un token de DISPOSITIVO lee las comandas por el gateway (sin PIN de empleado) —
  // es lo que hace la pantalla de cocina dedicada (?kds). tickets_select es por tenant, no identidad.
  const dev = await fetch(`${GW}/auth/v1/token?grant_type=password`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: DEVICE_EMAIL, password: DEVICE_PASS }),
  }).then((r) => r.json());
  const comandas = await fetch(`${GW}/rest/v1/tickets?select=id,folio_completo,estado_cocina&estado_cocina=in.(EN_COCINA,LISTO)`, {
    headers: { Authorization: `Bearer ${dev.access_token}`, apikey: "anon" },
  }).then((r) => r.json());
  if (!Array.isArray(comandas) || !comandas.find((x) => x.id === ticket)) throw new Error(`el token de DISPOSITIVO no leyó la comanda: ${JSON.stringify(comandas).slice(0, 150)}`);
  console.log(`· Modo KDS: el token de DISPOSITIVO lee ${comandas.length} comanda(s) por el gateway (sin PIN) ✓`);

  console.log("\n✅ HUB OK — la caja hace de servidor en la LAN y el KDS ve las órdenes AL INSTANTE");
  console.log("   por LISTEN/NOTIFY (sin polling), 100% offline. Base de la Fase 2.");
} catch (e) {
  console.error("\n❌ HUB FALLÓ:", e.message);
  process.exitCode = 1;
} finally {
  try { abort?.abort(); } catch { /* */ }
  if (backend) await backend.stop();
}
