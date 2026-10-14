import { moduloActivo } from "@vim/db/operacion";

/**
 * Qué accesos enseña el inicio de la caja según los módulos de operación (ADR 0034). Un acceso con
 * cuentas abiertas se queda aunque su módulo se haya apagado: hay que poder terminarlas (spec §6.4).
 * Para llevar no tiene contador: es venta directa.
 */
export function accesosInicio(
  modulos: Record<string, boolean> | null | undefined,
  cuentas: { comedor: number; pickup: number; domicilio: number; barra: number },
): { comedor: boolean; paraLlevar: boolean; pickup: boolean; domicilio: boolean; barra: boolean } {
  const mostrador = moduloActivo(modulos, "mostrador");
  return {
    comedor: moduloActivo(modulos, "comedor") || cuentas.comedor > 0,
    paraLlevar: mostrador,
    pickup: mostrador || cuentas.pickup > 0,
    domicilio: moduloActivo(modulos, "domicilio") || cuentas.domicilio > 0,
    barra: moduloActivo(modulos, "cuentas_barra") || cuentas.barra > 0,
  };
}
