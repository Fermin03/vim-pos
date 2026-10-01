"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Aviso } from "@vim/ui/styles";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { estadoSello, faltanDias, type EstadoSello } from "@vim/db/sello";
import { leerCfdiEmisor } from "../lib/configuracion";
import { listarPeriodosPendientes, type PeriodoPendiente } from "../lib/facturacion";
import { debeAvisarGlobal, textoGlobalesPendientes } from "../lib/facturacion-estado";
import { useAvisoCerrado } from "./aviso-cerrado";

/**
 * Lo que la facturación le tiene que avisar al dueño ANTES de que sea un problema:
 *
 *   · su sello digital está por vencer (30 días antes; más fuerte a 7; y cuando ya venció);
 *   · tiene periodos cerrados sin factura global — se emite a mano, y el SAT da plazo.
 *
 * El del sello sale en el dashboard y en Facturación. El de la global SOLO en Facturación, en tono
 * informativo: el dueño decidió (1 oct 2026) que la global no es forzosa y que el panel no insista
 * con ella en el inicio. Los dos se cierran con la "×". Si la lectura falla no sale nada: son
 * avisos, no deben tumbar la pantalla donde viven.
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

/**
 * El aviso del sello. Se cierra con la "×"; cada etapa (por vencer, urgente, vencido) es un aviso
 * distinto, así que cerrar "vence en 30 días" no esconde "vence en 7" ni "ya venció".
 */
export function AvisoSello({ sello, className }: { sello: EstadoSello; className?: string }) {
  const visible = sello.tipo !== "SIN_FECHA" && sello.tipo !== "VIGENTE";
  const { cerrado, cerrar } = useAvisoCerrado(visible ? `sello:${sello.tipo}:${sello.hasta}` : null);
  if (sello.tipo === "SIN_FECHA" || sello.tipo === "VIGENTE" || cerrado) return null;
  const subir = <Link href="/configuracion/facturacion#sello" className={enlace}>Subir sello nuevo</Link>;
  if (sello.tipo === "VENCIDO") {
    // Rojo: aquí sí hay algo impedido — el negocio no puede facturar (nucleo.md, regla del rojo).
    return (
      <Aviso tono="danger" role="alert" className={className} onCerrar={cerrar}>
        Tu sello digital venció el {fechaLegible(sello.hasta)} y tu negocio no puede facturar. Tramita uno nuevo en
        el SAT y súbelo aquí. {subir}
      </Aviso>
    );
  }
  if (sello.tipo === "URGENTE") {
    return (
      <Aviso tono="warning" role="alert" className={className} onCerrar={cerrar}>
        <b>Tu sello digital vence el {fechaLegible(sello.hasta)} ({faltanDias(sello.dias)}).</b> Cuando venza, tu
        negocio deja de facturar. Renuévalo en el SAT hoy y súbelo aquí. {subir}
      </Aviso>
    );
  }
  return (
    <Aviso tono="warning" role="status" className={className} onCerrar={cerrar}>
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
  const { cerrado, cerrar } = useAvisoCerrado(texto ? `global:${texto}` : null);
  if (!texto || cerrado) return null;
  return (
    <Aviso tono="info" role="status" className={className} onCerrar={cerrar}>
      {texto} <Link href={href} className={enlace}>Emitir</Link>
    </Aviso>
  );
}

/** Lo de facturación que sí va en el dashboard: solo el sello. La global vive en Facturación. */
export function AvisosFacturacion({ className }: { className?: string }) {
  const { sello } = useAvisosFacturacion();
  return <AvisoSello sello={sello} className={className} />;
}
