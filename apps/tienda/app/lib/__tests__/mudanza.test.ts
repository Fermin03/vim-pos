import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import config from "../../../next.config.mjs";

const VIEJO = "pedidos.vimpos.com.mx";
const RAIZ = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("mudanza a online.vimpos.com.mx", () => {
  it("el host viejo redirige 308 a la misma ruta en el nuevo", async () => {
    const reglas = await config.redirects!();
    expect(reglas).toEqual([{
      source: "/:path*",
      has: [{ type: "host", value: VIEJO }],
      destination: "https://online.vimpos.com.mx/:path*",
      permanent: true,
    }]);
  });

  it("las cabeceras de seguridad siguen ahí", async () => {
    expect((await config.headers!()).length).toBeGreaterThan(0);
  });

  it("ningún código de apps/ ni de las funciones nombra el host viejo (salvo la redirección y esta prueba)", () => {
    const sueltos: string[] = [];
    const recorre = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.name === "node_modules" || e.name === ".next") continue;
        const ruta = join(dir, e.name);
        if (e.isDirectory()) recorre(ruta);
        else if (/\.(ts|tsx|mjs|js)$/.test(e.name) && e.name !== "next.config.mjs" && e.name !== "mudanza.test.ts"
          && readFileSync(ruta, "utf8").includes(VIEJO)) sueltos.push(relative(RAIZ, ruta));
      }
    };
    recorre(join(RAIZ, "apps"));
    recorre(join(RAIZ, "supabase", "functions"));
    expect(sueltos).toEqual([]);
  });
});
