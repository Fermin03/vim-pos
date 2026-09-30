"use client";
import Link from "next/link";
import { Aviso } from "@vim/ui/styles";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { estadoPrueba } from "@vim/db/cobro";

/**
 * El aviso de la prueba gratis (0141). No bloquea nada ni se puede cerrar: es un dato del contrato,
 * igual que la fecha de cobro. Solo sale a un negocio en prueba con fecha de fin.
 *
 * `warning` y no `danger` aun vencida: la caja sigue vendiendo, así que no hay nada destruido ni
 * impedido (nucleo.md, regla del rojo). Con `conEnlace` lleva a Plan y pagos, donde están los datos
 * para escribirle a VIM.
 */
export function AvisoPrueba({ estado, pruebaHasta, conEnlace = false, className }: {
  estado: string | null | undefined;
  pruebaHasta: string | null | undefined;
  conEnlace?: boolean;
  className?: string;
}) {
  const p = estadoPrueba(estado, pruebaHasta, hoyMx());
  if (p.tipo === "NO_APLICA") return null;
  const enlace = conEnlace ? <> <Link href="/configuracion/plan" className="font-semibold underline underline-offset-2">Ver Plan y pagos</Link></> : null;
  if (p.tipo === "VENCIDA") {
    return (
      <Aviso tono="warning" role="status" className={className}>
        Tu prueba terminó el {fechaLegible(p.hasta)}; escríbenos para activar tu plan. Tu caja sigue funcionando mientras tanto.{enlace}
      </Aviso>
    );
  }
  return (
    <Aviso tono="info" role="status" className={className}>
      Tu prueba gratis termina el {fechaLegible(p.hasta)}
      {p.dias === 0 ? " (hoy)" : p.dias === 1 ? " (mañana)" : ` (faltan ${p.dias} días)`}.{enlace}
    </Aviso>
  );
}
