"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@vim/ui/styles";
import { cantidad, type Mecanica } from "@vim/db/lealtad";
import { PageBody, PageHeader, TablaScroll } from "../../../components/page-header";
import { LealtadPestanas } from "../../../components/lealtad-pestanas";
import { listarSucursalesOpciones, type SucursalOpcion } from "../../../lib/inventario";
import { leerProgramaAdmin, mensajeLealtad } from "../../../lib/lealtad";
import {
  MOVS_POR_PAGINA, TIPOS, errorDeRango, etiquetaTipo, hoyMexico, leerControl, leerResumen, listarMovimientos, rangoPorDefecto,
  type ControlLealtad, type MovimientoLibro, type ResumenLealtad, type TipoMov,
} from "../../../lib/lealtad-libro";

const control = "h-10 rounded border border-line-strong bg-surface px-3 text-13 outline-none focus:border-ink";
const etiqueta = "mb-1 block text-12 font-medium text-ink-2";
const paso = "h-9 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition hover:border-ink hover:text-ink disabled:opacity-40";
const fmtMxn = (n: number) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleString("es-MX", { timeZone: "America/Mexico_City", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

type Filtros = { desde: string; hasta: string; sucursalId: string | null; tipo: TipoMov | "TODOS"; busqueda: string };
/** Lo que se ve en la tabla: las filas y la página a la que pertenecen (no la que se pidió después). */
type Libro = { filas: MovimientoLibro[]; total: number; pagina: number };

export default function MovimientosLealtadPage() {
  const inicial = rangoPorDefecto();
  /** Lo que se está escribiendo en los controles. */
  const [borrador, setBorrador] = useState<Filtros>({ ...inicial, sucursalId: null, tipo: "TODOS", busqueda: "" });
  /** Lo que de verdad se consultó (cambia solo al tocar Aplicar). */
  const [filtros, setFiltros] = useState<Filtros>({ ...inicial, sucursalId: null, tipo: "TODOS", busqueda: "" });
  const [pagina, setPagina] = useState(1);
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [mecanica, setMecanica] = useState<Mecanica>("PUNTOS_DINERO");
  const [resumen, setResumen] = useState<ResumenLealtad | null>(null);
  const [vigilancia, setVigilancia] = useState<ControlLealtad | null>(null);
  const [libro, setLibro] = useState<Libro | null>(null);
  const [cargandoLibro, setCargandoLibro] = useState(true);
  const [cargandoCifras, setCargandoCifras] = useState(true);
  // Un error por consulta: que una salga bien no borra el aviso de la otra. Si una recarga falla
  // se queda lo que ya se mostraba (nunca un «Sin movimientos» falso) y se dice que es lo anterior.
  const [errorCifras, setErrorCifras] = useState<string | null>(null);
  const [errorLibro, setErrorLibro] = useState<string | null>(null);
  // Solo la respuesta de la última consulta pinta: una vieja que tarda más no pisa a la nueva.
  const consultaCifras = useRef(0);
  const consultaLibro = useRef(0);
  /** El libro que se ve ahora, para que el catch de una página que falla lea su página sin depender de él. */
  const libroVisto = useRef<Libro | null>(null);
  libroVisto.current = libro;

  useEffect(() => {
    listarSucursalesOpciones().then(setSucursales).catch(() => setSucursales([]));
    leerProgramaAdmin().then((p) => { if (p) setMecanica(p.mecanica); }).catch(() => {});
  }, []);

  // Cifras y control: dependen del rango y la sucursal, no de la página ni del tipo.
  useEffect(() => {
    const n = ++consultaCifras.current;
    setCargandoCifras(true);
    Promise.all([leerResumen(filtros.desde, filtros.hasta, filtros.sucursalId), leerControl(filtros.desde, filtros.hasta)])
      .then(([r, c]) => { if (n === consultaCifras.current) { setResumen(r); setVigilancia(c); setErrorCifras(null); } })
      .catch((e) => { if (n === consultaCifras.current) setErrorCifras(mensajeLealtad(e, "No se pudieron leer las cifras")); })
      .finally(() => { if (n === consultaCifras.current) setCargandoCifras(false); });
  }, [filtros.desde, filtros.hasta, filtros.sucursalId]);

  useEffect(() => {
    const n = ++consultaLibro.current;
    setCargandoLibro(true);
    listarMovimientos({ ...filtros, pagina })
      .then((r) => { if (n === consultaLibro.current) { setLibro({ ...r, pagina }); setErrorLibro(null); } })
      .catch((e) => {
        if (n !== consultaLibro.current) return;
        setErrorLibro(mensajeLealtad(e, "No se pudieron leer los movimientos"));
        // Que el botón y el contador sigan en la página de las filas que se ven. El efecto depende de
        // `pagina`, así que el cambio lo reejecuta una vez, pero la consulta que lanza es la de esa
        // página ya leída y sale bien o termina en este mismo catch con `pagina` igual: no hay bucle.
        setPagina((p) => (libroVisto.current && libroVisto.current.pagina !== p ? libroVisto.current.pagina : p));
      })
      .finally(() => { if (n === consultaLibro.current) setCargandoLibro(false); });
  }, [filtros, pagina]);

  const hoy = hoyMexico();
  const errorRango = errorDeRango(borrador.desde, borrador.hasta, hoy);
  const aplicar = () => { if (!errorRango) { setPagina(1); setFiltros(borrador); } };
  const paginas = libro ? Math.max(1, Math.ceil(libro.total / MOVS_POR_PAGINA)) : 1;
  const puntos = (n: number) => cantidad(mecanica, n);

  return (
    <>
      <PageHeader titulo="Lealtad" subtitulo="Cuánto has repartido, cuánto se ha canjeado y quién lo hizo." />
      <PageBody>
        <LealtadPestanas />

        <div className="mb-5 flex flex-wrap items-end gap-3">
          <div>
            <label className={etiqueta} htmlFor="mov-desde">Desde</label>
            <input id="mov-desde" type="date" className={control} max={hoy} value={borrador.desde} onChange={(e) => setBorrador({ ...borrador, desde: e.target.value })} />
          </div>
          <div>
            <label className={etiqueta} htmlFor="mov-hasta">Hasta</label>
            <input id="mov-hasta" type="date" className={control} max={hoy} value={borrador.hasta} onChange={(e) => setBorrador({ ...borrador, hasta: e.target.value })} />
          </div>
          {sucursales.length > 1 && (
            <div>
              <label className={etiqueta} htmlFor="mov-suc">Sucursal</label>
              <select id="mov-suc" className={control} value={borrador.sucursalId ?? ""} onChange={(e) => setBorrador({ ...borrador, sucursalId: e.target.value || null })}>
                <option value="">Todas</option>
                {sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={etiqueta} htmlFor="mov-tipo">Movimiento</label>
            <select id="mov-tipo" className={control} value={borrador.tipo} onChange={(e) => setBorrador({ ...borrador, tipo: e.target.value as TipoMov | "TODOS" })}>
              <option value="TODOS">Todos</option>
              {TIPOS.map((t) => <option key={t} value={t}>{etiquetaTipo(t)}</option>)}
            </select>
          </div>
          <div className="min-w-[200px] flex-1">
            <label className={etiqueta} htmlFor="mov-buscar">Cliente</label>
            <input id="mov-buscar" className={`${control} w-full`} placeholder="Nombre o teléfono" value={borrador.busqueda}
              onChange={(e) => setBorrador({ ...borrador, busqueda: e.target.value })} onKeyDown={(e) => { if (e.key === "Enter") aplicar(); }} />
          </div>
          <Button onClick={aplicar} disabled={errorRango !== null}>Aplicar</Button>
        </div>
        {errorRango && <p className="mb-4 text-13 font-medium text-danger" role="alert">{errorRango}</p>}
        {errorCifras && (
          <p className="mb-4 text-13 font-medium text-danger" role="alert">
            {errorCifras}{resumen ? " Las cifras de abajo son de la consulta anterior." : ""}
          </p>
        )}

        <dl className={`mb-6 grid grid-cols-2 gap-3 transition-opacity lg:grid-cols-4${cargandoCifras ? " opacity-60" : ""}`} aria-busy={cargandoCifras}>
          {[
            { t: "Repartido en el periodo", v: resumen ? puntos(resumen.emitido) : "…", pie: "Lo que ganaron tus clientes" },
            { t: "Canjeado en el periodo", v: resumen ? puntos(resumen.canjeado) : "…", pie: mecanica === "PUNTOS_DINERO" && resumen ? `${fmtMxn(resumen.canjeado)} en descuentos` : "Lo que ya usaron" },
            { t: "Saldo vivo hoy", v: resumen ? puntos(resumen.saldoVivo) : "…", pie: mecanica === "PUNTOS_DINERO" && resumen ? `Equivale a ${fmtMxn(resumen.saldoVivo)}` : "Lo que todavía pueden usar" },
            { t: "Clientes con saldo", v: resumen ? String(resumen.clientesConSaldo) : "…", pie: "En todo el negocio" },
          ].map((c) => (
            <div key={c.t} className="rounded-lg border border-line bg-surface p-4">
              <dt className="text-12 font-bold uppercase tracking-wide text-ink-3">{c.t}</dt>
              <dd className="mt-1 font-display text-20 font-semibold tabular-nums text-ink">{c.v}</dd>
              <dd className="mt-0.5 text-12 text-ink-3">{c.pie}</dd>
            </div>
          ))}
        </dl>

        <h2 className="mb-2 font-display text-16 font-semibold tracking-tight">Movimientos</h2>
        {errorLibro && (
          <p className="mb-3 text-13 font-medium text-danger" role="alert">
            {errorLibro}{libro ? " Lo que ves es la última lista que se pudo leer." : ""}
          </p>
        )}
        {libro === null ? (
          cargandoLibro ? <p className="text-sm text-ink-3">Cargando…</p> : null
        ) : libro.filas.length === 0 ? (
          <div className="rounded-lg border border-line bg-surface p-8 text-center text-ink-3">
            <p className="text-15 font-semibold text-ink-2">Sin movimientos</p>
            <p className="mt-1 text-13">No hay nada con esos filtros. Los puntos se ganan en cuentas con un cliente asignado.</p>
          </div>
        ) : (
          <>
            <div className={cargandoLibro ? "opacity-60 transition-opacity" : "transition-opacity"} aria-busy={cargandoLibro}>
              <TablaScroll>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-bg text-left text-12 font-bold uppercase tracking-wide text-ink-3">
                      <th className="px-4 py-2.5">Fecha</th>
                      <th className="px-4 py-2.5">Cliente</th>
                      <th className="px-4 py-2.5">Movimiento</th>
                      <th className="px-4 py-2.5 text-right">Cantidad</th>
                      <th className="px-4 py-2.5 text-right">Saldo</th>
                      <th className="px-4 py-2.5">Sucursal</th>
                      <th className="px-4 py-2.5">Quién</th>
                      <th className="px-4 py-2.5">Cuenta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {libro.filas.map((m) => (
                      <tr key={m.id} className="border-b border-line last:border-b-0">
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-ink-2">{fmtFecha(m.fecha)}</td>
                        <td className="px-4 py-2.5">
                          <div className="font-semibold text-ink">{m.cliente}</div>
                          {m.telefono && <div className="font-mono text-12 text-ink-3">{m.telefono}</div>}
                        </td>
                        <td className="px-4 py-2.5 text-ink-2">
                          {etiquetaTipo(m.tipo)}
                          {m.motivo && <div className="text-12 text-ink-3">{m.motivo}</div>}
                        </td>
                        <td className={`px-4 py-2.5 text-right font-semibold tabular-nums ${m.puntos < 0 ? "text-danger" : "text-ink"}`}>
                          {m.puntos > 0 ? "+" : m.puntos < 0 ? "−" : ""}{Math.abs(m.puntos)}
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums text-ink-2">{m.saldoVisto ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-2">{m.sucursal ?? "—"}</td>
                        <td className="px-4 py-2.5 text-ink-2">{m.usuario ?? "—"}</td>
                        <td className="px-4 py-2.5 font-mono text-12 text-ink-3">{m.folio ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </TablaScroll>
            </div>
            <div className="mt-3 flex items-center justify-between text-13 text-ink-2">
              <span>Página <b>{libro.pagina}</b> de <b>{paginas}</b> · {libro.total} movimiento(s)</span>
              <div className="flex gap-2">
                <button type="button" disabled={pagina <= 1 || cargandoLibro} onClick={() => setPagina((p) => p - 1)} className={paso}>Anterior</button>
                <button type="button" disabled={pagina >= paginas || cargandoLibro} onClick={() => setPagina((p) => p + 1)} className={paso}>Siguiente</button>
              </div>
            </div>
          </>
        )}

        <h2 className="mb-1 mt-8 font-display text-16 font-semibold tracking-tight">Para revisar</h2>
        <p className="mb-3 max-w-[720px] text-13 text-ink-2">
          Dos señales que conviene mirar de vez en cuando. No son acusaciones: un cliente muy fiel o un cajero con un turno pesado también salen aquí.
        </p>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-14 font-semibold text-ink">Clientes que llegan seguido al tope del día</h3>
            {!vigilancia ? <p className="mt-2 text-13 text-ink-3">{errorCifras ? "No disponible." : "Cargando…"}</p> : vigilancia.clientesAlTope.length === 0 ? (
              <p className="mt-2 text-13 text-ink-3">Nadie llegó al tope dos días o más en este periodo.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {vigilancia.clientesAlTope.map((c) => (
                  <li key={c.clienteId} className="flex items-center justify-between border-b border-line py-2 text-13 last:border-b-0">
                    <span className="font-semibold text-ink">{c.nombre}</span>
                    <span className="tabular-nums text-ink-2">{c.diasAlTope} días al tope</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="rounded-lg border border-line bg-surface p-4">
            <h3 className="text-14 font-semibold text-ink">Canjes por cajero</h3>
            {!vigilancia ? <p className="mt-2 text-13 text-ink-3">{errorCifras ? "No disponible." : "Cargando…"}</p> : vigilancia.cajeros.length === 0 ? (
              <p className="mt-2 text-13 text-ink-3">Ningún cajero hizo tres canjes o más en este periodo.</p>
            ) : (
              <ul className="mt-2 flex flex-col">
                {vigilancia.cajeros.map((c) => (
                  <li key={c.usuarioId} className="border-b border-line py-2 text-13 last:border-b-0">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-ink">{c.nombre}</span>
                      <span className="tabular-nums text-ink-2">{c.canjes} canjes · {puntos(c.puntos)}</span>
                    </div>
                    <div className="text-12 text-ink-3">A {c.clientes} cliente(s); {c.delClienteTop} de los {c.canjes} fueron al mismo.</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PageBody>
    </>
  );
}
