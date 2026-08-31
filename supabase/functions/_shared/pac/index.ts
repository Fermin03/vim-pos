// F8 / Fase 4 — Selector de PAC con REDUNDANCIA (multi-PAC).
//
// PAC principal, en orden: Facturama si hay credenciales (el PAC elegido del proyecto), Facturapi
// si hay API key, y mock si no hay nada.
//
// Facturama va primero porque es el único que sirve para multi-tenant: lleva el emisor en el
// payload, así que una sola credencial timbra a nombre de cualquier cliente. Facturapi deduce el
// emisor de la llave, de modo que con una llave global TODO saldría con nuestro RFC — se conserva
// como respaldo, no como principal.
//
// PAC de respaldo (opcional): env PAC_RESPALDO = "mock" | "facturapi" | "facturama".
//
// EL MOCK NO SE USA SOLO. HAY QUE PEDIRLO: env PAC_PERMITIR_MOCK = "1".
//
// Antes era el último de la lista y entraba sin avisar cuando no había credenciales. Eso es lo
// peor que puede hacer aquí: el mock SIMULA un timbrado exitoso —inventa un UUID, arma un XML con
// la forma correcta— así que el CFDI quedaba en TIMBRADO, se consumía un folio y se le mandaba el
// correo al cliente con un comprobante que no existe ante el SAT. La única señal era
// `pac_proveedor = 'OTRO'` en la base, y hay que saber buscarla.
//
// Ahora, sin credenciales y sin permiso explícito, no se timbra: se devuelve un error normal, el
// CFDI se marca ERROR y alguien se entera. Un despliegue al que le falta un secret falla ruidoso
// en vez de emitir facturas falsas. Ver `docs/decisiones/0009-...`.
//
// Política de failover (conservadora, anti doble-timbrado):
//   • Solo se intenta el respaldo si el principal FALLA EN TRANSPORTE (excepción/red).
//   • Si el principal responde ok:false (rechazo de validación del SAT/PAC), NO hay
//     failover: los mismos datos fallarían igual y reintentar en otro PAC arriesga
//     duplicar el comprobante.
import type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";
import { MockPac } from "./mock.ts";
import { FacturapiPac } from "./facturapi.ts";
import { FacturamaPac } from "./facturama.ts";

/* La decisión de qué PAC toca vive en `seleccion.ts`: no importa nada, así que se puede probar
   desde Node sin Deno. Aquí solo se ejecuta. */
export { elegirPac, PAC_NO_CONFIGURADO, type EleccionPac } from "./seleccion.ts";
import { elegirPac as elegir, PAC_NO_CONFIGURADO as SIN_PAC } from "./seleccion.ts";

function credencialesFacturama(): { usuario: string; password: string; base: string } | null {
  const usuario = Deno.env.get("FACTURAMA_API_USER") ?? "";
  const password = Deno.env.get("FACTURAMA_API_PASSWORD") ?? "";
  if (!usuario || !password) return null;
  return {
    usuario,
    password,
    // Sin URL configurada se apunta al sandbox: si alguien despliega a medias, que timbre en
    // pruebas y no contra el SAT de verdad.
    base: Deno.env.get("FACTURAMA_BASE_URL") || "https://apisandbox.facturama.mx",
  };
}

/**
 * Facturama en concreto, para lo que no es timbrar: cargar y quitar sellos.
 *
 * `obtenerPac()` devuelve la interfaz común, que a propósito no sabe de CSD — cargar un sello es
 * una operación de Multiemisor, no algo que todo PAC haga igual. Devuelve `null` si no hay
 * credenciales, y quien llame decide qué decirle al usuario.
 */
export function obtenerFacturama(): FacturamaPac | null {
  const c = credencialesFacturama();
  return c ? new FacturamaPac(c.usuario, c.password, c.base) : null;
}

function construir(nombre: string | undefined): PacAdapter | null {
  switch ((nombre ?? "").toLowerCase()) {
    case "facturama": {
      const c = credencialesFacturama();
      return c ? new FacturamaPac(c.usuario, c.password, c.base) : null;
    }
    case "facturapi": {
      const key = Deno.env.get("FACTURAPI_API_KEY");
      return key && key.length > 0 ? new FacturapiPac(key) : null;
    }
    case "mock":
      // También aquí: `PAC_RESPALDO=mock` no basta para colar el mock en producción.
      return elegir((k) => Deno.env.get(k)) === "MOCK" ? new MockPac() : null;
    default:
      return null;
  }
}

/** El PAC que toca, o `null` si no hay ninguno utilizable (ver `elegirPac`). */
export function obtenerPac(): PacAdapter | null {
  switch (elegir((k) => Deno.env.get(k))) {
    case "FACTURAMA": {
      const c = credencialesFacturama()!;
      return new FacturamaPac(c.usuario, c.password, c.base);
    }
    case "FACTURAPI":
      return new FacturapiPac(Deno.env.get("FACTURAPI_API_KEY")!);
    case "MOCK":
      return new MockPac();
    case "NINGUNO":
      return null;
  }
}

export function obtenerPacRespaldo(principal: PacAdapter): PacAdapter | null {
  const respaldo = construir(Deno.env.get("PAC_RESPALDO"));
  if (!respaldo || respaldo.nombre === principal.nombre) return null;
  return respaldo;
}

export type ResultadoTimbradoMulti = PacTimbradoResult & { pacUsado: string; failover: boolean };

/** Timbra con el principal; si falla EN TRANSPORTE y hay respaldo configurado, reintenta con él. */
export async function timbrarConFailover(req: PacTimbradoRequest): Promise<ResultadoTimbradoMulti> {
  const principal = obtenerPac();

  /* Sin PAC no se inventa un timbrado: se devuelve un error con la misma forma que un rechazo del
     SAT, para que quien llama lo marque en ERROR por el camino que ya tiene y nadie se quede con
     un CFDI a medias. */
  if (!principal) {
    return {
      ok: false,
      codigoError: SIN_PAC,
      mensajeError:
        "No hay PAC de timbrado configurado en este entorno. No se emitió ningún comprobante.",
      responsePayload: { pac: "NINGUNO", motivo: "faltan credenciales del PAC" },
      pacUsado: "NINGUNO",
      failover: false,
    };
  }

  try {
    const r = await principal.timbrar(req);
    return { ...r, pacUsado: principal.nombre, failover: false };
  } catch (e) {
    const respaldo = obtenerPacRespaldo(principal);
    if (!respaldo) throw e;
    const r = await respaldo.timbrar(req);
    return { ...r, pacUsado: respaldo.nombre, failover: true };
  }
}

export type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";
