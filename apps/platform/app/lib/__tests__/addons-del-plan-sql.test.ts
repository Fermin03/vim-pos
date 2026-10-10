import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ADDONS_DEL_PLAN } from "../cambio-plan";

// `ADDONS_DEL_PLAN` es el espejo de la lista de parejas (complemento, bandera del plan) que recorre
// `_sincronizar_addons_del_plan`. Antes los unía un comentario («si cambias uno, cambia el otro»);
// esta prueba lee la definición VIGENTE —la de la migración más reciente que la define— y los compara.
describe("ADDONS_DEL_PLAN contra la base", () => {
  it("lista las mismas parejas que la definición vigente de _sincronizar_addons_del_plan", () => {
    const dir = path.resolve(__dirname, "../../../../../supabase/migrations");
    const definiciones = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()
      .map((f) => /CREATE OR REPLACE FUNCTION public\._sincronizar_addons_del_plan\([\s\S]*?\$\$;/.exec(readFileSync(path.resolve(dir, f), "utf8"))?.[0])
      .filter((d) => d !== undefined);
    expect(definiciones.length).toBeGreaterThan(0);
    // FOR r IN SELECT * FROM (VALUES ('CFDI', 'cfdi_incluido'), …) AS x(codigo, bandera, …)
    const lista = /\(VALUES([\s\S]*?)\)\s*AS\s+\w+\s*\(\s*codigo\s*,\s*bandera/.exec(definiciones.at(-1) ?? "")?.[1] ?? "";
    const deSql = [...lista.matchAll(/\(\s*'([A-Z_]+)'\s*,\s*'([a-z_]+)'/g)].map((m) => ({ codigo: m[1] ?? "", bandera: m[2] ?? "" }));
    expect(deSql.length).toBeGreaterThan(0);
    const orden = (a: { codigo: string }, b: { codigo: string }) => a.codigo.localeCompare(b.codigo);
    expect([...ADDONS_DEL_PLAN].sort(orden)).toEqual(deSql.sort(orden));
  });
});
