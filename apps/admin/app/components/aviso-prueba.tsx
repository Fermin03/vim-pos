"use client";
import Link from "next/link";
import { Aviso } from "@vim/ui/styles";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { estadoPrueba } from "@vim/db/cobro";
import { useAvisoCerrado } from "./aviso-cerrado";

/**
 * El aviso de la prueba gratis (0141). No bloquea nada. Se puede cerrar con la "×" (se recuerda en
 * este navegador); "tu prueba terminó" es otro aviso y vuelve a salir aunque se haya cerrado el de
 * "termina el…". Solo sale a un negocio en prueba con fecha de fin.
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
  const { cerrado, cerrar } = useAvisoCerrado(p.tipo === "NO_APLICA" ? null : `prueba:${p.tipo}:${p.hasta}`);
  if (p.tipo === "NO_APLICA" || cerrado) return null;
  const enlace = conEnlace ? <> <Link href="/configuracion/plan" className="font-semibold underline underline-offset-2">Ver Plan y pagos</Link></> : null;
  if (p.tipo === "VENCIDA") {
    return (
      <Aviso tono="warning" role="status" className={className} onCerrar={cerrar}>
        Tu prueba terminó el {fechaLegible(p.hasta)}; escríbenos para activar tu plan. Tu caja sigue funcionando mientras tanto.{enlace}
      </Aviso>
    );
  }
  return (
    <Aviso tono="info" role="status" className={className} onCerrar={cerrar}>
      Tu prueba gratis termina el {fechaLegible(p.hasta)}
      {p.dias === 0 ? " (hoy)" : p.dias === 1 ? " (mañana)" : ` (faltan ${p.dias} días)`}.{enlace}
    </Aviso>
  );
}
