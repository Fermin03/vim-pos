// La guarda del mock. Lo que se protege aquí es que un despliegue al que le falta un secret NO
// emita comprobantes falsos: sin PAC real y sin permiso explícito, no se timbra.
import test from "node:test";
import assert from "node:assert/strict";
import { elegirPac, PAC_NO_CONFIGURADO } from "./seleccion.ts";

/** Un entorno de mentira, para no depender de Deno ni de la máquina. */
const entorno = (vars: Record<string, string>) => (k: string) => vars[k];

test("con credenciales de Facturama, manda Facturama", () => {
  assert.equal(
    elegirPac(entorno({ FACTURAMA_API_USER: "u", FACTURAMA_API_PASSWORD: "p" })),
    "FACTURAMA",
  );
});

test("Facturama gana a Facturapi aunque estén los dos: es el unico multi-tenant", () => {
  assert.equal(
    elegirPac(entorno({ FACTURAMA_API_USER: "u", FACTURAMA_API_PASSWORD: "p", FACTURAPI_API_KEY: "k" })),
    "FACTURAMA",
  );
});

test("con Facturama a medias NO se usa Facturama", () => {
  // Media credencial no timbra; caer a Facturapi seria peor (emitiria con NUESTRO RFC).
  assert.equal(elegirPac(entorno({ FACTURAMA_API_USER: "u" })), "NINGUNO");
  assert.equal(elegirPac(entorno({ FACTURAMA_API_PASSWORD: "p" })), "NINGUNO");
});

test("sin nada configurado: NINGUNO, no el mock", () => {
  assert.equal(elegirPac(entorno({})), "NINGUNO");
});

test("el mock necesita permiso explicito", () => {
  assert.equal(elegirPac(entorno({ PAC_PERMITIR_MOCK: "1" })), "MOCK");
});

test("un permiso que no es exactamente 1 no vale", () => {
  for (const v of ["", "0", "true", "si", "yes", "2"]) {
    assert.equal(elegirPac(entorno({ PAC_PERMITIR_MOCK: v })), "NINGUNO", `PAC_PERMITIR_MOCK=${v}`);
  }
});

test("el permiso del mock NO desplaza a un PAC real", () => {
  // Si alguien deja la variable puesta en produccion, no debe degradar el timbrado.
  assert.equal(
    elegirPac(entorno({ FACTURAMA_API_USER: "u", FACTURAMA_API_PASSWORD: "p", PAC_PERMITIR_MOCK: "1" })),
    "FACTURAMA",
  );
  assert.equal(
    elegirPac(entorno({ FACTURAPI_API_KEY: "k", PAC_PERMITIR_MOCK: "1" })),
    "FACTURAPI",
  );
});

test("las credenciales en blanco no cuentan como configuradas", () => {
  assert.equal(elegirPac(entorno({ FACTURAMA_API_USER: "  ", FACTURAMA_API_PASSWORD: "  " })), "NINGUNO");
  assert.equal(elegirPac(entorno({ FACTURAPI_API_KEY: "   " })), "NINGUNO");
});

test("el codigo de error es estable: viaja a la BD y al portal", () => {
  assert.equal(PAC_NO_CONFIGURADO, "PAC_NO_CONFIGURADO");
});
