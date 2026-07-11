// Fase 3 · Genera dist/latest.json para publicar una actualización (Opción B).
// Calcula el SHA-512 del instalador ya construido, lee la versión de package.json y arma el
// manifiesto que consume el actualizador in-app. Uso:
//   npm run dist                          # construye dist/VIM POS Setup <ver>.exe
//   npm run release-manifest -- "Notas de esta versión"
// Luego sube AMBOS (el .exe y latest.json) al bucket público 'actualizaciones' de Supabase Storage.
import crypto from "node:crypto";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
  url: `${BASE}/${encodeURIComponent(fileName)}`,
  sha512,
  notas: process.argv.slice(2).join(" "),
  fecha: new Date().toISOString().slice(0, 10),
};

const out = path.join(root, "dist", "latest.json");
writeFileSync(out, JSON.stringify(manifest, null, 2));
console.log(`✅ ${out}\n`);
console.log(JSON.stringify(manifest, null, 2));
console.log(`\nSube AMBOS al bucket público 'actualizaciones' de Supabase Storage:`);
console.log(`  • ${fileName}`);
console.log(`  • latest.json`);
