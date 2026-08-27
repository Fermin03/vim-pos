// ⚠ Este archivo entró en un commit cuyo mensaje habla de otra cosa (7cbff81, «el rescate de
// cortes va automatico»): se arrastró sin querer con `git add -A`. Ver docs/ATRIBUCION-COMMITS.md.

// Verificación de que el PUSH se parte en lotes y no se atora con un pendiente grande.
//
// Vive sin Postgres a propósito, igual que verify-sync-ciclo: lo que hay que probar aquí es la
// POLÍTICA (cuántas ventas por petición, qué pasa si un lote falla a la mitad, qué se marca como
// subido), y eso no necesita una base de datos — necesita poder provocar 450 ventas pendientes y
// una nube que falle cuando yo quiera, dos cosas que con el Postgres embebido son lentas y
// difíciles de montar. El SQL nuevo lo cubre `npm run verify:push` contra la base real.
//
// Correr:  npm run verify:push-lotes
import http from "node:http";
import { Buffer } from "node:buffer";
import { pushToCloud, trocear } from "./sync-push.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Un Postgres de mentiras que sabe lo justo
// ─────────────────────────────────────────────────────────────────────────────

const RELLENO = "x".repeat(2000); // para que cada ticket pese como uno real (~2 KB)

/**
 * Universo de prueba: `nTickets` ventas terminales repartidas en `nTurnos` turnos, cada una con
 * 4 renglones y un pago. Responde las mismas consultas que sync-push.mjs le hace al pool real.
 */
function crearPoolFalso({ nTickets = 450, nTurnos = 5, turnosCambiados = [] } = {}) {
  const turnos = Array.from({ length: nTurnos }, (_, i) => ({ id: `turno-${i}`, estado: "CERRADO" }));
  const tickets = Array.from({ length: nTickets }, (_, i) => ({
    id: `ticket-${String(i).padStart(4, "0")}`,
    turno_id: `turno-${i % nTurnos}`,
    folio_completo: `K-2026-${String(i).padStart(6, "0")}`,
    estado_fiscal: "PAGADO",
    relleno: RELLENO,
  }));
  const items = tickets.flatMap((t) => Array.from({ length: 4 }, (_, j) => ({ id: `${t.id}-item-${j}`, ticket_id: t.id })));
  const pagos = tickets.map((t) => ({ id: `${t.id}-pago`, ticket_id: t.id }));

  const subidos = new Set();
  const turnosMarcados = new Map();

  const pool = {
    consultas: 0,
    subidos,
    turnosMarcados,
    async query(sql, params = []) {
      pool.consultas++;

      if (sql.startsWith("CREATE TABLE")) return { rows: [] };

      if (sql.includes("array_agg(id ORDER BY fecha_apertura)")) {
        const pendientes = tickets.filter((t) => !subidos.has(t.id)).map((t) => t.id);
        const cambiados = turnosCambiados.filter((id) => !turnosMarcados.has(id));
        return { rows: [{ ids: pendientes.length ? pendientes : null, turnos: cambiados.length ? cambiados : null }] };
      }

      if (sql.includes("WITH tk AS")) {
        const [, ticketIds, turnoIds] = params;
        const delLote = ticketIds === null
          ? tickets.filter((t) => !subidos.has(t.id))
          : tickets.filter((t) => ticketIds.includes(t.id));
        // Turnos: los que la FK exige + los forzados por el llamador.
        const refs = new Set(delLote.map((t) => t.turno_id));
        for (const id of turnoIds ?? []) refs.add(id);
        if (ticketIds === null && turnoIds === null) for (const id of turnosCambiados) refs.add(id);
        const delLoteTurnos = turnos.filter((t) => refs.has(t.id));
        const idsLote = delLote.map((t) => t.id);
        return {
          rows: [{
            ids: idsLote.length ? idsLote : null,
            turnos: delLoteTurnos.length ? delLoteTurnos.map((t) => ({ id: t.id, huella: `h-${t.id}` })) : null,
            snapshot: {
              turnos: delLoteTurnos,
              tickets: delLote,
              ticket_items: items.filter((i) => idsLote.includes(i.ticket_id)),
              pagos: pagos.filter((p) => idsLote.includes(p.ticket_id)),
            },
          }],
        };
      }

      if (sql.includes("_vim_push_ok(ticket_id)")) {
        for (const id of params[0]) subidos.add(id);
        return { rows: [] };
      }

      if (sql.includes("_vim_turnos_ok(turno_id")) {
        for (const t of JSON.parse(params[0])) turnosMarcados.set(t.id, t.huella);
        return { rows: [] };
      }

      /* Rescate de cortes (0.4.50): `asegurarTabla` lo llama una vez por caja. Aquí se
         responde "ya corrió" para que no intente nada — lo que esta prueba mide es la
         política de LOTES, y el rescate tiene su propia verificación contra la base real.
         Se contestan explícitamente en vez de aflojar el `throw` de abajo: que el pool
         falso reviente ante una consulta que nadie previó es justo lo que hace fiable a
         esta prueba. */
      if (sql.includes("_vim_migraciones_sync")) {
        // SELECT de comprobación → devuelve una fila = "ya se hizo, no repetir".
        return sql.trim().toUpperCase().startsWith("SELECT") ? { rows: [{}], rowCount: 1 } : { rows: [], rowCount: 0 };
      }

      throw new Error(`consulta no prevista por el pool falso: ${sql.slice(0, 80)}`);
    },
  };
  return pool;
}

// ─────────────────────────────────────────────────────────────────────────────
// Una nube de mentiras que puede portarse mal
// ─────────────────────────────────────────────────────────────────────────────

function crearNubeFalsa(politica = () => ({ status: 200 })) {
  const recibidas = [];
  const servidor = http.createServer((req, res) => {
    let cuerpo = "";
    req.on("data", (c) => (cuerpo += c));
    req.on("end", () => {
      const bytes = Buffer.byteLength(cuerpo);
      const { snapshot } = JSON.parse(cuerpo);
      const decision = politica({ n: recibidas.length, snapshot, bytes });
      recibidas.push({ snapshot, bytes });
      res.statusCode = decision.status;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(decision.cuerpo ?? { resultado: { tickets: (snapshot.tickets ?? []).length } }));
    });
  });
  return { servidor, recibidas };
}

const escuchar = (servidor) => new Promise((r) => servidor.listen(0, "127.0.0.1", () => r(servidor.address().port)));
const cerrar = (servidor) => new Promise((r) => servidor.close(r));

function afirmar(condicion, mensaje) {
  if (!condicion) throw new Error(mensaje);
}

/** Todo ticket de una petición debe traer su turno y sus hijos en la MISMA petición (FK). */
function afirmarLoteCoherente(snapshot, i) {
  const idsTicket = new Set((snapshot.tickets ?? []).map((t) => t.id));
  const idsTurno = new Set((snapshot.turnos ?? []).map((t) => t.id));
  for (const t of snapshot.tickets ?? []) {
    afirmar(idsTurno.has(t.turno_id), `lote ${i}: el ticket ${t.id} viaja sin su turno ${t.turno_id} (la FK lo rechazaría)`);
  }
  for (const it of snapshot.ticket_items ?? []) {
    afirmar(idsTicket.has(it.ticket_id), `lote ${i}: el renglón ${it.id} viaja sin su ticket`);
  }
  for (const p of snapshot.pagos ?? []) {
    afirmar(idsTicket.has(p.ticket_id), `lote ${i}: el pago ${p.id} viaja sin su ticket`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pruebas
// ─────────────────────────────────────────────────────────────────────────────

const pruebas = [];
const prueba = (nombre, fn) => pruebas.push({ nombre, fn });

prueba("450 ventas pendientes se parten en lotes de 100 y llegan todas una sola vez", async () => {
  const pool = crearPoolFalso({ nTickets: 450 });
  const { servidor, recibidas } = crearNubeFalsa();
  const puerto = await escuchar(servidor);
  try {
    const r = await pushToCloud(pool, { cloudUrl: `http://127.0.0.1:${puerto}`, anonKey: "x", deviceToken: "y" }, () => {});

    afirmar(recibidas.length === 5, `se esperaban 5 peticiones, llegaron ${recibidas.length}`);
    afirmar(r.subidos === 450, `se esperaban 450 subidas, fueron ${r.subidos}`);

    const vistos = [];
    recibidas.forEach((p, i) => {
      afirmarLoteCoherente(p.snapshot, i);
      afirmar(p.snapshot.tickets.length <= 100, `lote ${i} trae ${p.snapshot.tickets.length} ventas (más de 100)`);
      vistos.push(...p.snapshot.tickets.map((t) => t.id));
    });
    afirmar(new Set(vistos).size === 450, `llegaron ${new Set(vistos).size} ventas distintas de 450`);
    afirmar(vistos.length === 450, `alguna venta viajó repetida (${vistos.length} envíos para 450 ventas)`);
    afirmar(pool.subidos.size === 450, `quedaron marcadas ${pool.subidos.size} de 450`);
  } finally { await cerrar(servidor); }
});

prueba("un lote que pesa de más se parte solo, aunque quepa en el conteo de ventas", async () => {
  const pool = crearPoolFalso({ nTickets: 200 });
  const { servidor, recibidas } = crearNubeFalsa();
  const puerto = await escuchar(servidor);
  try {
    // 100 ventas × ~2 KB ≈ 200 KB. Con el techo en 60 KB, cada lote tiene que partirse solo.
    const maxBytes = 60 * 1024;
    await pushToCloud(pool, { cloudUrl: `http://127.0.0.1:${puerto}`, anonKey: "x", deviceToken: "y" }, () => {}, { maxBytesPorLote: maxBytes });

    afirmar(recibidas.length > 2, `no se partió por tamaño: solo ${recibidas.length} peticiones`);
    for (const [i, p] of recibidas.entries()) {
      afirmar(p.bytes <= maxBytes, `la petición ${i} pesó ${p.bytes} B, por encima del techo de ${maxBytes} B`);
      afirmarLoteCoherente(p.snapshot, i);
    }
    afirmar(pool.subidos.size === 200, `quedaron marcadas ${pool.subidos.size} de 200`);
  } finally { await cerrar(servidor); }
});

prueba("si la nube contesta 413, el lote se parte en vez de reintentar lo mismo", async () => {
  const pool = crearPoolFalso({ nTickets: 100 });
  // Techo del "servidor": más de 30 ventas por petición y contesta 413.
  const { servidor, recibidas } = crearNubeFalsa(({ snapshot }) =>
    (snapshot.tickets ?? []).length > 30 ? { status: 413, cuerpo: { error: "PAYLOAD_TOO_LARGE" } } : { status: 200 });
  const puerto = await escuchar(servidor);
  try {
    const r = await pushToCloud(pool, { cloudUrl: `http://127.0.0.1:${puerto}`, anonKey: "x", deviceToken: "y" }, () => {});
    afirmar(r.subidos === 100, `se esperaban 100 subidas pese a los 413, fueron ${r.subidos}`);
    const aceptadas = recibidas.filter((p) => (p.snapshot.tickets ?? []).length <= 30);
    const vistos = new Set(aceptadas.flatMap((p) => p.snapshot.tickets.map((t) => t.id)));
    afirmar(vistos.size === 100, `solo ${vistos.size} de 100 ventas lograron entrar`);
  } finally { await cerrar(servidor); }
});

prueba("si un lote falla a la mitad, lo ya subido queda marcado y el siguiente ciclo retoma", async () => {
  const pool = crearPoolFalso({ nTickets: 450 });
  // La nube se cae en la tercera petición (y solo en esa).
  let caidas = 0;
  const { servidor, recibidas } = crearNubeFalsa(({ n }) => {
    if (n === 2 && caidas === 0) { caidas++; return { status: 500, cuerpo: { error: "BOOM" } }; }
    return { status: 200 };
  });
  const puerto = await escuchar(servidor);
  const opts = { cloudUrl: `http://127.0.0.1:${puerto}`, anonKey: "x", deviceToken: "y" };
  try {
    let fallo = null;
    try {
      await pushToCloud(pool, opts, () => {});
    } catch (e) { fallo = e; }

    afirmar(fallo, "el push debía lanzar cuando la nube contesta 500");
    afirmar(/200 de 450/.test(fallo.message), `el error debe decir cuánto sí subió; dijo: ${fallo.message}`);
    afirmar(pool.subidos.size === 200, `debían quedar 200 marcadas tras el fallo, quedaron ${pool.subidos.size}`);

    // Segundo ciclo: retoma donde se quedó y NO reenvía lo que ya estaba arriba.
    const antes = recibidas.length;
    const r2 = await pushToCloud(pool, opts, () => {});
    afirmar(r2.subidos === 250, `el segundo ciclo debía subir las 250 restantes, subió ${r2.subidos}`);
    afirmar(pool.subidos.size === 450, `al final debían estar las 450, están ${pool.subidos.size}`);

    const reenviados = recibidas.slice(antes).flatMap((p) => p.snapshot.tickets.map((t) => t.id));
    afirmar(new Set(reenviados).size === 250, `el segundo ciclo reenvió ${new Set(reenviados).size} ventas en vez de 250`);
  } finally { await cerrar(servidor); }
});

prueba("un cierre de turno sin ventas nuevas sigue viajando solo", async () => {
  const pool = crearPoolFalso({ nTickets: 0, nTurnos: 3, turnosCambiados: ["turno-1"] });
  const { servidor, recibidas } = crearNubeFalsa();
  const puerto = await escuchar(servidor);
  try {
    const r = await pushToCloud(pool, { cloudUrl: `http://127.0.0.1:${puerto}`, anonKey: "x", deviceToken: "y" }, () => {});
    afirmar(recibidas.length === 1, `se esperaba 1 petición con el turno, llegaron ${recibidas.length}`);
    afirmar(r.turnos === 1, `se esperaba 1 turno subido, fueron ${r.turnos}`);
    const ids = (recibidas[0].snapshot.turnos ?? []).map((t) => t.id);
    afirmar(ids.includes("turno-1"), `el turno cambiado no viajó: ${JSON.stringify(ids)}`);
  } finally { await cerrar(servidor); }
});

prueba("sin nada pendiente no se hace ni una petición", async () => {
  const pool = crearPoolFalso({ nTickets: 0, nTurnos: 1 });
  const { servidor, recibidas } = crearNubeFalsa();
  const puerto = await escuchar(servidor);
  try {
    const r = await pushToCloud(pool, { cloudUrl: `http://127.0.0.1:${puerto}`, anonKey: "x", deviceToken: "y" }, () => {});
    afirmar(recibidas.length === 0, `no debía salir ninguna petición, salieron ${recibidas.length}`);
    afirmar(r.subidos === 0, `subidos debía ser 0, fue ${r.subidos}`);
  } finally { await cerrar(servidor); }
});

prueba("trocear reparte sin perder ni repetir", async () => {
  afirmar(trocear([1, 2, 3, 4, 5], 2).length === 3, "5 elementos de a 2 son 3 trozos");
  afirmar(trocear([], 10).length === 0, "una lista vacía no produce trozos");
  afirmar(trocear([1, 2, 3], 10).length === 1, "menos elementos que el tamaño son 1 trozo");
  afirmar(trocear([1, 2, 3, 4], 2).flat().join() === "1,2,3,4", "trocear no altera el orden ni el contenido");
});

// ─────────────────────────────────────────────────────────────────────────────

let fallidas = 0;
for (const { nombre, fn } of pruebas) {
  try {
    await fn();
    console.log(`  ✓ ${nombre}`);
  } catch (e) {
    fallidas++;
    console.log(`  ✗ ${nombre}\n      ${e.message}`);
  }
}

if (fallidas) {
  console.error(`\n❌ PUSH POR LOTES: ${fallidas} de ${pruebas.length} pruebas fallaron.`);
  process.exitCode = 1;
} else {
  console.log(`\n✅ PUSH POR LOTES OK — ${pruebas.length}/${pruebas.length}. Un pendiente grande sube a pedazos,`);
  console.log("   cada lote lleva sus turnos, y un fallo a media lista conserva lo que ya se subió.");
}
