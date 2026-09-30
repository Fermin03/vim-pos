// El RFC emisor con que se timbra. Módulo puro (node --test).
//
// Facturama Multiemisor es UNA cuenta de VIM para todos los clientes y elige el sello por el
// `Issuer.Rfc` del payload. Si ese RFC saliera de algo que el cliente escribe —el RFC de su
// configuración, el de su ficha, el del borrador— cualquier negocio podría timbrar con el sello de
// otro cliente de VIM (auditoría 30/09/2026, C1-1). La única prueba de propiedad de un RFC es
// haber cargado su CSD (.cer + .key + contraseña) con éxito en `cargar-csd`, que es quien escribe
// `tenant_cfdi_emisor.rfc_verificado` (migración 0135). Aquí se decide con eso y nada más.

export type EmisorResuelto =
  | { ok: true; rfc: string }
  | { ok: false; error: "SIN_SELLO_VERIFICADO" | "EMISOR_NO_COINCIDE"; mensaje: string };

const normalizar = (v: string | null | undefined): string => (v ?? "").trim().toUpperCase();

/**
 * `declarados`: todo RFC que otra parte del sistema dice que es el del emisor (la configuración de
 * facturación, la ficha del negocio, el borrador). Deben coincidir TODOS con el verificado: si no,
 * lo que el cliente ve o imprime diría un emisor y el CFDI saldría con otro. Los vacíos se ignoran
 * (un dato que falta no contradice; su ausencia la validan quienes lo exigen).
 */
export function resolverEmisorVerificado(
  rfcVerificado: string | null | undefined,
  declarados: (string | null | undefined)[],
): EmisorResuelto {
  const verificado = normalizar(rfcVerificado);
  if (!verificado) {
    return {
      ok: false,
      error: "SIN_SELLO_VERIFICADO",
      mensaje: "Carga el sello digital (CSD) del negocio en Configuración → Facturación antes de facturar.",
    };
  }
  const distinto = declarados.map(normalizar).find((d) => d !== "" && d !== verificado);
  if (distinto) {
    return {
      ok: false,
      error: "EMISOR_NO_COINCIDE",
      mensaje: `El RFC capturado (${distinto}) no es el del sello cargado (${verificado}). Corrige el RFC o vuelve a cargar el sello.`,
    };
  }
  return { ok: true, rfc: verificado };
}
