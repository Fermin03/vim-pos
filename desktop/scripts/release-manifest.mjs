// Fase 3 · Genera dist/latest.json para publicar una actualización (Opción B).
// Calcula el SHA-512 del instalador ya construido, lee la versión de package.json y arma el
// manifiesto que consume el actualizador in-app. Uso:
//   npm run dist                          # construye dist/VIM POS Setup <ver>.exe
//   npm run release-manifest -- "Notas de esta versión"
//
// Dónde vive cada archivo (y por qué están separados):
//   • latest.json → bucket público 'actualizaciones' de Supabase Storage. Esta URL NO se puede
//     mover: es la que las versiones ya instaladas traen grabada y donde van a buscar.
//   • el .exe     → GitHub Releases. Supabase (plan Free) rechaza archivos de más de 50 MB y el
//     instalador pesa ~138 MB. El destino del .exe es solo un campo del manifiesto, así que puede
//     estar en cualquier host público.
//
// VIM_UPDATE_URL fija la URL completa del .exe (GitHub renombra los espacios a puntos, así que no
// se puede derivar del nombre local). VIM_UPDATE_BASE sirve si algún día el .exe vuelve al bucket.
//   VIM_UPDATE_URL="https://github.com/<user>/<repo>/releases/download/v<ver>/VIM.POS.Setup.<ver>.exe" \
//     npm run release-manifest -- "Notas"
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { mensajeAFirmar } from "../src/updater.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const version = pkg.version;
const productName = pkg.build?.productName || "VIM POS";
const exe = path.join(root, "dist", `${productName} Setup ${version}.exe`);

if (!existsSync(exe)) {
  console.error(`No existe ${exe}\nCorre primero: npm run dist`);
  process.exit(1);
}

const sha512 = crypto.createHash("sha512").update(readFileSync(exe)).digest("hex");
const BASE = (process.env.VIM_UPDATE_BASE || "https://pbiaxzvmssjsxdwqrumb.supabase.co/storage/v1/object/public/actualizaciones").replace(/\/$/, "");
const fileName = path.basename(exe);
const manifest = {
  version,
  url: process.env.VIM_UPDATE_URL || `${BASE}/${encodeURIComponent(fileName)}`,
  sha512,
  notas: process.argv.slice(2).join(" "),
  fecha: new Date().toISOString().slice(0, 10),
};

// La caja rechaza un manifiesto con URL que no sea https (updater.mjs, D10): mejor enterarse aquí.
if (!manifest.url.startsWith("https://")) {
  console.error(`La URL del instalador tiene que ser https: ${manifest.url}`);
  process.exit(1);
}

// Firma Ed25519 del manifiesto (RUNBOOK.md, "Firmar latest.json"). Con VIM_UPDATE_LLAVE_PRIVADA
// apuntando a la llave privada (PEM), se añade `firma`. Sin ella el manifiesto sale sin firmar, que
// es lo que aceptan las cajas mientras LLAVE_PUBLICA_ACTUALIZACIONES siga en null.
if (process.env.VIM_UPDATE_LLAVE_PRIVADA) {
  const llave = crypto.createPrivateKey(readFileSync(process.env.VIM_UPDATE_LLAVE_PRIVADA));
  manifest.firma = crypto.sign(null, Buffer.from(mensajeAFirmar(manifest), "utf8"), llave).toString("base64");
  console.log("· manifiesto firmado (Ed25519)");
} else {
  console.log("· manifiesto SIN firmar (no hay VIM_UPDATE_LLAVE_PRIVADA)");
}

const out = path.join(root, "dist", "latest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`✅ ${out}\n`);
console.log(JSON.stringify(manifest, null, 2));
console.log(`\nPublicar:`);
console.log(`  • ${fileName} → GitHub Releases (pesa más de los 50 MB que acepta Supabase Free)`);
console.log(`  • latest.json → bucket público 'actualizaciones' de Supabase Storage (URL fija)`);
