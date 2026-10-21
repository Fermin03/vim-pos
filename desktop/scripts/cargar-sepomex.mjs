// Carga el catálogo de Correos de México (CPdescarga.txt) en sepomex_asentamientos (0187).
//
//   SEPOMEX_DB_URL=postgres://… node scripts/cargar-sepomex.mjs C:/ruta/CPdescarga.txt
//
// Vacía y recarga en UNA transacción: repetirlo con un archivo nuevo es seguro, y si algo falla la
// tabla queda como estaba. El archivo no se versiona. La URL es la de la base (producción o la local
// de dev); el script no la escribe en ningún lado.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ENCABEZADOS = ["d_codigo", "d_asenta", "d_tipo_asenta", "D_mnpio", "d_estado", "d_ciudad", "d_CP", "c_estado", "c_oficina", "c_CP", "c_tipo_asenta", "c_mnpio"];

export function parsearSepomex(texto) {
  const lineas = texto.split(/\r?\n/);
  const i = lineas.findIndex((l) => l.startsWith("d_codigo|"));
  if (i < 0 || !ENCABEZADOS.every((e, k) => lineas[i].split("|")[k] === e)) throw new Error("El archivo no trae los encabezados de SEPOMEX");
  const col = Object.fromEntries(lineas[i].split("|").map((n, k) => [n, k]));
  return lineas.slice(i + 1).filter((l) => l.trim()).map((l) => {
    const c = l.split("|");
    return {
      codigo_postal: c[col.d_codigo], nombre: c[col.d_asenta].trim(), tipo: c[col.d_tipo_asenta],
      municipio: c[col.D_mnpio], estado: c[col.d_estado], clave_municipio: c[col.c_estado] + c[col.c_mnpio],
    };
  });
}

async function cargar(ruta, url) {
  const filas = parsearSepomex(readFileSync(ruta, "latin1"));
  const db = new pg.Client({ connectionString: url });
  await db.connect();
  try {
    await db.query("BEGIN");
    await db.query("TRUNCATE sepomex_asentamientos RESTART IDENTITY");
    for (let i = 0; i < filas.length; i += 5000) {
      await db.query(
        `INSERT INTO sepomex_asentamientos (codigo_postal, nombre, tipo, municipio, estado, clave_municipio)
         SELECT codigo_postal, nombre, tipo, municipio, estado, clave_municipio
           FROM jsonb_to_recordset($1::jsonb) AS x(codigo_postal text, nombre text, tipo text, municipio text, estado text, clave_municipio text)`,
        [JSON.stringify(filas.slice(i, i + 5000))]);
    }
    await db.query("COMMIT");
    console.log(`✅ ${filas.length} asentamientos cargados`);
  } catch (e) {
    await db.query("ROLLBACK");
    throw e;
  } finally {
    await db.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [ruta] = process.argv.slice(2);
  if (!ruta || !process.env.SEPOMEX_DB_URL) {
    console.error("Uso: SEPOMEX_DB_URL=postgres://… node scripts/cargar-sepomex.mjs <CPdescarga.txt>");
    process.exit(2);
  }
  await cargar(ruta, process.env.SEPOMEX_DB_URL);
}
