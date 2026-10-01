"use client";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Prospectos } from "../components/prospectos";
import { ESTADOS_PROSPECTO, type EstadoProspecto } from "../lib/prospectos";
import { useSesion } from "../lib/sesion";

function Contenido() {
  const { api } = useSesion();
  // `?estado=NUEVO` es a donde lleva la alerta de Atención.
  const pedido = useSearchParams().get("estado");
  const estado = (ESTADOS_PROSPECTO as readonly string[]).includes(pedido ?? "") ? (pedido as EstadoProspecto) : null;
  return <Prospectos api={api} estadoInicial={estado} />;
}

export default function ProspectosPage() {
  // useSearchParams exige un límite de Suspense para que la página se pueda prerenderizar.
  return (
    <Suspense fallback={<p className="text-13 text-ink-2">Cargando…</p>}>
      <Contenido />
    </Suspense>
  );
}
