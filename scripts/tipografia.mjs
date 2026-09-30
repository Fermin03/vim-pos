// Escala tipográfica de las apps (packages/config/tailwind-preset.js → `fontSize`).
//
//   node scripts/tipografia.mjs            revisa: falla si hay un `text-[Npx]` fuera de la escala
//   node scripts/tipografia.mjs --migrar   cambia cada `text-[Npx]` por el paso de la escala
//
// Había ~1,750 tamaños escritos a mano en 35 valores distintos —12px, 12.5px y 13px conviviendo—
// (revisión de diseño, sep 2026). La migración redondea al paso más cercano y, en empate, hacia
// arriba: en la caja se lee a un metro, y medio píxel de más no le hace daño a nadie.
//
// Quedan fuera los recibos: dibujan en pantalla el papel térmico, y su tipografía imita la de la
// impresora, no la de la interfaz. Y los números de adorno de 60px o más (el "404").

import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const ESCALA = [11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 40];
const ADORNO = 60;

/** Archivos que imitan el papel del ticket: su tipografía es la de la impresora. */
const PAPEL = [
  "apps/pos/app/components/recibo-ticket.tsx",
  "apps/pos/app/components/recibo-z.tsx",
  "apps/pos/app/components/recibo-comanda.tsx",
  "apps/pos/app/components/recibo-devolucion.tsx",
  "apps/pos/app/components/recibo-preview.tsx",
];

const RE = /text-\[(\d+(?:\.\d+)?)px\]/g;

export function paso(px) {
  if (px <= ESCALA[0]) return ESCALA[0];
  let mejor = ESCALA[0];
  for (const s of ESCALA) {
    const d = Math.abs(s - px);
    const dm = Math.abs(mejor - px);
    if (d < dm || (d === dm && s > mejor)) mejor = s;
  }
  return mejor;
}

const migrar = process.argv.includes("--migrar");
const archivos = execFileSync("git", ["ls-files", "apps", "packages"], { encoding: "utf8" })
  .split("\n")
  .filter((f) => /\.(tsx?|jsx?|css)$/.test(f) && !PAPEL.includes(f));

const fuera = [];
let cambios = 0;
for (const f of archivos) {
  const s = readFileSync(f, "utf8");
  if (!RE.test(s)) continue;
  RE.lastIndex = 0;
  if (migrar) {
    const n = s.replace(RE, (m, v) => {
      const px = Number(v);
      if (px >= ADORNO) return m;
      cambios++;
      return `text-${paso(px)}`;
    });
    if (n !== s) writeFileSync(f, n);
  } else {
    s.split("\n").forEach((linea, i) => {
      for (const m of linea.matchAll(RE)) if (Number(m[1]) < ADORNO) fuera.push(`${f}:${i + 1}  ${m[0]}`);
    });
  }
}

if (migrar) {
  console.log(`${cambios} clases migradas a la escala.`);
} else if (fuera.length > 0) {
  console.error(fuera.join("\n"));
  console.error(
    `\n${fuera.length} tamaños fuera de la escala. Usa text-${ESCALA.join("/")} ` +
      `(o \`node scripts/tipografia.mjs --migrar\`).`,
  );
  process.exit(1);
} else {
  console.log("Tipografía: todo en la escala.");
}
