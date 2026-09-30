"use client";
import { StatusChip, type TonoEstado } from "@vim/ui/styles";
import Link from "next/link";
import { useEffect, useState } from "react";
import type { Api, AvisoPanel } from "../lib/tipos";
import { fechaHoraMx, label } from "../lib/formato";

// El nivel se enseñaba en crudo ("WARNING", "DANGER"): mismos nombres que la página de avisos.
const NIVEL: Record<string, { tono: TonoEstado; nombre: string }> = {
  info: { tono: "info", nombre: "Informativo" },
  warning: { tono: "warning", nombre: "Atención" },
  danger: { tono: "danger", nombre: "Importante" },
};

/**
 * Avisos que le aplican a este cliente, dentro de su ficha (ADR 0014, entrega 3).
 *
 * Está aquí y no solo en /avisos porque la pregunta "¿qué le hemos dicho a este negocio?" surge
 * cuando estás mirando su ficha, no cuando abres la lista general. Escribir uno nuevo lleva a la
 * pantalla de avisos con el destinatario ya puesto: el formulario vive en un solo sitio.
 */
export function AvisosCliente({ api, tenantId, nombre }: { api: Api; tenantId: string; nombre: string }) {
  const [avisos, setAvisos] = useState<AvisoPanel[] | null>(null);

  useEffect(() => {
    let vivo = true;
    api("/api/avisos")
      .then((r) => {
        if (!vivo) return;
        const todos = (r.avisos ?? []) as AvisoPanel[];
        setAvisos(todos.filter((a) => !a.borrado && (a.tenantId === tenantId || a.tenantId === null)));
      })
      .catch(() => { if (vivo) setAvisos([]); });
    return () => { vivo = false; };
  }, [api, tenantId]);

  return (
    <div className="mt-5 border-t border-line pt-5">
      <div className="mb-2 flex items-center justify-between">
        <label className={`${label} mb-0`}>Avisos de VIM a sus cajas</label>
        <Link
          href={`/avisos?cliente=${tenantId}`}
          className="btn h-8 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 hover:border-ink hover:text-ink"
        >
          Escribirle un aviso
        </Link>
      </div>

      {avisos === null && <p className="text-13 text-ink-3">Cargando…</p>}
      {avisos && avisos.length === 0 && (
        <p className="text-13 text-ink-3">No le estamos mostrando ningún aviso a {nombre}.</p>
      )}
      <div className="flex flex-col gap-1.5">
        {(avisos ?? []).map((a) => (
          <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded border border-line px-3 py-2">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusChip tone={NIVEL[a.nivel]?.tono ?? "neutral"}>{NIVEL[a.nivel]?.nombre ?? a.nivel}</StatusChip>
                <span className="text-13 font-semibold">{a.titulo}</span>
                {a.tenantId === null && <span className="text-11 text-ink-3">(a todos los clientes)</span>}
              </div>
              <div className="mt-0.5 text-12 text-ink-3">
                {a.vigenteHasta ? `hasta el ${fechaHoraMx(a.vigenteHasta, "corto")}` : "sin fecha de fin"}
              </div>
            </div>
            <span className="flex-shrink-0 text-12 tabular-nums text-ink-2">
              visto por {a.vistos} de {a.cajasAlcance}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
