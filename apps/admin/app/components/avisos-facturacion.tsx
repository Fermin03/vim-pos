"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso } from "@vim/ui/styles";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { estadoSello, faltanDias, type EstadoSello } from "@vim/db/sello";
import { leerCfdiEmisor } from "../lib/configuracion";
import { listarPeriodosPendientes, type PeriodoPendiente } from "../lib/facturacion";
import { debeAvisarGlobal, textoGlobalesPendientes } from "../lib/facturacion-estado";

/**
 * Lo que la facturación le tiene que avisar al dueño ANTES de que sea un problema:
 *
 *   · su sello digital está por vencer (30 días antes; más fuerte a 7; y cuando ya venció);
 *   · tiene periodos cerrados sin factura global — se emite a mano, y el SAT da plazo.
 *
 * Una sola lectura para el dashboard y para Facturación, así los dos dicen lo mismo. Si la lectura
 * falla no sale nada: son avisos, no deben tumbar la pantalla donde viven.
 */
export function useAvisosFacturacion() {
  const [sello, setSello] = useState<EstadoSello>({ tipo: "SIN_FECHA" });
  const [pendientes, setPendientes] = useState<PeriodoPendiente[]>([]);
  /** false = el negocio todavía no factura (sin sello) o la tiene en pausa. */
  const [factura, setFactura] = useState(false);
  const [cargado, setCargado] = useState(false);

  const recargar = useCallback(async () => {
    try {
      const emisor = await leerCfdiEmisor();
      setSello(emisor.csd.numeroCertificado ? estadoSello(emisor.csd.vigenciaHasta, hoyMx()) : { tipo: "SIN_FECHA" });
      const avisa = debeAvisarGlobal(emisor);
      setFactura(avisa);
      setPendientes(avisa ? await listarPeriodosPendientes() : []);
    } catch {
      /* avisos: su fallo no rompe la pantalla */
    } finally {
      setCargado(true);
    }
  }, []);
  useEffect(() => { void recargar(); }, [recargar]);

  return { sello, pendientes, factura, cargado, recargar };
}

const enlace = "font-semibold underline underline-offset-2";

/** El aviso del sello. No se puede cerrar: desaparece cuando se sube el sello nuevo. */
export function AvisoSello({ sello, className }: { sello: EstadoSello; className?: string }) {
  if (sello.tipo === "SIN_FECHA" || sello.tipo === "VIGENTE") return null;
  const subir = <Link href="/configuracion/facturacion#sello" className={enlace}>Subir sello nuevo</Link>;
  if (sello.tipo === "VENCIDO") {
    // Rojo: aquí sí hay algo impedido — el negocio no puede facturar (nucleo.md, regla del rojo).
    return (
      <Aviso tono="danger" role="alert" className={className}>
        Tu sello digital venció el {fechaLegible(sello.hasta)} y tu negocio no puede facturar. Tramita uno nuevo en
        el SAT y súbelo aquí. {subir}
      </Aviso>
    );
  }
  if (sello.tipo === "URGENTE") {
    return (
      <Aviso tono="warning" role="alert" className={className}>
        <b>Tu sello digital vence el {fechaLegible(sello.hasta)} ({faltanDias(sello.dias)}).</b> Cuando venza, tu
        negocio deja de facturar. Renuévalo en el SAT hoy y súbelo aquí. {subir}
      </Aviso>
    );
  }
  return (
    <Aviso tono="warning" role="status" className={className}>
      Tu sello digital vence el {fechaLegible(sello.hasta)} ({faltanDias(sello.dias)}). Renuévalo en el SAT y
      súbelo aquí. {subir}
    </Aviso>
  );
}

/**
 * "Tienes N periodos sin factura global: … Emitir". `href` lleva al botón que ya existe en
 * Facturación; dentro de esa misma pantalla es un ancla.
 */
export function AvisoGlobalPendiente({ pendientes, href = "/facturacion#factura-global", className }: {
  pendientes: { desde: string; hasta: string }[];
  href?: string;
  className?: string;
}) {
  const texto = textoGlobalesPendientes(pendientes);
  if (!texto) return null;
  return (
    <Aviso tono="warning" role="status" className={className}>
      {texto} <Link href={href} className={enlace}>Emitir</Link>
    </Aviso>
  );
}

/** Los dos avisos juntos, para el dashboard. */
export function AvisosFacturacion({ className }: { className?: string }) {
  const { sello, pendientes } = useAvisosFacturacion();
  return (
    <>
      <AvisoSello sello={sello} className={className} />
      <AvisoGlobalPendiente pendientes={pendientes} className={className} />
    </>
  );
}
