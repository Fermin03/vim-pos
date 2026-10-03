// Levanta backend + UI del POS empaquetado en puertos de prueba, sin Electron, para verificar la
// pantalla del cliente con dos pestañas del navegador:
//   http://localhost:54460            (la caja)
//   http://localhost:54460/?cliente   (la pantalla del cliente)
// La ventana automática y los monitores son de Electron y se prueban en el instalador.
//
// OJO: el Postgres embebido usa el puerto fijo 54329, el mismo que la caja instalada. Con VIM POS
// abierto en esta máquina el arnés no arranca; ciérralo antes (y no lo abras mientras corre).
import os from "node:os";
import path from "node:path";
import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startBackend } from "../src/backend.mjs";
import { startUiServer } from "../src/ui-server.mjs";
import { listarAnuncios, rutaDeAnuncio } from "../src/anuncios.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");
const GATEWAY = 54450;
const UI = 54460;
// Las imágenes de prueba van a una carpeta temporal, no a la de la caja instalada.
const ANUNCIOS_DIR = path.join(os.tmpdir(), "vim-arnes-anuncios");
// Anuncios de prueba, sin nube: ARNES_ANUNCIOS="a.png,b.jpg,c.webp" copia esas imágenes a la carpeta
// y da de alta sus filas en la base local con ids fijos (se pueden volver a sembrar sin duplicar).
// El primero usa el tiempo general (3 s); el segundo trae tiempo propio (6 s). Sin la variable, se
// quitan las filas de prueba y el tiempo general vuelve a 8 s.
const IDS_PRUEBA = [1, 2, 3].map((n) => `aaaaaaaa-0000-4000-8000-00000000000${n}`);

async function sembrarAnuncios(pool) {
  const imagenes = (process.env.ARNES_ANUNCIOS ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, IDS_PRUEBA.length);
  await pool.query(`DELETE FROM anuncios_pantalla WHERE id = ANY($1::uuid[])`, [IDS_PRUEBA]);
  rmSync(ANUNCIOS_DIR, { recursive: true, force: true });
  mkdirSync(ANUNCIOS_DIR, { recursive: true });
  // La caja solo enseña los anuncios del negocio que el pull dejó anotado en _vim_sync (anuncios.mjs).
  // Se siembra en ese; si la base nunca hizo un pull, se elige uno y se anota (sin pisar uno que ya hubiera).
  await pool.query(`CREATE TABLE IF NOT EXISTS _vim_sync (clave text PRIMARY KEY, valor text, at timestamptz DEFAULT now())`);
  const anotado = (await pool.query(`SELECT valor FROM _vim_sync WHERE clave = 'tenant'`)).rows[0]?.valor;
  const tenant = anotado ?? (await pool.query(`SELECT tenant_id FROM configuracion_tenant LIMIT 1`)).rows[0]?.tenant_id ?? (await pool.query(`SELECT id FROM tenants LIMIT 1`)).rows[0]?.id;
  if (!tenant) return;
  if (!anotado) await pool.query(`INSERT INTO _vim_sync (clave, valor) VALUES ('tenant', $1) ON CONFLICT (clave) DO NOTHING`, [tenant]);
  await pool.query(`INSERT INTO configuracion_tenant (tenant_id, pantalla_cliente_segundos) VALUES ($1, $2) ON CONFLICT (tenant_id) DO UPDATE SET pantalla_cliente_segundos = EXCLUDED.pantalla_cliente_segundos`, [tenant, imagenes.length ? 3 : 8]);
  for (const [i, origen] of imagenes.entries()) {
    const ext = path.extname(origen).toLowerCase().replace(".jpeg", ".jpg");
    copyFileSync(origen, path.join(ANUNCIOS_DIR, `${IDS_PRUEBA[i]}${ext}`));
    await pool.query(`INSERT INTO anuncios_pantalla (id, tenant_id, ruta, orden, segundos) VALUES ($1, $2, $3, $4, $5)`, [IDS_PRUEBA[i], tenant, `${tenant}/${IDS_PRUEBA[i]}${ext}`, i * 10, i === 1 ? 6 : null]);
  }
  console.log(`anuncios de prueba: ${imagenes.length} en ${ANUNCIOS_DIR}`);
}

// Monitores de mentira, para ver el apartado de ajuste con datos.
let estado = {
  disponible: true, modo: "auto", displayId: null, abierta: true,
  monitores: [
    { id: 1, etiqueta: "Monitor 1", ancho: 1920, alto: 1080, esDeLaCaja: true },
    { id: 2, etiqueta: "HDMI", ancho: 1024, alto: 768, esDeLaCaja: false },
  ],
};

const backend = await startBackend({ gatewayPort: GATEWAY, host: "127.0.0.1", uiPorts: [UI], log: (m) => console.log("· [backend]", m) });
await sembrarAnuncios(backend.pool).catch((e) => console.log("no se pudieron sembrar los anuncios de prueba:", e?.message ?? e));
const ui = await startUiServer(UI_DIR, UI, GATEWAY, "127.0.0.1", {
  estadoSync: () => ({ disponible: true, vinculada: false }),
  pantallaCliente: () => estado,
  anuncios: () => listarAnuncios({ pool: backend.pool, dir: ANUNCIOS_DIR }),
  archivoAnuncio: (nombre) => rutaDeAnuncio(ANUNCIOS_DIR, nombre),
  onPantallaCliente: (c) => { estado = { ...estado, modo: c.modo, displayId: c.displayId, abierta: c.modo === "auto" }; return estado; },
});
console.log(`listo: http://localhost:${UI}  ·  http://localhost:${UI}/?cliente`);

const salir = async () => { try { ui.close(); } catch { /* */ } try { await backend.stop(); } catch { /* */ } process.exit(0); };
process.on("SIGINT", salir);
process.on("SIGTERM", salir);
