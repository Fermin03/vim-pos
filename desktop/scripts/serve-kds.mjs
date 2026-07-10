// Diagnóstico: sirve desktop/kds-ui/ con el MISMO ui-server (modo cocina) que usa Electron,
// para inspeccionar en un navegador por qué la app se queda en "Iniciando cocina…".
import { startUiServer } from "../src/ui-server.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = path.join(root, "kds-ui");
const hub = process.env.VIM_HUB_URL || "http://localhost:54350";
await startUiServer(dir, 54361, 54350, "127.0.0.1", { kds: true, hub, onSetHub: () => {} });
console.log(`kds-ui servido en http://localhost:54361 → hub ${hub}`);
