"use client";
/**
 * La plantilla de los reportes: filtro → 2-4 cifras que contestan la pregunta → tabla → notas.
 *
 * Antes cada reporte repetía su propio encabezado, su tabla y su "Cargando…", y divergían en
 * todo: seis diseños de tarjeta de cifra, tres formas de total, migas sin enlace, el rango que
 * volvía a 30 días al cambiar de reporte y ninguna forma de exportar ni de ordenar.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "@vim/ui/styles";
import { hoyMx } from "@vim/fecha";
import { PageBody, PageHeader, TablaScroll } from "./page-header";
import { RangoFechas } from "./rango-fechas";
import { mensajeError } from "../lib/errores";
import { rangoUltimosDias } from "../lib/reportes";
import { descargarXlsx } from "../lib/excel";
import {
  filaTotales,
  formatear,
  hojaDeReporte,
  nombreArchivo,
  ordenar,
  tieneTotales,
  type CifraExportable,
  type Columna,
  type Orden,
} from "../lib/reporte-tabla";

export type Rango = { desde: string; hasta: string };

// ── El rango viaja: en la URL (se puede compartir) y entre reportes (sessionStorage) ─────────
const CLAVE_RANGO = "vim.reportes.rango";
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

function rangoValido(desde: unknown, hasta: unknown): Rango | null {
  if (typeof desde !== "string" || typeof hasta !== "string") return null;
  if (!FECHA.test(desde) || !FECHA.test(hasta) || desde > hasta) return null;
  const tope = hoyMx();
  return { desde: desde > tope ? tope : desde, hasta: hasta > tope ? tope : hasta };
}

function recordarRango(r: Rango) {
  const u = new URL(window.location.href);
  u.searchParams.set("desde", r.desde);
  u.searchParams.set("hasta", r.hasta);
  window.history.replaceState(window.history.state, "", u);
  try {
    sessionStorage.setItem(CLAVE_RANGO, JSON.stringify(r));
  } catch {
    /* navegador sin almacenamiento: el rango vive solo en la URL */
  }
}

/**
 * El rango del reporte: primero el de la URL, luego el último que se usó en otro reporte y, si
 * no hay ninguno, los últimos 30 días. `null` hasta montar (en el servidor no hay URL).
 */
export function useRangoReporte(diasPorDefecto = 30) {
  const [rango, setRango] = useState<Rango | null>(null);
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    let r = rangoValido(p.get("desde"), p.get("hasta"));
    if (!r) {
      try {
        const guardado = JSON.parse(sessionStorage.getItem(CLAVE_RANGO) ?? "null") as Partial<Rango> | null;
        r = rangoValido(guardado?.desde, guardado?.hasta);
      } catch {
        r = null;
      }
    }
    r ??= rangoUltimosDias(diasPorDefecto);
    setRango(r);
    recordarRango(r);
  }, [diasPorDefecto]);
  const cambiar = useCallback((desde: string, hasta: string) => {
    const r = { desde, hasta };
    setRango(r);
    recordarRango(r);
  }, []);
  return { rango, cambiar };
}

export type Consulta<D> = { datos: D | null; error: string | null; cargando: boolean; reintentar: () => void };

/**
 * Lee el reporte cada vez que cambia el rango (o `extra`). Al recargar NO borra lo que se ve:
 * antes cada filtro vaciaba la tabla y la pantalla brincaba. Una respuesta vieja que llega tarde
 * se descarta.
 */
export function useConsulta<D>(leer: (r: Rango) => Promise<D>, rango: Rango | null, extra = ""): Consulta<D> {
  const [datos, setDatos] = useState<D | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const leerRef = useRef(leer);
  leerRef.current = leer;
  const turno = useRef(0);

  const cargar = useCallback(async () => {
    if (!rango) return;
    const id = ++turno.current;
    setCargando(true);
    setError(null);
    try {
      const d = await leerRef.current(rango);
      if (id === turno.current) setDatos(d);
    } catch (e) {
      if (id === turno.current) setError(mensajeError(e, "No se pudo cargar el reporte"));
    } finally {
      if (id === turno.current) setCargando(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rango?.desde, rango?.hasta, extra]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { datos, error, cargando, reintentar: () => void cargar() };
}

// ── Cifras ───────────────────────────────────────────────────────────────────────────────────
/** "atencion" (ámbar) para lo que conviene revisar; "mal" (rojo) se reserva para dinero perdido. */
export type Tono = "neutro" | "bien" | "atencion" | "mal";
export type Cifra = CifraExportable & { pie?: string; tono?: Tono };

const COLOR_TONO: Record<Tono, string> = { neutro: "", bien: "text-success", atencion: "text-warning", mal: "text-danger" };

export function Cifras({ cifras }: { cifras: Cifra[] }) {
  if (cifras.length === 0) return null;
  const cols = cifras.length === 3 ? "lg:grid-cols-3" : cifras.length === 2 ? "lg:grid-cols-2" : "lg:grid-cols-4";
  return (
    <div className={`mb-5 grid grid-cols-2 gap-3 ${cols}`}>
      {cifras.map((c) => (
        <div key={c.etiqueta} className="rounded-lg border border-line bg-surface p-4">
          <div className="text-[12.5px] font-semibold text-ink-2">{c.etiqueta}</div>
          <div className={`mt-1 font-display text-[20px] font-bold leading-tight tabular-nums lg:text-[24px] ${COLOR_TONO[c.tono ?? "neutro"]}`}>
            {typeof c.valor === "number" ? formatear(c.valor, c.tipo ?? "entero") : (c.valor ?? "—")}
          </div>
          {c.pie && <div className="mt-0.5 text-[12.5px] text-ink-2">{c.pie}</div>}
        </div>
      ))}
    </div>
  );
}

// ── Tabla ────────────────────────────────────────────────────────────────────────────────────
const NUMERICOS = new Set(["mxn", "entero", "pct", "decimal"]);
const esNumerica = <T,>(c: Columna<T>) => NUMERICOS.has(c.tipo ?? "texto");

function Flecha({ dir }: { dir: "asc" | "desc" | null }) {
  // Siempre ocupa su lugar: que aparezca no mueve el encabezado.
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`h-3.5 w-3.5 flex-shrink-0 ${dir ? "" : "opacity-0"}`}>
      {dir === "asc" ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M19 12l-7 7-7-7" />}
    </svg>
  );
}

export type DefTabla<T> = {
  columnas: Columna<T>[];
  filas: T[];
  clave: (f: T) => string;
  orden?: Orden;
  vacio: ReactNode;
  /** Ancho mínimo en móvil antes de desplazarse de lado. */
  minimo?: number;
};

export function Tabla<T>({ columnas, filas, clave, orden: ordenInicial, vacio, minimo }: DefTabla<T>) {
  const [orden, setOrden] = useState<Orden | null>(ordenInicial ?? null);
  const visibles = ordenar(filas, columnas, orden);
  const totales = tieneTotales(columnas) && filas.length > 0 ? filaTotales(columnas, filas) : null;

  function alternar(c: Columna<T>) {
    setOrden((o) =>
      o?.id === c.id ? { id: c.id, dir: o.dir === "asc" ? "desc" : "asc" } : { id: c.id, dir: esNumerica(c) ? "desc" : "asc" },
    );
  }

  return (
    <TablaScroll min={minimo ?? Math.max(520, columnas.length * 118)}>
      <div className="overflow-hidden rounded-lg border border-line bg-surface">
        <table className="w-full text-[13.5px]">
          <thead>
            <tr className="border-b border-line bg-sel text-left">
              {columnas.map((c) => {
                const dir = orden?.id === c.id ? orden.dir : null;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none"}
                    className={`px-4 ${esNumerica(c) ? "text-right" : ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => alternar(c)}
                      className={`inline-flex min-h-[40px] items-center gap-1 text-[12px] font-semibold uppercase tracking-wide transition-colors hover:text-ink ${dir ? "text-ink" : "text-ink-2"} ${esNumerica(c) ? "flex-row-reverse" : ""}`}
                    >
                      {c.titulo}
                      <Flecha dir={dir} />
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={columnas.length} className="px-4 py-8 text-center text-[13.5px] text-ink-2">
                  {vacio}
                </td>
              </tr>
            )}
            {visibles.map((f) => (
              <tr key={clave(f)} className="border-b border-line last:border-b-0">
                {columnas.map((c, i) => (
                  <td
                    key={c.id}
                    className={[
                      "px-4 py-2.5",
                      esNumerica(c) ? "text-right tabular-nums" : "",
                      c.enfasis === "fuerte" ? "font-semibold" : c.enfasis === "suave" ? "text-ink-2" : i === 0 ? "font-medium" : "",
                    ].join(" ")}
                  >
                    {c.celda ? c.celda(f) : formatear(c.valor(f), c.tipo)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
          {totales && (
            <tfoot>
              <tr className="border-t-2 border-line-strong bg-sel font-bold">
                {columnas.map((c, i) => (
                  <td key={c.id} className={`px-4 py-2.5 ${esNumerica(c) ? "text-right tabular-nums" : ""}`}>
                    {totales[i] === null ? "" : c.total ? formatear(totales[i]!, c.tipo) : String(totales[i])}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </TablaScroll>
  );
}

// ── Marco ────────────────────────────────────────────────────────────────────────────────────
export function ReporteMarco<D, T>({
  titulo,
  subtitulo,
  rango,
  filtros,
  consulta,
  cifras,
  antes,
  tabla,
  children,
}: {
  titulo: string;
  subtitulo: string;
  /** Sin rango (p. ej. eventos, que ya traen sus fechas) se pasa `null`. */
  rango: { valor: Rango | null; cambiar: (desde: string, hasta: string) => void } | null;
  filtros?: ReactNode;
  consulta: Consulta<D>;
  cifras?: Cifra[];
  antes?: ReactNode;
  tabla?: DefTabla<T>;
  children?: ReactNode;
}) {
  const { datos, error, cargando, reintentar } = consulta;
  const puedeExportar = !!tabla && datos !== null && tabla.filas.length > 0;

  function exportar() {
    if (!tabla) return;
    const r = rango?.valor ?? null;
    descargarXlsx(hojaDeReporte({ titulo, rango: r, cifras, columnas: tabla.columnas, filas: tabla.filas }), nombreArchivo(titulo, r));
  }

  return (
    <>
      <PageHeader
        titulo={titulo}
        subtitulo={subtitulo}
        migas={[{ label: "Reportes", href: "/reportes" }, { label: titulo }]}
        right={
          tabla ? (
            <Button variant="ghost" onClick={exportar} disabled={!puedeExportar}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4" aria-hidden="true">
                <path d="M12 3v12M7 10l5 5 5-5M5 21h14" />
              </svg>
              Descargar Excel
            </Button>
          ) : undefined
        }
      />
      <PageBody>
        {(rango?.valor || filtros) && (
          <div className="mb-5 flex flex-wrap items-start gap-3">
            {rango?.valor && <RangoFechas desde={rango.valor.desde} hasta={rango.valor.hasta} onCambio={rango.cambiar} />}
            {filtros}
          </div>
        )}

        {error && (
          <div role="alert" className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
            <p className="flex-1 text-[14px] font-medium text-danger">{error}</p>
            <Button variant="ghost" onClick={reintentar} disabled={cargando}>
              {cargando ? "Reintentando…" : "Reintentar"}
            </Button>
          </div>
        )}

        {datos === null && !error && <p className="text-[14px] text-ink-2">Cargando…</p>}

        {datos !== null && (
          <div aria-busy={cargando} className={`transition-opacity duration-150 ${cargando ? "opacity-60" : ""}`}>
            {cifras && <Cifras cifras={cifras} />}
            {antes}
            {tabla && <Tabla {...tabla} />}
            {children}
          </div>
        )}
      </PageBody>
    </>
  );
}

/** Participación con barra. En tinta, no en el azul de la marca: el azul es para acciones. */
export function Barra({ pct }: { pct: number }) {
  return (
    <span className="flex items-center justify-end gap-2">
      <span className="h-1.5 w-20 overflow-hidden rounded-full bg-hover" aria-hidden="true">
        <span className="block h-full origin-left rounded-full bg-ink" style={{ transform: `scaleX(${Math.min(100, Math.max(0, pct)) / 100})` }} />
      </span>
      <span className="w-14 text-right tabular-nums">{formatear(pct, "pct")}</span>
    </span>
  );
}

/** Nota al pie de un reporte. */
export function Nota({ children }: { children: ReactNode }) {
  return <p className="mt-3 max-w-2xl text-[13px] leading-relaxed text-ink-2">{children}</p>;
}
