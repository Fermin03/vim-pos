"use client";
import { useEffect, useState } from "react";
import { Aviso, StatusChip, type TonoEstado } from "@vim/ui/styles";
import { fechaLegible, hoyMx } from "@vim/fecha";
import { ETIQUETA_METODO_COBRO, estadoCobro, textoEstadoCobro, type EstadoCobro } from "@vim/db/cobro";
import { PageHeader, PageBody } from "../../../components/page-header";
import { leerPlanYPagos, type PlanYPagos } from "../../../lib/plan";
import { mensajeError } from "../../../lib/errores";

const TONO: Record<EstadoCobro["tipo"], TonoEstado> = {
  SIN_COBRO: "neutral", AL_CORRIENTE: "success", POR_VENCER: "warning", HOY: "warning", VENCIDO: "danger",
};

const mxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });

/**
 * Plan y pagos (0130): qué plan tiene el negocio, cuándo le toca pagar a VIM y qué pagos se le han
 * registrado. Antes el dueño no veía nada de esto: se enteraba de que debía cuando le llamaban.
 * Solo lectura; los pagos los registra VIM al recibirlos.
 */
export default function PlanPage() {
  const [d, setD] = useState<PlanYPagos | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leerPlanYPagos().then(setD).catch((e) => setError(mensajeError(e, "No se pudo cargar tu plan")));
  }, []);

  const s = d?.suscripcion ?? null;
  const estado = estadoCobro(s?.estado === "ACTIVA" ? s.proxima_fecha_cobro : null, hoyMx());
  const anual = s?.ciclo_facturacion === "ANUAL";

  return (
    <>
      <PageHeader titulo="Plan y pagos" subtitulo="Tu plan de VIM POS, cuándo toca pagar y tus pagos." migas={[{ label: "Configuración" }, { label: "Plan y pagos" }]} />
      <PageBody>
        {error && <Aviso tono="danger" role="alert" className="max-w-[640px]">{error}</Aviso>}
        {!d && !error && <p className="text-13 text-ink-3">Cargando…</p>}
        {d && (
          <div className="flex max-w-[640px] flex-col gap-4">
            <section className="rounded-lg border border-line bg-surface p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-12 font-semibold uppercase tracking-wide text-ink-3">Tu plan</p>
                  <p className="mt-1 font-display text-20 font-semibold tracking-tight">{d.plan?.nombre ?? "Sin plan asignado"}</p>
                  {s && (
                    <p className="mt-0.5 text-14 text-ink-2 tabular-nums">
                      {anual ? `${mxn(Number(s.precio_mensual_mxn) * 12)} al año` : `${mxn(Number(s.precio_mensual_mxn))} al mes`}
                    </p>
                  )}
                </div>
                {s?.estado === "ACTIVA" && <StatusChip tone={TONO[estado.tipo]} punto>{textoEstadoCobro(estado)}</StatusChip>}
                {s?.estado === "PAUSADA" && <StatusChip tone="neutral">Cobro en pausa</StatusChip>}
              </div>

              {s?.estado === "ACTIVA" && s.proxima_fecha_cobro && (
                <p className="mt-4 text-14 text-ink-2">
                  Siguiente pago: <b className="text-ink">{fechaLegible(s.proxima_fecha_cobro)}</b>
                </p>
              )}
              {!s && (
                <p className="mt-4 text-14 text-ink-2">
                  Todavía no tienes un cobro activo. Si estás en periodo de prueba, VIM te contactará antes de que termine.
                </p>
              )}
              {estado.tipo === "VENCIDO" && (
                <Aviso tono="danger" className="mt-4">
                  Tu pago está vencido. Si ya lo hiciste, mándale el comprobante a VIM para que lo registre; si no, comunícate con VIM para ponerte al corriente.
                </Aviso>
              )}
              {(estado.tipo === "POR_VENCER" || estado.tipo === "HOY") && (
                <Aviso tono="warning" className="mt-4">
                  Tu pago se acerca. Cuando pagues, VIM lo registra y aquí verás la fecha del siguiente.
                </Aviso>
              )}
            </section>

            <section className="rounded-lg border border-line bg-surface">
              <h2 className="border-b border-line px-5 py-3 font-display text-16 font-semibold tracking-tight">Pagos registrados</h2>
              {d.pagos.length === 0 ? (
                <p className="px-5 py-4 text-13 text-ink-3">Aún no hay pagos registrados.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {d.pagos.map((p) => (
                    <li key={p.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
                      <div>
                        <p className={p.anulado_at ? "text-14 text-ink-3 line-through" : "text-14 font-medium"}>
                          Del {fechaLegible(p.cubre_desde)} al {fechaLegible(p.cubre_hasta)}
                        </p>
                        <p className="text-12 text-ink-3">
                          {ETIQUETA_METODO_COBRO[p.metodo] ?? p.metodo} · pagado el {fechaLegible(p.pagado_el)}
                          {p.referencia ? ` · ${p.referencia}` : ""}
                          {p.anulado_at ? " · anulado" : ""}
                        </p>
                      </div>
                      <span className={p.anulado_at ? "text-14 tabular-nums text-ink-3 line-through" : "font-display text-15 font-semibold tabular-nums"}>
                        {mxn(Number(p.monto_mxn))}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </PageBody>
    </>
  );
}
