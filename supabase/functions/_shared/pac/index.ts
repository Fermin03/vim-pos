// F8 — Selector de PAC.
//
// Hay UN PAC real: Facturama. Es el único que sirve para multi-tenant: lleva el emisor en el
// payload, así que una sola credencial timbra a nombre de cualquier cliente.
//
// No hay PAC de respaldo. Lo hubo en papel —Facturapi, nunca probado contra el servicio—, pero
// Facturapi deduce el emisor de su llave: con una llave global TODO saldría con nuestro RFC y no
// con el del restaurante. Un respaldo que factura a nombre de otro es peor que no tenerlo, y en
// producción nunca estuvo configurado. Se retiró; ver `docs/decisiones/0031-...`.
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
import type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";
import { MockPac } from "./mock.ts";
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

/** El PAC que toca, o `null` si no hay ninguno utilizable (ver `elegirPac`). */
export function obtenerPac(): PacAdapter | null {
  switch (elegir((k) => Deno.env.get(k))) {
    case "FACTURAMA": {
      const c = credencialesFacturama()!;
      return new FacturamaPac(c.usuario, c.password, c.base);
    }
    case "MOCK":
      return new MockPac();
    case "NINGUNO":
      return null;
  }
}

export type ResultadoTimbradoMulti = PacTimbradoResult & { pacUsado: string; failover: boolean };

/**
 * Timbra con el PAC que toca. Si el PAC falla en transporte, la excepción sube a quien llamó.
 *
 * El nombre y el campo `failover` (ya siempre `false`) se conservan porque los tres handlers de
 * timbrado los leen y los registran; no hay un segundo PAC al que conmutar.
 */
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

  const r = await principal.timbrar(req);
  return { ...r, pacUsado: principal.nombre, failover: false };
}

export type { PacAdapter, PacTimbradoRequest, PacTimbradoResult } from "./tipos.ts";
