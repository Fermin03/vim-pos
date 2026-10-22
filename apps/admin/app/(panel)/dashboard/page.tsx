"use client";
import { diaCorto } from "@vim/fecha";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { PageHeader, PageBody } from "../../components/page-header";
import { usePerfil } from "../../components/admin-shell";
import { leerDashboard, variacionPct, type Dashboard, type ResumenDia } from "../../lib/reportes";
import { type ResumenCaja } from "../../lib/dashboard-calculos";
import { actualizarFase, debeMostrarPasos, leerEstadoOnboarding, type EstadoOnboarding } from "../../lib/onboarding";
import { leerSesion } from "../../lib/supabase";
import { PasosConfiguracion } from "../../components/pasos-configuracion";
import { mensajeError } from "../../lib/errores";
import { leerPrueba } from "../../lib/plan";
import { AvisoPrueba } from "../../components/aviso-prueba";
import { Cargando, Aviso, Icono } from "@vim/ui/styles";
import { AvisosFacturacion } from "../../components/avisos-facturacion";
import { useAvisoCerrado } from "../../components/aviso-cerrado";
import { SelectorSucursal, useSucursalReporte } from "../../components/selector-sucursal";

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
  const claseComparativo = `text-13 ${sobreOscuro ? "text-white/70" : "text-ink-2"}`;
  if (pct === null) return comparativo ? <span className={claseComparativo}>{comparativo}</span> : null;
  const sube = pct >= 0;
  // Bajar contra ayer no es una alarma (un martes vende menos que un sábado): va en neutro. El
  // rojo se guarda para lo que sí hay que atender, como un faltante de caja.
  const claseChip = sobreOscuro
    ? sube ? "bg-success/25 text-[#7FD1A3]" : "bg-white/15 text-white"
    : sube ? "bg-success-soft text-success" : "bg-hover text-ink-2";
  return (
    <>
      <span className={`inline-flex items-center gap-[3px] rounded-full px-[7px] py-0.5 text-13 font-bold ${claseChip}`}>
        <Icono nombre={sube ? "tendencia-alza" : "tendencia-baja"} className="h-3 w-3" strokeWidth={2.5} />
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
        <span className={`min-w-0 truncate text-12 font-semibold uppercase tracking-[0.04em] lg:text-13 ${primario ? "text-white/75" : "text-ink-2"}`}>{label}</span>
        <span className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded ${primario ? "bg-white/10 text-white" : "bg-hover text-ink-2"}`}>{icono}</span>
      </div>
      <div className={`mt-3 font-display text-24 font-bold tracking-[-0.025em] tabular-nums lg:mt-3.5 lg:text-32 ${primario ? "text-white" : ""}`}>{valor}</div>
      <div className="mt-2 flex flex-wrap items-center gap-x-[7px] gap-y-1">
        <Delta pct={pct} comparativo={comparativo} sobreOscuro={primario} />
      </div>
    </div>
  );
}

const ICONOS = {
  ventas: <Icono nombre="pesos" className="h-4 w-4" />,
  tickets: <Icono nombre="recibo" className="h-4 w-4" />,
  promedio: <Icono nombre="grafica" className="h-4 w-4" />,
  propinas: <Icono nombre="moneda" className="h-4 w-4" />,
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
                <span className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded bg-ink px-2 py-1 text-12 font-semibold text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100">
                  {rotulo(d.hora)} · {fmt(d.total)}
                </span>
              </div>
              <div className="text-12 font-semibold tabular-nums text-ink-2">{d.hora}</div>
            </li>
          );
        })}
      </ul>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-line pt-4">
        <div className="flex items-center gap-[7px] text-13 text-ink-2">
          <span className="h-[11px] w-[11px] rounded-[3px] bg-ink" aria-hidden="true" />
          Hora pico <span className="font-semibold text-ink">{rotulo(pico.hora)} ({fmt(pico.total)})</span>
        </div>
        <div className="flex items-center gap-[7px] text-13 text-ink-2">
          <span className="h-[11px] w-[11px] rounded-[3px] bg-ink-3" aria-hidden="true" />
          Promedio por hora <span className="font-semibold text-ink">{fmt(Math.round(promedio * 100) / 100)}</span>
        </div>
      </div>
      {/* Sin hover en el celular: las mejores horas, por escrito. */}
      {mejores.length > 1 && (
        <ol className="mt-4 flex flex-col gap-1.5 lg:hidden" aria-label="Mejores horas">
          {mejores.map((d, i) => (
            <li key={d.hora} className="flex items-center justify-between text-14">
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
function FranjaCaja({ caja, cancelados, descuentos, lealtad, devoluciones }: {
  caja: ResumenCaja; cancelados: number; descuentos: number; lealtad: number; devoluciones: number;
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
            <Icono nombre="palomita" className="h-5 w-5" />
          ) : tono === "neutro" ? (
            <Icono nombre="cajon" className="h-5 w-5" />
          ) : (
            <Icono nombre="info" className="h-5 w-5" />
          )}
        </span>
        <div className="min-w-0">
          <div className="text-13 font-semibold uppercase tracking-[0.04em] text-ink-2">Caja del día</div>
          <div className={`font-display text-20 font-bold leading-tight tabular-nums ${estilo.texto}`}>{titulo}</div>
          <div className="text-14 text-ink-2">{detalle}</div>
        </div>
      </div>
      <dl className="grid grid-cols-3 gap-4 text-13 lg:flex lg:gap-6">
        <div>
          <dt className="text-ink-2">Cancelaciones</dt>
          <dd className="font-display text-16 font-semibold tabular-nums">{fmtInt(cancelados)}</dd>
        </div>
        <div>
          <dt className="text-ink-2">Descuentos</dt>
          <dd className="font-display text-16 font-semibold tabular-nums">{fmt(descuentos)}</dd>
        </div>
        {lealtad > 0 && (
          <div>
            <dt className="text-ink-2">Lealtad</dt>
            <dd className="font-display text-16 font-semibold tabular-nums">{fmt(lealtad)}</dd>
          </div>
        )}
        <div>
          <dt className="text-ink-2">Devoluciones</dt>
          <dd className="font-display text-16 font-semibold tabular-nums">{fmt(devoluciones)}</dd>
        </div>
      </dl>
      <Link href="/reportes/z-historico" className="inline-flex items-center gap-1 text-14 font-semibold text-accent transition-colors hover:text-accent-hover lg:flex-shrink-0">
        Ver cortes <Icono nombre="flecha-derecha" className="h-4 w-4 flex-shrink-0" />
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
  const [tenantId, setTenantId] = useState<string | null>(null);
  /* De qué sucursal es el panel: una por defecto (la última que se eligió), "Todas" a elección.
     Es el mismo selector de los reportes y recuerda lo mismo: elegir aquí se respeta allá. */
  const suc = useSucursalReporte();
  const sucursal = suc.nombre;
  const [prueba, setPrueba] = useState<{ estado: string; prueba_hasta: string | null } | null>(null);

  /* El día que se está mirando. `null` = hoy, que es lo que se ve al entrar.
     Se guarda aparte de `data` porque el selector tiene que responder al
     instante aunque la consulta tarde: si se leyera de `data`, al elegir una
     fecha el campo se quedaría en la anterior hasta que llegaran los datos. */
  const [dia, setDia] = useState<string | null>(null);
  const [cargandoDia, setCargandoDia] = useState(false);

  useEffect(() => {
    if (!suc.listo) return;
    let vigente = true;
    setCargandoDia(true);
    leerDashboard(dia ?? undefined, suc.id)
      .then((d) => { if (vigente) { setData(d); setError(null); } })
      .catch((e) => { if (vigente) setError(mensajeError(e, "No se pudo cargar")); })
      .finally(() => { if (vigente) setCargandoDia(false); });
    // Cambiar de día o de sucursal rápido: la respuesta vieja que llega tarde no pisa a la nueva.
    return () => { vigente = false; };
  }, [dia, suc.listo, suc.id]);

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
      const d = await leerDashboard(undefined, suc.id);
      setData(d);
      setError(null);
    } catch (e) {
      setError(mensajeError(e, "No se pudo actualizar"));
    } finally {
      setRefrescando(false);
    }
  }, [suc.id]);
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
    leerSesion().then((s) => setTenantId(s?.tenantId ?? null)).catch(() => {});
    // La prueba gratis (0141): un aviso que no bloquea; si la lectura falla, simplemente no sale.
    leerPrueba().then(setPrueba).catch(() => {});
  }, []);

  // Los pasos de configuración viven aquí (antes en /bienvenida), hasta que el dueño la termine.
  const mostrarPasos = !!onb && debeMostrarPasos(onb.fase, perfil?.jerarquia ?? null);
  // Plataforma lee la fase ("Alta estancada"): verlos por primera vez es empezar a configurar.
  useEffect(() => {
    if (mostrarPasos && onb?.fase === "INVITADO") actualizarFase("EN_CONFIGURACION", 1).catch(() => {});
  }, [mostrarPasos, onb?.fase]);
  const terminarConfiguracion = async () => {
    try {
      await actualizarFase("GO_LIVE");
      setOnb(await leerEstadoOnboarding());
    } catch (e) {
      setError(mensajeError(e, "No se pudo terminar la configuración"));
    }
  };

  const hoy: ResumenDia | undefined = data?.hoy;
  const ayer = data?.ayer ?? null;
  const sinVentas = data !== null && (hoy?.ticketsCompletados ?? 0) === 0;
  // La fecha del DÍA CONTABLE que se está mostrando, no la del reloj del navegador. Antes se
  // pintaba `new Date()` junto a cifras que podían ser de días atrás: el rótulo decía "hoy" y los
  // números eran del 17. Además el día contable cierra a las 3 am, así que a la 1 de la mañana
  // esto sigue diciendo —correctamente— la fecha de ayer.
  // `diaCorto` de @vim/fecha: la fecha se toma tal cual, sin pasar por `new Date(iso)` (medianoche
  // UTC, que en México ya es el día anterior).
  const fechaCorta = data ? diaCorto(data.dia) : "—";
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
              : suc.sucursales.length > 1
                ? "Esto es lo que pasa hoy en todas tus sucursales"
                : "Esto es lo que pasa hoy en tu negocio"
        }
        right={
          /* ANTES ESTO ERA UN <span>. Tenía borde, icono de calendario y aire de
             control, pero no era clicable: solo pintaba la fecha. Quien lo veía
             intentaba cambiar el día y no pasaba nada.

             Ahora es un `<input type="date">` de verdad. Nativo y no un
             calendario propio: en el teléfono abre el selector del sistema, que
             el dueño ya sabe usar, y no hay que mantener un widget. */
          <div className="flex flex-wrap items-center gap-2">
            <SelectorSucursal sucursal={suc} />
            <label className="inline-flex items-center gap-2 rounded border border-line-strong bg-surface px-3 py-[7px] text-13 font-semibold focus-within:border-ink focus-within:shadow-[0_0_0_3px_rgba(22,22,26,.06)]">
              <Icono nombre="calendario" className="h-[15px] w-[15px] flex-shrink-0 text-ink-3" />
              <span className="sr-only">Día que se muestra</span>
              <input
                type="date"
                className="bg-transparent text-13 font-semibold outline-none"
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
                <span className="inline-flex items-center gap-[6px] text-13 font-semibold text-success">
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
                  <Icono nombre="actualizar" className={`h-4 w-4 ${refrescando ? "animate-spin" : ""}`} />
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
                className="text-12 font-semibold text-accent transition-colors hover:text-accent-hover"
              >
                Volver a hoy
              </button>
            ) : null}
          </div>
        }
      />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger">{error}</p>}

        <AvisoPrueba estado={prueba?.estado} pruebaHasta={prueba?.prueba_hasta} conEnlace className="mb-6" />
        {/* Sello por vencer. La factura global ya NO se recuerda aquí (decisión del dueño, 1 oct
            2026: no es forzosa ni debe insistir); su recordatorio vive solo en Facturación. */}
        <AvisosFacturacion className="mb-6" />

        {mostrarPasos && onb && tenantId && (
          <PasosConfiguracion estado={onb} tenantId={tenantId} onTerminar={terminarConfiguracion} />
        )}

        {data === null && !error && <Cargando />}

        {/* Con los pasos a la vista, "sin ventas" es lo esperado: una línea, sin competir con ellos. */}
        {sinVentas && mostrarPasos && (
          <p className="mb-6 text-14 text-ink-2">Aún no hay ventas. Las métricas aparecen con la primera venta en tu caja.</p>
        )}
        {sinVentas && !mostrarPasos && (
          <div className="mb-6 rounded-lg border border-line bg-surface p-5">
            <h2 className="font-display text-base font-semibold">Aún no hay ventas registradas</h2>
            <p className="mt-1 max-w-xl text-sm text-ink-2">
              Las métricas en vivo aparecerán en cuanto el POS registre la primera venta del día.
              Mientras, administra tu negocio desde los accesos de abajo.
            </p>
            {/* Cuándo fue la última vez que sí hubo ventas. Un cero puede significar "todavía no
                abrimos" o "la caja lleva días sin subir nada", y son cosas muy distintas: sin este
                dato, la segunda pasa desapercibida hasta que las cuentas no cuadran. */}
            {ultimaVenta && data?.dia && ultimaVenta !== data.dia && (
              <AvisoUltimaVenta ultimaVenta={ultimaVenta} dia={data.dia} />
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
              lealtad={hoy.lealtad}
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
                  <div className="font-display text-15 font-semibold">
                    Ventas por hora
                    <div className="mt-0.5 text-13 font-normal text-ink-2">Distribución del día contable</div>
                  </div>
                </div>
                <div className="p-5">
                  {(data?.ventasPorHora.length ?? 0) > 0 ? (
                    <GraficaPorHora datos={data!.ventasPorHora} />
                  ) : (
                    <p className="py-12 text-center text-14 text-ink-2">Sin ventas con hora registrada hoy.</p>
                  )}
                </div>
              </div>

              <div className="rounded-lg border border-line bg-surface">
                <div className="border-b border-line px-5 py-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-display text-15 font-semibold">Top productos{data?.esHoy ? " hoy" : ""}</div>
                    <div className="flex items-center gap-2">
                      <Link href="/reportes/ventas-producto" className="text-13 font-semibold text-ink-2 transition-colors hover:text-ink">Ver todos</Link>
                      <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-12 font-semibold text-accent" title="Combos cobrados en el día">
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
                            <span className={`flex h-[22px] w-[22px] flex-shrink-0 items-center justify-center rounded-full font-display text-11 font-bold ${i === 0 ? "bg-ink text-white" : "bg-hover text-ink-2"}`}>{i + 1}</span>
                            <div className="min-w-0 flex-1">
                              <div className="truncate text-13 font-semibold">{p.nombre}</div>
                              <div className="mt-[5px] h-1 overflow-hidden rounded-full bg-hover">
                                <span className="block h-full rounded-full bg-ink-3" style={{ width: `${(p.total / maxTotal) * 100}%` }} />
                              </div>
                            </div>
                            <div className="flex-shrink-0 text-right">
                              <div className="text-13 font-bold tabular-nums">{fmt(p.total)}</div>
                              <div className="text-13 text-ink-2 tabular-nums">{fmtInt(p.unidades)} u.</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="py-10 text-center text-14 text-ink-2">Sin productos vendidos hoy.</p>
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
                <Icono nombre="grafica" className="h-[18px] w-[18px]" />
              </div>
              <div className="text-14 font-semibold">{a.nombre}</div>
              <div className="mt-0.5 text-13 leading-snug text-ink-2">{a.desc}</div>
            </Link>
          ))}
        </div>
      </PageBody>
    </>
  );
}

/**
 * "La última venta es del …". Se cierra con la "×", pero la clave lleva el día que se está viendo:
 * mañana vuelve a salir si la caja sigue sin subir ventas, que es justo lo que este aviso vigila.
 */
function AvisoUltimaVenta({ ultimaVenta, dia }: { ultimaVenta: string; dia: string }) {
  const { cerrado, cerrar } = useAvisoCerrado(`ultima-venta:${ultimaVenta}:${dia}`);
  if (cerrado) return null;
  return (
    <Aviso tono="warning" role="status" className="mt-3" onCerrar={cerrar}>
      La última venta registrada es del {diaCorto(ultimaVenta)}. Si el negocio ha vendido desde entonces, la caja no
      está enviando sus ventas.
    </Aviso>
  );
}
