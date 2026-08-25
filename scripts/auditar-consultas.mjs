// Auditoría de consultas: ejecuta contra el Supabase LOCAL cada `.from(...).select(...)` que
// aparece en las apps y en las Edge Functions, y reporta las que fallan.
//
// Existe porque un `.select()` mal escrito NO lo detecta ni el typecheck ni las pruebas: falla en
// tiempo de ejecución, contra el esquema real, y a veces en silencio. Así se encontraron un embed
// ambiguo que rompía /admin y tres consultas que llevaban tiempo rotas.
//
// Uso:  npx supabase db reset && node scripts/auditar-consultas.mjs
//
// Limitaciones honestas: solo cubre lecturas por PostgREST. No prueba RPC, ni escrituras, ni las
// políticas de RLS (corre como service_role), ni el gateway del escritorio, que implementa los
// embeds por su cuenta y puede comportarse distinto.

// Extrae cada `.from("tabla") … .select("…")` del código y la ejecuta contra PostgREST local.
// Lo que falla aquí, falla en producción.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

import { fileURLToPath } from "node:url";
const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const SRK = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const BASE = "http://127.0.0.1:54321/rest/v1";

function archivos(dir, acc = []) {
  for (const e of readdirSync(dir)) {
    if (e === "node_modules" || e === ".next" || e === "dist" || e.startsWith(".")) continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) archivos(p, acc);
    else if (/\.(ts|tsx|mjs)$/.test(e) && !/\.test\./.test(e)) acc.push(p);
  }
  return acc;
}

/** Une los literales de una llamada `.select(...)`, incluida la concatenación con `+`. */
function literalesDe(txt, desde) {
  let i = desde, prof = 0, out = "", dentro = null;
  for (; i < txt.length && i < desde + 4000; i++) {
    const c = txt[i];
    if (dentro) {
      if (c === "\\") { i++; continue; }
      if (c === dentro) { dentro = null; continue; }
      out += c;
      continue;
    }
    // Saltar comentarios: llevan backticks y comillas que no son parte de la consulta.
    if (c === "/" && txt[i + 1] === "/") { while (i < txt.length && txt[i] !== String.fromCharCode(10)) i++; continue; }
    if (c === "/" && txt[i + 1] === "*") { const f = txt.indexOf("*/", i); i = f < 0 ? txt.length : f + 1; continue; }
    if (c === '"' || c === "'" || c === "`") { dentro = c; continue; }
    if (c === "(") prof++;
    else if (c === ")") { if (prof === 0) break; prof--; }
    else if (c === "," && prof === 0) break;
  }
  return out;
}

const objetivos = ["apps/admin/app", "apps/platform/app", "apps/pos/app", "apps/factura/app", "supabase/functions"];
const consultas = [];
for (const o of objetivos) {
  for (const f of archivos(join(RAIZ, o))) {
    const txt = readFileSync(f, "utf8");
    const re = /\.from\(\s*["'`]([a-z_0-9]+)["'`]\s*\)/g;
    let m;
    while ((m = re.exec(txt))) {
      const tabla = m[1];
      const sel = txt.indexOf(".select(", m.index);
      if (sel < 0 || sel - m.index > 800) continue;
      // Solo lecturas: si entre el `.from()` y el `.select()` hay una escritura, ese `.select()`
      // pertenece a otra consulta más abajo y emparejarlos da falsos positivos.
      if (/\.(insert|update|delete|upsert)\(/.test(txt.slice(m.index, sel))) continue;
      const cols = literalesDe(txt, sel + 8).trim();
      if (!cols || cols === "*") continue;
      const linea = txt.slice(0, m.index).split("\n").length;
      consultas.push({ archivo: relative(RAIZ, f).split("\\").join("/"), linea, tabla, cols });
    }
  }
}

console.log(`${consultas.length} consultas encontradas\n`);
let fallos = 0;
for (const c of consultas) {
  const url = `${BASE}/${c.tabla}?select=${encodeURIComponent(c.cols)}&limit=1`;
  let res, cuerpo;
  try {
    res = await fetch(url, { headers: { apikey: SRK, Authorization: `Bearer ${SRK}` } });
    cuerpo = await res.text();
  } catch (e) { console.log(`RED   ${c.archivo}:${c.linea}  ${e.message}`); continue; }
  if (!res.ok) {
    fallos++;
    let d; try { d = JSON.parse(cuerpo); } catch { d = {}; }
    console.log(`FALLA ${c.archivo}:${c.linea}  from("${c.tabla}")`);
    console.log(`      ${d.code ?? res.status}: ${(d.message ?? cuerpo).slice(0, 150)}`);
    if (d.hint) console.log(`      pista: ${String(d.hint).slice(0, 180)}`);
    console.log();
  }
}
console.log(fallos === 0 ? "TODAS PASAN" : `${fallos} consulta(s) rotas`);
