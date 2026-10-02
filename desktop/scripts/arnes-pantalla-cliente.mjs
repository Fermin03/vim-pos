// Levanta backend + UI del POS empaquetado en puertos de prueba, sin Electron, para verificar la
// pantalla del cliente con dos pestañas del navegador:
//   http://localhost:54460            (la caja)
//   http://localhost:54460/?cliente   (la pantalla del cliente)
// La ventana automática y los monitores son de Electron y se prueban en el instalador.
//
// OJO: el Postgres embebido usa el puerto fijo 54329, el mismo que la caja instalada. Con VIM POS
// abierto en esta máquina el arnés no arranca; ciérralo antes (y no lo abras mientras corre).
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startBackend } from "../src/backend.mjs";
import { startUiServer } from "../src/ui-server.mjs";

const UI_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "pos-ui");
const GATEWAY = 54450;
const UI = 54460;

// Monitores de mentira, para ver el apartado de ajuste con datos.
let estado = {
  disponible: true, modo: "auto", displayId: null, abierta: true,
  monitores: [
    { id: 1, etiqueta: "Monitor 1", ancho: 1920, alto: 1080, esDeLaCaja: true },
    { id: 2, etiqueta: "HDMI", ancho: 1024, alto: 768, esDeLaCaja: false },
  ],
};

const backend = await startBackend({ gatewayPort: GATEWAY, host: "127.0.0.1", uiPorts: [UI], log: (m) => console.log("· [backend]", m) });
const ui = await startUiServer(UI_DIR, UI, GATEWAY, "127.0.0.1", {
  estadoSync: () => ({ disponible: true, vinculada: false }),
  pantallaCliente: () => estado,
  onPantallaCliente: (c) => { estado = { ...estado, modo: c.modo, displayId: c.displayId, abierta: c.modo === "auto" }; return estado; },
});
console.log(`listo: http://localhost:${UI}  ·  http://localhost:${UI}/?cliente`);

const salir = async () => { try { ui.close(); } catch { /* */ } try { await backend.stop(); } catch { /* */ } process.exit(0); };
process.on("SIGINT", salir);
process.on("SIGTERM", salir);
