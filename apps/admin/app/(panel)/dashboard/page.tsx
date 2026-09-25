"use client";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, PageBody } from "../../components/page-header";
import { usePerfil } from "../../components/admin-shell";
import { leerDashboard, variacionPct, type Dashboard, type ResumenDia } from "../../lib/reportes";
import { type ResumenCaja } from "../../lib/dashboard-calculos";
import { leerEstadoOnboarding, type EstadoOnboarding } from "../../lib/onboarding";
import { listarSucursales } from "../../lib/configuracion";
import { mensajeError } from "../../lib/errores";

// Accesos rápidos del P-177: son de Reportes, no navegación genérica.
const REPORTES_RAPIDOS = [
  // Decía "Estado de resultados · Ventas, IVA, descuentos, comisiones" y abría el consolidado, que
  // no tiene IVA ni comisiones. El nombre dice ahora lo que hay detrás.
  // Con los nombres del índice de reportes. El consolidado salió: a un negocio de una sucursal
  // (casi todos) no le dice nada, y sigue en Reportes para las cadenas.
  { href: "/reportes/ventas-producto", nombre: "Ventas por producto", desc: "Qué se vende más" },
  { href: "/reportes/ventas-categoria", nombre: "Ventas por categoría", desc: "La venta por categoría del menú" },
  { href: "/reportes/ventas-mesero", nombre: "Ventas por mesero", desc: "Tickets, venta y propinas" },
  { href: "/reportes/z-historico", nombre: "Cortes de turno", desc: "Cada cierre de caja y sus diferencias" },
];

/** Cada cuánto se vuelve a leer el panel mirando hoy. */
const REFRESCO_MS = 60_000;
// Al volver a la pestaña no se relee si la última lectura tiene menos de esto.
const VOLVER_MIN_MS = 30_000;

const fmt = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const fmtInt = (n: number) => new Intl.NumberFormat("es-MX").format(n);

function Delta({ pct, comparativo, sobreOscuro }: { pct: number | null; comparativo?: string; sobreOscuro?: boolean }) {
  const claseComparativo = `text-[12.5px] ${sobreOscuro ? "text-white/70" : "text-ink-2"}`;
  if (pct === null) return comparativo ? <span className={claseComparativo}>{comparativo}</span> : null;
  const sube = pct >= 0;
  // Bajar contra ayer no es una alarma (un martes vende menos que un sábado): va en neutro. El
  // rojo se guarda para lo que sí hay que atender, como un faltante de caja.
  const claseChip = sobreOscuro
    ? sube ? "bg-success/25 text-[#7FD1A3]" : "bg-white/15 text-white"
    : sube ? "bg-success-soft text-success" : "bg-hover text-ink-2";
  return (
    <>
      <span className={`inline-flex items-center gap-[3px] rounded-full px-[7px] py-0.5 text-[12.5px] font-bold ${claseChip}`}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-3 w-3">
          {sube ? <path d="M7 17L17 7M17 7H8M17 7v9" /> : <path d="M7 7l10 10M17 17H8M17 17V8" />}
        </svg>
        {Math.abs(pct)}%
      </span>
      {comparativo && <span className={claseComparativo}>{comparativo}</span>}
    </>
  );
}

function Kpi({
  label,
  valor,
  icono,
  pct,
  comparativo,
  primario,
}: {
  label: string;
  valor: string;
  icono: React.ReactNode;
  pct: number | null;
  comparativo?: string;
  primario?: boolean;
}) {
  return (
    <div className={`relative min-w-0 rounded-lg border p-4 lg:p-5 ${primario ? "border-ink bg-ink" : "border-line bg-surface"}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`min-w-0 truncate text-[12px] font-semibold uppercase tracking-[0.04em] lg:text-[12.5px] ${primario ? "text-white/75" : "text-ink-2"}`}>{label}</span>
        <span className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded ${primario ? "bg-white/10 text-white" : "bg-hover text-ink-2"}`}>{icono}</span>
      </div>
      <div className={`mt-3 font-display text-[22px] font-bold tracking-[-0.025em] tabular-nums lg:mt-3.5 lg:text-[30px] ${primario ? "text-white" : ""}`}>{valor}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-[7px] gap-y-1">
        <Delta pct={pct} comparativo={comparativo} sobreOscuro={primario} />
      </div>
    </div>
  );
}

const ICONOS = {
  ventas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>,
  tickets: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1z" /><path d="M8 8h8M8 12h8" /></svg>,
  promedio: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>,
  propinas: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9.5 9.5h4a1.8 1.8 0 0 1 0 3.5h-3a1.8 1.8 0 0 0 0 3.5h4.5" /></svg>,
};

/**
 * Gráfica de ventas por hora del día (P-177). La barra de la hora pico va en negro.
 *
 * El eje es continuo y en el orden del día contable (`serieHoraria`): antes saltaba de las 15 a
 * las 18 como si fueran seguidas y las ventas de la 1 a.m. salían antes del mediodía. Las barras
 * van en gris con contraste suficiente (antes #DDDDD9, 1.4:1) y nunca en el azul de marca: el azul
 * significa "acción", no dato. Cada barra se enfoca con el teclado y dice su valor; en el celular,
 * donde no hay hover, abajo van las tres mejores horas por escrito.
 */
function GraficaPorHora({ datos }: { datos: { hora: number; total: number }[] }) {
  const max = Math.max(1, ...datos.map((d) => d.total));
  const pico = datos.reduce((a, b) => (b.total > a.total ? b : a), datos[0]!);
  const promedio = datos.reduce((a, d) => a + d.total, 0) / datos.length;
  const mejores = [...datos].filter((d) => d.total > 0).sort((a, b) => b.total - a.total).slice(0, 3);
  const rotulo = (h: number) => `${h}:00`;

  return (
    <>
      {/* En móvil la gráfica se desliza en horizontal: 24 barras en 343px serían ilegibles. */}
      <div className="-mx-5 overflow-x-auto px-5 lg:mx-0 lg:overflow-x-visible lg:px-0">
      <ul className="grafica-min flex h-[200px] items-end gap-1.5 pt-6 lg:h-[240px]" aria-label="Ventas por hora">
        {datos.map((d) => {
          const esPico = d.hora === pico.hora;
          return (
            <li
              key={d.hora}
              tabIndex={0}
              aria-label={`${rotulo(d.hora)}: ${fmt(d.total)}${esPico ? ", hora pico" : ""}`}
              className="group flex h-full flex-1 cursor-default flex-col items-center justify-end gap-[7px] rounded outline-none focus-visible:ring-2 focus-visible:ring-ink"
            >
              <div className="relative flex w-full flex-1 items-end justify-center">
                <div
                  className={`w-full max-w-[26px] rounded-t-[3px] transition-colors duration-150 ${esPico ? "bg-ink" : "bg-ink-3 group-hover:bg-ink-2 group-focus-visible:bg-ink-2"}`}
                  style={{ height: `${d.total > 0 ? Math.max(3, (d.total / max) * 100) : 1}%` }}
                />
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-[12px] font-semibold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {rotulo(d.hora)} · {fmt(d.total)}
                </span>
              </div>
              <div className="text-[12px] font-semibold tabular-nums text-ink-2">{d.hora}</div>
            </li>
          );
        })}
      </ul>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
        <div className="flex items-center gap-[7px] text-[13px] text-ink-2">
          <span className="h-[11px] w-[11px] rounded-[3px] bg-ink" aria-hidden="true" />
          Hora pico <span className="font-semibold text-ink">{rotulo(pico.hora)} ({fmt(pico.total)})</span>
        </div>
        <div className="flex items-center gap-[7px] text-[13px] text-ink-2">
          <span className="h-[11px] w-[11px] rounded-[3px] bg-ink-3" aria-hidden="true" />
          Promedio por hora <span className="font-semibold text-ink">{fmt(Math.round(promedio * 100) / 100)}</span>
        </div>
      </div>
      {/* Sin hover en el celular: las mejores horas, por escrito. */}
      {mejores.length > 1 && (
        <ol className="mt-4 flex flex-col gap-1.5 lg:hidden" aria-label="Mejores horas">
          {mejores.map((d, i) => (
            <li key={d.hora} className="flex items-center justify-between text-[14px]">
              <span className="text-ink-2">{i + 1}. {rotulo(d.hora)}</span>
              <span className="font-semibold tabular-nums">{fmt(d.total)}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/**
 * ¿Cuadró la caja? Es lo primero que un dueño quiere saber del día, antes que cuánto vendió, y el
 * panel no lo decía aunque la base ya lo tenía: turnos cerrados, diferencia de efectivo,
 * cancelaciones y descuentos.
 */
function FranjaCaja({ caja, cancelados, descuentos, devoluciones }: {
  caja: ResumenCaja; cancelados: number; descuentos: number; devoluciones: number;
}) {
  const total = caja.cerrados + caja.abiertos;
  let tono: "ok" | "falta" | "sobra" | "neutro";
  let titulo: string;
  let detalle: string;
  if (total === 0) {
    tono = "neutro";
    titulo = "Sin turnos este día";
    detalle = "Ninguna caja abrió turno.";
  } else if (caja.cerrados === 0) {
    tono = "neutro";
    titulo = "Caja abierta";
    detalle = `${caja.abiertos === 1 ? "El turno sigue" : `${caja.abiertos} turnos siguen`} abierto${caja.abiertos === 1 ? "" : "s"}: el corte todavía no se hace.`;
  } else if (caja.conDiferencia === 0) {
    tono = "ok";
    titulo = "La caja cuadró";
    detalle = caja.cerrados === 1 ? "El corte cuadró al centavo." : `Los ${caja.cerrados} cortes cuadraron al centavo.`;
  } else if (caja.diferenciaNeta < 0) {
    tono = "falta";
    titulo = `Faltan ${fmt(Math.abs(caja.diferenciaNeta))}`;
    detalle = `${caja.conDiferencia} de ${caja.cerrados} ${caja.cerrados === 1 ? "corte" : "cortes"} con diferencia.`;
  } else {
    tono = "sobra";
    titulo = caja.diferenciaNeta > 0 ? `Sobran ${fmt(caja.diferenciaNeta)}` : "Diferencias que se compensan";
    detalle = `${caja.conDiferencia} de ${caja.cerrados} ${caja.cerrados === 1 ? "corte" : "cortes"} con diferencia.`;
  }
  if (caja.cerrados > 0 && caja.abiertos > 0) detalle += ` ${caja.abiertos} sigue${caja.abiertos === 1 ? "" : "n"} abierto${caja.abiertos === 1 ? "" : "s"}.`;

  const estilo = {
    ok: { caja: "border-success/30 bg-success-soft", icono: "bg-success text-white", texto: "text-success" },
    falta: { caja: "border-danger/30 bg-danger-soft", icono: "bg-danger text-white", texto: "text-danger" },
    sobra: { caja: "border-warning/30 bg-warning-soft", icono: "bg-warning text-white", texto: "text-warning" },
    neutro: { caja: "border-line bg-surface", icono: "bg-hover text-ink-2", texto: "text-ink" },
  }[tono];

  return (
    <section aria-label="Caja del día" className={`mb-5 flex flex-col gap-4 rounded-lg border p-4 lg:flex-row lg:items-center lg:gap-6 lg:px-5 ${estilo.caja}`}>
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full ${estilo.icono}`} aria-hidden="true">
          {tono === "ok" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M20 6 9 17l-5-5" /></svg>
          ) : tono === "neutro" ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M3 11h18M8 3h8v4H8z" /></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5"><path d="M12 8v5M12 16.5v.5" /><circle cx="12" cy="12" r="9" /></svg>
          )}
        </span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold uppercase tracking-[0.04em] text-ink-2">Caja del día</div>
          <div className={`font-display text-[20px] font-bold leading-tight tabular-nums ${estilo.texto}`}>{titulo}</div>
          <div className="text-[14px] text-ink-2">{detalle}</div>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-4 text-[13px] lg:flex lg:gap-6">
        <div>
          <dt className="text-ink-2">Cancelaciones</dt>
          <dd className="font-display text-[16px] font-semibold tabular-nums">{fmtInt(cancelados)}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Descuentos</dt>
          <dd className="font-display text-[16px] font-semibold tabular-nums">{fmt(descuentos)}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Devoluciones</dt>
          <dd className="font-display text-[16px] font-semibold tabular-nums">{fmt(devoluciones)}</dd>
        </div>
      </dl>
      <Link href="/reportes/z-historico" className="text-[14px] font-semibold text-accent transition-colors hover:text-accent-hover lg:flex-shrink-0">
        Ver cortes →
      </Link>
    </section>
  );
}

export default function DashboardPage() {
  const perfil = usePerfil();
  const primer = (perfil?.nombre ?? "").split(/\s+/)[0] || "";
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [onb, setOnb] = useState<EstadoOnboarding | null>(null);
  const [sucursal, setSucursal] = useState<string | null>(null);

  /* El día que se está mirando. `null` = hoy, que es lo que se ve al entrar.
     Se guarda aparte de `data` porque el selector tiene que responder al
     instante aunque la consulta tarde: si se leyera de `data`, al elegir una
     fecha el campo se quedaría en la anterior hasta que llegaran los datos. */
  const [dia, setDia] = useState<string | null>(null);
  const [cargandoDia, setCargandoDia] = useState(false);

  useEffect(() => {
    setCargandoDia(true);
    leerDashboard(dia ?? undefined)
      .then((d) => { setData(d); setError(null); })
      .catch((e) => setError(mensajeError(e, "No se pudo cargar")))
      .finally(() => setCargandoDia(false));
  }, [dia]);

  /* «En vivo» era un punto que parpadeaba sobre datos que nadie volvía a pedir. Ahora, mirando
     hoy, se vuelve a leer cada minuto y al regresar a la pestaña, sin borrar la pantalla, y el
     encabezado dice a qué hora fue la última lectura. */
  const [refrescando, setRefrescando] = useState(false);
  const ultimaLectura = useRef(0);
  useEffect(() => {
    if (data) ultimaLectura.current = new Date(data.leidoEn).getTime();
  }, [data]);
  const refrescar = useCallback(async () => {
    setRefrescando(true);
    try {
      const d = await leerDashboard(undefined);
      setData(d);
      setError(null);
    } catch (e) {
      setError(mensajeError(e, "No se pudo actualizar"));
    } finally {
      setRefrescando(false);
    }
  }, []);
  const mirandoHoy = dia === null && (data?.esHoy ?? false);
  useEffect(() => {
    if (!mirandoHoy) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") void refrescar(); }, REFRESCO_MS);
    // Al volver a la pestaña, solo si la última lectura ya tiene rato: cambiar de ventana varias
    // veces seguidas disparaba una lectura completa cada vez.
    const alVolver = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - ultimaLectura.current < VOLVER_MIN_MS) return;
      void refrescar();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", alVolver); };
  }, [mirandoHoy, refrescar]);

  useEffect(() => {
    leerEstadoOnboarding().then(setOnb).catch(() => {});
    listarSucursales()
      .then((s) => setSucursal(s.length === 1 ? s[0]!.nombre : null))
      .catch(() => {});
  }, []);

  // Hasta que el dueño termine la configuración; con todo listo, el aviso lo manda a terminarla.
  const mostrarOnboarding = onb && onb.fase !== "GO_LIVE";
  const faltanOnb = onb ? onb.obligatoriosTotal - onb.obligatoriosHechos : 0;

  const hoy: ResumenDia | undefined = data?.hoy;
  const ayer = data?.ayer ?? null;
  const sinVentas = data !== null && (hoy?.ticketsCompletados ?? 0) === 0;
  // La fecha del DÍA CONTABLE que se está mostrando, no la del reloj del navegador. Antes se
  // pintaba `new Date()` junto a cifras que podían ser de días atrás: el rótulo decía "hoy" y los
  // números eran del 17. Además el día contable cierra a las 3 am, así que a la 1 de la mañana
  // esto sigue diciendo —correctamente— la fecha de ayer.
  const fmtDia = (iso: string) => {
    const p = iso.split("-").map(Number);
    // Se construye la fecha en hora LOCAL a partir de las partes, no con `new Date(iso)`: esa
    // ruta interpreta "2026-08-19" como medianoche UTC y en México lo pinta como el día 18.
    const fecha = new Date(p[0] ?? 1970, (p[1] ?? 1) - 1, p[2] ?? 1);
    return new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "short" }).format(fecha);
  };
  const fechaCorta = data ? fmtDia(data.dia) : "—";
  const ultimaVenta = data?.ultimoDiaConVentas ?? null;

  return (
    <>
      <PageHeader
        titulo={`Hola, ${primer}`}
        subtitulo={
          data && !data.esHoy
            ? `Lo que pasó el ${fechaCorta}${sucursal ? ` en ${sucursal}` : ""}`
            : sucursal
              ? `Esto es lo que pasa hoy en ${sucursal}`
              : "Esto es lo que pasa hoy en tu negocio"
        }
        right={
          /* ANTES ESTO ERA UN <span>. Tenía borde, icono de calendario y aire de
             control, pero no era clicable: solo pintaba la fecha. Quien lo veía
             intentaba cambiar el día y no pasaba nada.

             Ahora es un `<input type="date">` de verdad. Nativo y no un
             calendario propio: en el teléfono abre el selector del sistema, que
             el dueño ya sabe usar, y no hay que mantener un widget. */
          <div className="flex items-center gap-2">
            <label className="inline-flex items-center gap-2 rounded border border-line-strong bg-surface px-3 py-[7px] text-[13px] font-semibold focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgba(22,22,26,.06)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[15px] w-[15px] flex-shrink-0 text-ink-3" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>
              <span className="sr-only">Día que se muestra</span>
              <input
                type="date"
                className="bg-transparent text-[13px] font-semibold outline-none"
                value={dia ?? data?.hoyContable ?? ""}
                /* Sin tope, se puede elegir mañana y la pantalla sale en cero
                   sin explicar por qué. El tope es el día contable del negocio,
                   no el del reloj del navegador. */
                max={data?.hoyContable}
                onChange={(e) => setDia(e.target.value || null)}
                disabled={!data}
              />
            </label>

            {data?.esHoy ? (
              <span className="inline-flex items-center gap-2">
                <span className="inline-flex items-center gap-[6px] text-[13px] font-semibold text-success">
                  <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" />
                  En vivo
                  <span className="font-medium text-ink-2">
                    · {new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit" }).format(new Date(data.leidoEn))}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void refrescar()}
                  disabled={refrescando}
                  aria-label="Actualizar ahora"
                  title="Actualizar ahora"
                  className="flex h-9 w-9 items-center justify-center rounded border border-line-strong text-ink-2 transition-[transform,color,border-color] duration-150 ease-vim hover:border-ink hover:text-ink active:scale-[.95] disabled:opacity-50"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 ${refrescando ? "animate-spin" : ""}`} aria-hidden="true"><path d="M21 12a9 9 0 1 1-2.6-6.4" /><path d="M21 4v5h-5" /></svg>
                </button>
              </span>
            ) : data ? (
              /* «En vivo» mintiendo sobre un día pasado sería peor que no
                 decir nada: se cambia por la salida a hoy, que es lo que hace
                 falta cuando ya miraste el día que querías. Mientras carga no
                 se ofrece: todavía no se sabe qué día es. */
              <button
                type="button"
                onClick={() => setDia(null)}
                className="text-[12px] font-semibold text-accent transition-colors hover:text-accent-hover"
              >
                Volver a hoy
              </button>
            ) : null}
          </div>
        }
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        {mostrarOnboarding && onb && (
          <Link href="/bienvenida" className="mb-6 flex items-center gap-4 rounded-lg border border-[#E8DCC0] bg-warning-soft p-4 transition hover:border-accent">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-accent text-white">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="h-5 w-5"><path d="M5 12h14M13 5l7 7-7 7" /></svg>
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[14.5px] font-semibold">{onb.listoParaVender ? "Ya puedes vender" : "Termina de configurar tu negocio"}</div>
              <div className="text-[13px] text-ink-2">
                {onb.listoParaVender
                  ? "Completaste los pasos. Entra para terminar la configuración."
                  : `${onb.obligatoriosHechos} de ${onb.obligatoriosTotal} pasos · ${faltanOnb === 1 ? "te falta 1" : `te faltan ${faltanOnb}`} para empezar a vender.`}
              </div>
            </div>
            <span className="text-[13px] font-semibold text-accent">Continuar →</span>
          </Link>
        )}

        {data === null && !error && <p className="text-sm text-ink-3">Cargando…</p>}

        {sinVentas && (
          <div className="mb-6 rounded-lg border border-line bg-surface p-5">
            <h2 className="font-display text-base font-semibold">Aún no hay ventas registradas</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-2">
              Las métricas en vivo aparecerán en cuanto el POS registre la primera venta del día.
              Mientras, administra tu negocio desde los accesos de abajo.
            </p>
            {/* Cuándo fue la última vez que sí hubo ventas. Un cero puede significar "todavía no
                abrimos" o "la caja lleva días sin subir nada", y son cosas muy distintas: sin este
                dato, la segunda pasa desapercibida hasta que las cuentas no cuadran. */}
            {ultimaVenta && ultimaVenta !== data?.dia && (
              <p className="mt-3 rounded border border-[#F0DCC0] bg-warning-soft px-3 py-2 text-[13px] font-medium text-warning">
                La última venta registrada es del {fmtDia(ultimaVenta)}. Si el negocio ha vendido
                desde entonces, la caja no está enviando sus ventas.
              </p>
            )}
          </div>
        )}

        {hoy && !sinVentas && (
          <>
            {/* Arriba de las cifras: "¿cuadró la caja?" es lo primero que el dueño busca. */}
            <FranjaCaja
              caja={data!.caja}
              cancelados={hoy.ticketsCancelados}
              descuentos={hoy.descuentos}
              devoluciones={hoy.devoluciones}
            />

            {/* KPIs con variación contra el día anterior (P-177).

                Las etiquetas y los comparativos dicen "hoy" y "ayer" solo
                cuando de verdad se mira hoy. Mirando el 25, una tarjeta que
                dijera "Ventas hoy" estaría mintiendo sobre la cifra que enseña
                — y "vs ayer" tampoco: es el día anterior AL QUE SE MIRA. */}
            <div className="mb-5 grid grid-cols-2 gap-4 lg:grid-cols-4">
              <Kpi
                primario
                label={data?.esHoy ? "Ventas hoy" : "Ventas del día"}
                valor={fmt(hoy.totalNeto)}
                icono={ICONOS.ventas}
                pct={variacionPct(hoy.totalNeto, ayer?.totalNeto)}
                comparativo={ayer ? `vs ${data?.esHoy ? "ayer" : "el día previo"} (${fmt(ayer.totalNeto)})` : "sin día previo"}
              />
              <Kpi
                label="Tickets"
                valor={fmtInt(hoy.ticketsCompletados)}
                icono={ICONOS.tickets}
                pct={variacionPct(hoy.ticketsCompletados, ayer?.ticketsCompletados)}
                comparativo={ayer ? `vs ${data?.esHoy ? "ayer" : "el día previo"} (${fmtInt(ayer.ticketsCompletados)})` : "sin día previo"}
              />
              <Kpi
                label="Ticket promedio"
                valor={fmt(hoy.ticketPromedio)}
                icono={ICONOS.promedio}
                pct={variacionPct(hoy.ticketPromedio, ayer?.ticketPromedio)}
                comparativo={ayer ? `vs ${data?.esHoy ? "ayer" : "el día previo"} (${fmt(ayer.ticketPromedio)})` : "sin día previo"}
              />
              <Kpi
                label="Propinas"
                valor={fmt(hoy.propinas)}
                icono={ICONOS.propinas}
                pct={variacionPct(hoy.propinas, ayer?.propinas)}
                comparativo={ayer ? `vs ${data?.esHoy ? "ayer" : "el día previo"} (${fmt(ayer.propinas)})` : "sin día previo"}
              />
            </div>

            {/* Gráfica por hora + Top productos al lado (P-177: 1fr / 340px) */}
            <div className="mb-5 grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-5 py-4">
                  <div className="font-display text-[15px] font-semibold">
                    Ventas por hora
                    <div className="mt-0.5 text-[13px] font-normal text-ink-2">Distribución del día contable</div>
                  </div>
                </div>
                <div className="p-5">
                  {(data?.ventasPorHora.length ?? 0) > 0 ? (
                    <GraficaPorHora datos={data!.ventasPorHora} />
                  ) : (
                    <p className="py-12 text-center text-[14px] text-ink-2">Sin ventas con hora registrada hoy.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-display text-[15px] font-semibold">Top productos{data?.esHoy ? " hoy" : ""}</div>
                    <div className="flex items-center gap-2">
                      <Link href="/reportes/ventas-producto" className="text-[13px] font-semibold text-ink-2 transition-colors hover:text-ink">Ver todos</Link>
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[12px] font-semibold text-accent" title="Combos cobrados en el día">
                        {data?.combosVendidos ?? 0} combos
                      </span>
                    </div>
                  </div>
                </div>
                <div className="px-5 py-2">
                  {(data?.topProductos.length ?? 0) > 0 ? (
                    <div className="flex flex-col">
                      {/* LA LISTA VIENE ORDENADA POR IMPORTE, así que la cifra
                          grande y la barra son el IMPORTE.

                          Antes se ordenaba por dinero y se enseñaban unidades:
                          el número 1 podía tener menos piezas que el 3 y la
                          lista parecía rota. No lo estaba — decía una cosa y
                          medía otra. Las unidades siguen, en pequeño, porque el
                          dato sirve; lo que no puede es mandar sobre el orden. */}
                      {data!.topProductos.map((p, i) => {
                        const maxTotal = Math.max(1, ...data!.topProductos.map((t) => t.total));
                        return (
                          <div key={p.nombre} className="flex items-center gap-[11px] border-b border-line py-[11px] last:border-b-0">
                            <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold ${i === 0 ? "bg-ink text-white" : "bg-hover text-ink-2"}`}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-[13px] font-semibold">{p.nombre}</div>
                              <div className="mt-[5px] h-1 overflow-hidden rounded-full bg-hover">
                                <span className="block h-full rounded-full bg-ink-3" style={{ width: `${(p.total / maxTotal) * 100}%` }} />
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-[13px] font-bold tabular-nums">{fmt(p.total)}</div>
                              <div className="text-[12.5px] text-ink-2 tabular-nums">{fmtInt(p.unidades)} u.</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-10 text-center text-[14px] text-ink-2">Sin productos vendidos hoy.</p>
                  )}
                </div>
              </div>
            </div>
          </>
        )}

        {/* Accesos rápidos a reportes (P-177) */}
        <h3 className="mb-3 font-display text-base font-semibold">Reportes</h3>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {REPORTES_RAPIDOS.map((a) => (
            <Link key={a.href} href={a.href} className="group rounded-lg border border-line bg-surface p-4 transition-colors hover:border-ink hover:bg-sel">
              <div className="mb-2.5 flex h-9 w-9 items-center justify-center rounded bg-hover text-ink-2 transition-colors group-hover:bg-surface group-hover:text-ink">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[18px] w-[18px]"><path d="M3 3v18h18" /><path d="M7 14l3-3 3 3 4-5" /></svg>
              </div>
              <div className="text-[13.5px] font-semibold">{a.nombre}</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-ink-2">{a.desc}</div>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}
