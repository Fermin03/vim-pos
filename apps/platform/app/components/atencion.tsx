"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Alerta, Api, CajaAhora, Severidad } from "../lib/tipos";
import { textoActualizado, useRefresco } from "../lib/refresco";
import { haceMinutos } from "../lib/fechas-panel";
import { LATIDO_EN_LINEA_MIN } from "../lib/senal-caja";

// Rojo para lo crítico, ámbar para lo que conviene revisar, gris para lo informativo. El azul de
// la marca es para acciones: antes pintaba la severidad "alta", que no es una acción.
const SEV: Record<Severidad, { punto: string; caja: string; texto: string; nombre: string }> = {
  critica: { punto: "bg-danger", caja: "border-danger/30 bg-danger-soft", texto: "text-danger", nombre: "Crítica" },
  alta: { punto: "bg-warning", caja: "border-warning/30 bg-warning-soft", texto: "text-warning", nombre: "Alta" },
  media: { punto: "bg-ink-3", caja: "border-line-strong bg-surface", texto: "text-ink-2", nombre: "Media" },
};

/** "Ahora": cuántas cajas están vivas y cuáles llevan rato calladas. Responde la pregunta de la noche. */
function Ahora({ cajas }: { cajas: CajaAhora[] }) {
  const conLatido = cajas.filter((c) => c.minutos !== null);
  const enLinea = conLatido.filter((c) => (c.minutos as number) < LATIDO_EN_LINEA_MIN);
  const calladas = conLatido.filter((c) => (c.minutos as number) >= LATIDO_EN_LINEA_MIN);
  const sinLatido = cajas.length - conLatido.length;

  return (
    <section aria-labelledby="ahora-titulo" className="mb-6 rounded-lg border border-line bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="ahora-titulo" className="font-display text-[16px] font-semibold tracking-tight">Ahora</h2>
        <p className="text-[13px] text-ink-2">
          <b className="text-success">{enLinea.length} en línea</b>
          {calladas.length > 0 && <> · <b className="text-ink">{calladas.length} sin señal</b></>}
          {sinLatido > 0 && <> · {sinLatido} sin reportar (versión anterior a 0.4.60)</>}
        </p>
      </div>
      {calladas.length > 0 ? (
        <ul className="mt-3 divide-y divide-line border-t border-line">
          {calladas.map((c) => (
            <li key={c.id}>
              <Link href={`/clientes/${c.tenantId}`} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[13.5px] hover:bg-hover">
                <span>
                  <b>{c.tenant}</b> <span className="text-ink-2">· {c.nombre}{c.version ? ` · ${c.version}` : ""}</span>
                </span>
                <span className="tabular-nums text-ink-2">sin señal {haceMinutos(c.minutos)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        conLatido.length > 0 && <p className="mt-2 text-[13px] text-ink-2">Todas las cajas que reportan están encendidas ahora.</p>
      )}
      {calladas.length > 0 && (
        <p className="mt-2 text-[12.5px] text-ink-2">
          Una caja sin señal puede ser el local cerrado. Si es horario de servicio, llama.
        </p>
      )}
    </section>
  );
}

/**
 * Bandeja de pendientes, con la franja "Ahora" arriba: primero si las cajas están vivas en este
 * momento (por su latido, cada 10 minutos), después lo que hay que hacer hoy.
 *
 * Antes solo se medía en días y por sincronización, y el vacío decía "Ninguna caja caída" sin
 * haber mirado el latido de ninguna. Ahora el vacío dice qué se revisó.
 */
export function Atencion({ api }: { api: Api }) {
  const [alertas, setAlertas] = useState<Alerta[] | null>(null);
  const [ahora, setAhora] = useState<CajaAhora[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Severidad | "todas">("todas");

  const cargar = useCallback(async () => {
    try {
      const r = await api("/api/alertas");
      setAlertas((r.alertas ?? []) as Alerta[]);
      setAhora((r.ahora ?? []) as CajaAhora[]);
      setError(null);
    } catch (e) {
      // Un refresco fallido conserva la lista anterior: antes la borraba y se veía solo el error.
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  const { hace } = useRefresco(cargar);

  // Las críticas en el título de la pestaña: el panel suele estar abierto de fondo.
  const criticas = (alertas ?? []).filter((a) => a.severidad === "critica").length;
  useEffect(() => {
    const base = "VIM POS · Plataforma";
    document.title = criticas > 0 ? `(${criticas}) ${base}` : base;
    return () => { document.title = base; };
  }, [criticas]);

  if (error && !alertas) return <p className="text-[13px] text-danger" role="alert">{error}</p>;
  if (!alertas) return <p className="text-[13px] text-ink-2">Revisando…</p>;

  const cuenta = (s: Severidad) => alertas.filter((a) => a.severidad === s).length;
  const lista = filtro === "todas" ? alertas : alertas.filter((a) => a.severidad === filtro);

  return (
    <div>
      <h1 className="mb-4 font-display text-[20px] font-bold tracking-tight">Atención</h1>
      {error && (
        <p className="mb-3 rounded border border-warning/30 bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning" role="alert">
          No se pudo actualizar ({error}). Lo de abajo es de la última lectura.
        </p>
      )}

      <Ahora cajas={ahora} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-[16px] font-semibold tracking-tight">Pendientes</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por gravedad">
          {(
            [
              ["todas", `Todas (${alertas.length})`],
              ["critica", `Críticas (${cuenta("critica")})`],
              ["alta", `Altas (${cuenta("alta")})`],
              ["media", `Medias (${cuenta("media")})`],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              type="button"
              aria-pressed={filtro === k}
              onClick={() => setFiltro(k as Severidad | "todas")}
              className={["btn rounded px-2.5 py-1.5 text-[13px] font-semibold", filtro === k ? "bg-ink text-white" : "text-ink-2 hover:bg-hover"].join(" ")}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {alertas.length === 0 ? (
        <div className="rounded-lg border border-line bg-surface p-8 text-center">
          <div className="font-display text-[17px] font-semibold">Nada pendiente</div>
          <p className="mt-1 text-[13.5px] text-ink-2">
            Revisé cajas bloqueadas, sincronización, ventas, pruebas por vencer, cobros, folios y altas estancadas.
          </p>
        </div>
      ) : lista.length === 0 ? (
        <p className="text-[13.5px] text-ink-2">Nada en este nivel.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {lista.map((a) => (
            <div key={a.id} className={["flex items-start gap-3 rounded-lg border p-3.5", SEV[a.severidad].caja].join(" ")}>
              <span className={["mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", SEV[a.severidad].punto].join(" ")} aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="font-display text-[14.5px] font-semibold">{a.titulo}</span>
                  <span className="text-[13px] font-medium text-ink">· {a.tenant}</span>
                </div>
                <p className="mt-0.5 text-[13px] text-ink-2">{a.detalle}</p>
                <span className={["mt-1 inline-block text-[12px] font-semibold uppercase tracking-wide", SEV[a.severidad].texto].join(" ")}>
                  {SEV[a.severidad].nombre} · {a.tipo}
                </span>
              </div>
              {/* Enlace, no botón: se puede abrir en otra pestaña (varios clientes a la vez). */}
              {a.tenantId && (
                <Link
                  href={`/clientes/${a.tenantId}`}
                  className="btn flex-shrink-0 rounded border border-line-strong bg-surface px-3 py-1.5 text-[13px] font-semibold text-ink-2 hover:border-ink hover:text-ink"
                >
                  Abrir
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
      <p className="mt-4 text-[12.5px] text-ink-2">{textoActualizado(hace)}</p>
    </div>
  );
}
