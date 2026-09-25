"use client";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { type CajaKds } from "./caja";
import {
  labelModo,
  leerComandas,
  marcarListoCocina,
  minutosEnCocina,
  type ComandaKds,
  type ItemComanda,
} from "./comandas";
import {
  areaParaRpc,
  areasDeComandas,
  bloquesDeComanda,
  columnasKds,
  comandasNuevas,
  estadoDelTiempo,
  paginarPorFilas,
  SIN_AREA,
  TODAS_LAS_AREAS,
  vistaDeArea,
  type EstadoTiempo,
} from "./estado";

const REFRESCO_MS = 5000; // re-lee comandas de BD cada 5s (polling robusto + Realtime del hub)
const TODAS = TODAS_LAS_AREAS;
/** LISTO espera esto antes de mandarse, con "Deshacer" a la vista (ADR 0018). */
const DESHACER_MS = 5000;
/** Lecturas fallidas seguidas antes de decir "sin conexión": una sola puede ser un tropiezo. */
const FALLOS_SIN_CONEXION = 2;
/**
 * Tiempo máximo de una lectura. Con la red caída, supabase-js reintenta por su cuenta y la promesa
 * no falla en decenas de segundos: la pantalla seguía diciendo "En línea" con la caja apagada.
 * Menos que el intervalo, para que cada lectura termine antes de que empiece la siguiente.
 */
const LECTURA_MAX_MS = 4500;
/** Una comanda es NUEVA durante su primer minuto en cocina. */
const NUEVA_MS = 60_000;
/** Si alguien se queda viendo otra página, la pantalla vuelve sola a la primera. */
const VOLVER_A_PRIMERA_MS = 20_000;
/** Separación entre tarjetas (gap-3.5) y alto de la barra de páginas, en px. */
const GAP = 14;
const ALTO_BARRA = 80;

/** Un LISTO tocado que todavía no se manda: la tarjeta se oculta y se puede deshacer. */
type Espera = { id: string; ticketId: string; area: string; folioCorto: string };
type ComandaVista = ComandaKds & { otrasPendientes: string[] };
type Tema = { bg: string; surface: string; franja: string; line: string; text: string; text2: string; text3: string };

const TEMA_NORMAL: Tema = { bg: "#1A1A1E", surface: "#26262B", franja: "#2F2F35", line: "#333338", text: "#F0F0EC", text2: "#A0A0A6", text3: "#6E6E74" };
// Alto contraste para cocinas con luz fuerte: fondo negro y texto blanco puro.
const TEMA_CONTRASTE: Tema = { bg: "#000000", surface: "#15151A", franja: "#26262B", line: "#44444A", text: "#FFFFFF", text2: "#D0D0D6", text3: "#9090A0" };

/** El color es tiempo y nada más. Gris, ámbar con tinta negra, rojo con la palabra TARDE. */
const FRANJA: Record<EstadoTiempo, { bg?: string; fg: string; reloj: string }> = {
  "a-tiempo": { fg: "#F0F0EC", reloj: "#8FE0AE" },
  atencion: { bg: "#D4A017", fg: "#16161A", reloj: "#16161A" },
  tarde: { bg: "#E04040", fg: "#FFFFFF", reloj: "#FFFFFF" },
};

// ── Preferencias de la pantalla ─────────────────────────────────────────────────────────────
// Sonido, contraste y estación se quedaban en un useState y se perdían en cada recarga o
// reconexión: la plancha volvía a ver las bebidas de la barra hasta que alguien la reconfiguraba.
const PREF = { sonido: "vim.kds.sonido", contraste: "vim.kds.contraste", area: "vim.kds.area" } as const;

function leerPref(clave: string): string | null {
  try {
    return window.localStorage.getItem(clave);
  } catch {
    return null;
  }
}
function guardarPref(clave: string, valor: string) {
  try {
    window.localStorage.setItem(clave, valor);
  } catch {
    /* sin almacenamiento: la preferencia dura lo que dure la pantalla abierta */
  }
}

// ── Sonido ──────────────────────────────────────────────────────────────────────────────────
// Antes cada pitido creaba su propio AudioContext sin que nadie hubiera tocado la pantalla, y el
// navegador lo deja mudo: en una tele de cocina casi nunca sonaba, aunque el ícono dijera que sí.
// Ahora hay UN contexto, se destraba con el primer toque, y el aviso es dos tonos tres veces, a
// un volumen que compite con una campana (antes: un seno de 180 ms a 0.08).
let audioCtx: AudioContext | null = null;

function contextoAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    audioCtx = Ctx ? new Ctx() : null;
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function sonarNuevoPedido() {
  const ctx = contextoAudio();
  if (!ctx || ctx.state !== "running") return;
  const t0 = ctx.currentTime;
  for (let r = 0; r < 3; r++) {
    [880, 1320].forEach((frecuencia, i) => {
      const inicio = t0 + r * 0.55 + i * 0.18;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = frecuencia;
      gain.gain.setValueAtTime(0.0001, inicio);
      gain.gain.exponentialRampToValueAtTime(0.4, inicio + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.16);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.17);
    });
  }
}

function reloj(fechaEnvio: string | null, ahora: number): string {
  if (!fechaEnvio) return "—";
  const ms = Math.max(0, ahora - new Date(fechaEnvio).getTime());
  const totalSeg = Math.floor(ms / 1000);
  const m = Math.floor(totalSeg / 60);
  const s = totalSeg % 60;
  // Pasando de 99 min ya no importan los segundos, y "2313:55" no cabe en la franja.
  if (m >= 100) return `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

function haceCuanto(desde: number, ahora: number): string {
  const seg = Math.max(0, Math.floor((ahora - desde) / 1000));
  return `${Math.floor(seg / 60)}:${String(seg % 60).padStart(2, "0")}`;
}

/** "cebolla" → "Sin cebolla"; "Sin cebolla" se queda igual. */
function textoSin(nombre: string): string {
  return /^sin\b/i.test(nombre.trim()) ? nombre : `Sin ${nombre}`;
}

export function PantallaKds({
  token,
  caja,
  onSalir,
  etiquetaSalir = "Salir",
  confirmarSalir,
}: {
  token: string;
  caja: CajaKds;
  onSalir: () => void;
  /** Texto del botón de salida. En la pantalla dedicada de cocina salir es desvincular. */
  etiquetaSalir?: string;
  /** Si salir cuesta algo (desvincular el dispositivo), se confirma antes con este texto, y el
   *  botón se guarda en Ajustes: un codazo no debe dejar la cocina sin pantalla. */
  confirmarSalir?: { titulo: string; mensaje: string; boton: string };
}) {
  const [comandas, setComandas] = useState<ComandaKds[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ahora, setAhora] = useState<number>(() => Date.now());
  const [esperas, setEsperas] = useState<Espera[]>([]);
  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);
  const [ajustesAbierto, setAjustesAbierto] = useState(false);
  const [areaSel, setAreaSel] = useState<string>(TODAS);
  const [altoContraste, setAltoContraste] = useState(false);
  const [sonido, setSonido] = useState(true);
  const [audioBloqueado, setAudioBloqueado] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [fallos, setFallos] = useState(0);
  const [ultimaOk, setUltimaOk] = useState<number | null>(null);
  const [pagina, setPagina] = useState(0);
  const montado = useRef(true);
  const idsPrevios = useRef<Set<string>>(new Set());
  const primeraCarga = useRef(true);
  const sonidoRef = useRef(sonido);
  sonidoRef.current = sonido;

  // Preferencias guardadas. En un efecto y no en el useState inicial: la pantalla se pinta en el
  // servidor (Next) y ahí no hay localStorage.
  useEffect(() => {
    const s = leerPref(PREF.sonido);
    if (s != null) setSonido(s === "1");
    setAltoContraste(leerPref(PREF.contraste) === "1");
    const a = leerPref(PREF.area);
    if (a) setAreaSel(a);
  }, []);

  // El navegador no deja sonar nada hasta que alguien toca la pantalla. El primer toque, donde
  // sea, destraba el audio; mientras tanto se avisa en el encabezado.
  useEffect(() => {
    const ctx = contextoAudio();
    if (!ctx) return;
    setAudioBloqueado(ctx.state !== "running");
    const destrabar = () => {
      void ctx.resume().then(() => setAudioBloqueado(ctx.state !== "running")).catch(() => {});
    };
    window.addEventListener("pointerdown", destrabar);
    return () => window.removeEventListener("pointerdown", destrabar);
  }, []);

  const avisar = useCallback((texto: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(texto);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  }, []);

  const enCurso = useRef(false);
  const recargar = useCallback(async () => {
    // Una lectura a la vez: si la anterior no ha terminado, esta se salta.
    if (enCurso.current) return;
    enCurso.current = true;
    let limite: ReturnType<typeof setTimeout> | undefined;
    try {
      const c = await Promise.race([
        leerComandas(token, caja.sucursal_id),
        new Promise<never>((_, rechazar) => {
          limite = setTimeout(() => rechazar(new Error("La caja no respondió")), LECTURA_MAX_MS);
        }),
      ]);
      if (!montado.current) return;
      // Detectar comandas nuevas para sonido + aviso (no en la primera carga).
      const ids = c.map((x) => x.ticketId);
      if (!primeraCarga.current) {
        const nuevas = comandasNuevas(idsPrevios.current, ids);
        if (nuevas > 0) {
          if (sonidoRef.current) sonarNuevoPedido();
          avisar(`${nuevas} ${nuevas === 1 ? "pedido nuevo" : "pedidos nuevos"}`);
        }
      }
      idsPrevios.current = new Set(ids);
      primeraCarga.current = false;
      setComandas(c);
      setFallos(0);
      setUltimaOk(Date.now());
    } catch {
      // Ya no se enseña el mensaje crudo de la base: sin conexión se dice en grande, arriba.
      if (montado.current) setFallos((f) => f + 1);
    } finally {
      if (limite) clearTimeout(limite);
      enCurso.current = false;
    }
  }, [token, caja.sucursal_id, avisar]);

  // Polling de comandas (respaldo robusto; el SSE del hub da el tiempo real)
  useEffect(() => {
    montado.current = true;
    recargar();
    const id = setInterval(recargar, REFRESCO_MS);
    return () => {
      montado.current = false;
      clearInterval(id);
    };
  }, [recargar]);

  // Tiempo real por SSE cuando el KDS corre contra la caja-hub de escritorio: al cambiar un ticket
  // de estado de cocina, recarga al instante (sin esperar el polling). Solo en el desktop
  // (window.__VIM_DESKTOP); en navegador/nube no aplica (sin endpoint).
  useEffect(() => {
    const w = typeof window !== "undefined" ? (window as unknown as { __VIM_SUPABASE_URL?: string; __VIM_DESKTOP?: boolean }) : undefined;
    if (!w?.__VIM_DESKTOP || !w.__VIM_SUPABASE_URL || typeof EventSource === "undefined") return;
    const es = new EventSource(`${w.__VIM_SUPABASE_URL}/kds/stream?sucursal=${caja.sucursal_id}`);
    es.addEventListener("cocina", () => { recargar(); });
    es.onerror = () => { /* EventSource reconecta solo; el polling cubre el hueco */ };
    return () => es.close();
  }, [recargar, caja.sucursal_id]);

  // Tick del reloj (1s) para los cronómetros, sin re-leer BD
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // El timer de un LISTO se crea en un render y dispara 5 s después: tiene que llamar al
  // `recargar` vigente, no al de aquel render (cambia con el sonido o la sucursal).
  const recargarRef = useRef(recargar);
  recargarRef.current = recargar;

  // Al desmontar se sueltan los LISTO pendientes SIN mandarlos: la orden reaparece al volver. Es
  // la falla segura — mandar un cierre que nadie alcanzó a deshacer sería la peligrosa.
  useEffect(() => {
    const t = timers.current;
    return () => {
      for (const id of t.values()) clearTimeout(id);
      t.clear();
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  function quitarEspera(id: string) {
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
    setEsperas((es) => es.filter((e) => e.id !== id));
  }

  async function mandarListo(e: Espera) {
    timers.current.delete(e.id);
    try {
      const todas = e.area === TODAS;
      await marcarListoCocina(token, e.ticketId, todas ? null : areaParaRpc(e.area), todas);
      setError(null);
      await recargarRef.current();
    } catch {
      setError(`No se pudo marcar #${e.folioCorto} como lista. Sigue en pantalla: vuelve a tocar LISTO.`);
      await recargarRef.current();
    } finally {
      // Se quita DESPUÉS de recargar: antes, la tarjeta volvía un instante con los datos viejos.
      setEsperas((es) => es.filter((x) => x.id !== e.id));
    }
  }

  /** LISTO: oculta la tarjeta en esta vista y la manda en 5 s, salvo que se deshaga. */
  function listo(c: ComandaKds) {
    const e: Espera = { id: `${c.ticketId}:${areaSel}:${Date.now()}`, ticketId: c.ticketId, area: areaSel, folioCorto: c.folioCorto };
    setEsperas((es) => [...es, e]);
    timers.current.set(e.id, setTimeout(() => { void mandarListo(e); }, DESHACER_MS));
  }

  function elegirArea(a: string) {
    setAreaSel(a);
    setPagina(0);
    guardarPref(PREF.area, a);
  }

  const tema = altoContraste ? TEMA_CONTRASTE : TEMA_NORMAL;
  const sinConexion = fallos >= FALLOS_SIN_CONEXION;

  // Áreas con algo pendiente + la vista del filtro (ADR 0018). El área elegida se queda en la
  // barra aunque ya no tenga pendientes: antes la barra desaparecía con el filtro puesto y no
  // había cómo volver a "Todas".
  const areas = comandas ? areasDeComandas(comandas) : [];
  const areasBarra = areaSel !== TODAS && !areas.includes(areaSel) ? [...areas, areaSel] : areas;
  const hayAreas = areas.length > 1 || areaSel !== TODAS;
  const comandasFiltradas: ComandaVista[] = useMemo(() => {
    const ocultas = (ticketId: string) => esperas.some((e) => e.ticketId === ticketId && (e.area === areaSel || e.area === TODAS));
    return vistaDeArea(comandas ?? [], areaSel).filter((c) => !ocultas(c.ticketId));
  }, [comandas, areaSel, esperas]);
  const cuantasPorArea = (a: string) => vistaDeArea(comandas ?? [], a).length;

  // ── Paginación: tarjetas completas, nunca cortadas ─────────────────────────────────────────
  // Antes el cuerpo hacía scroll y las tarjetas se cortaban por abajo, en una pantalla sin mouse.
  // Ahora cada tarjeta se mide en una capa invisible y se acomodan por filas en páginas; la
  // página 1 son las más viejas, y al cerrar una, la siguiente en espera entra sola.
  const zonaRef = useRef<HTMLDivElement>(null);
  const [zona, setZona] = useState({ ancho: 0, alto: 0 });
  useLayoutEffect(() => {
    const el = zonaRef.current;
    if (!el) return;
    const medir = () => setZona({ ancho: el.clientWidth, alto: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const PADDING = 16;
  const anchoUtil = Math.max(0, zona.ancho - PADDING * 2);
  const columnas = columnasKds(anchoUtil, GAP);
  const anchoTarjeta = columnas > 0 ? (anchoUtil - GAP * (columnas - 1)) / columnas : anchoUtil;

  const medidasRef = useRef<HTMLDivElement>(null);
  const [alturas, setAlturas] = useState<number[]>([]);
  useLayoutEffect(() => {
    const capa = medidasRef.current;
    if (!capa) return;
    const nuevas = Array.from(capa.children).map((n) => (n as HTMLElement).offsetHeight);
    setAlturas((prev) => (prev.length === nuevas.length && prev.every((h, i) => h === nuevas[i]) ? prev : nuevas));
  });

  const altoTotal = Math.max(0, zona.alto - PADDING * 2);
  const paginas = useMemo(() => {
    if (alturas.length !== comandasFiltradas.length || alturas.length === 0) return [comandasFiltradas.map((_, i) => i)];
    const sinBarra = paginarPorFilas(alturas, columnas, altoTotal, GAP);
    // Si no cabe todo, aparece la barra de páginas y le quita alto al cuerpo: se reparte otra vez
    // contando con ella. Quitar alto nunca reduce páginas, así que no oscila.
    return sinBarra.length > 1 ? paginarPorFilas(alturas, columnas, altoTotal - ALTO_BARRA, GAP) : sinBarra;
  }, [alturas, comandasFiltradas, columnas, altoTotal]);
  const totalPaginas = paginas.length;
  const paginaActual = Math.min(pagina, totalPaginas - 1);
  const enPantalla = (paginas[paginaActual] ?? []).map((i) => comandasFiltradas[i]).filter((c): c is ComandaVista => c != null);
  const enEspera = comandasFiltradas.length - (paginas[0]?.length ?? 0);
  const altoMaxTarjeta = totalPaginas > 1 ? altoTotal - ALTO_BARRA : altoTotal;

  // Nadie se queda viendo la página 2 mientras la 1 se pone roja.
  useEffect(() => {
    if (paginaActual === 0) return;
    const t = setTimeout(() => setPagina(0), VOLVER_A_PRIMERA_MS);
    return () => clearTimeout(t);
  }, [paginaActual]);

  const pendientes = comandasFiltradas.length;
  const estacion = areaSel === TODAS ? "Todas las estaciones" : `Estación ${areaSel}`;

  const botonEncabezado =
    "inline-flex h-12 items-center gap-2 rounded-lg border px-4 text-[18px] font-semibold transition-[transform,background-color,color] duration-150 ease-vim active:scale-[0.97]";

  return (
    <div className="flex h-screen flex-col" style={{ background: tema.bg, color: tema.text }}>
      {/* Encabezado */}
      <header className="flex h-[72px] flex-shrink-0 items-center justify-between gap-4 border-b px-5" style={{ borderColor: tema.line }}>
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#F0F0EC]">
            <span className="font-display text-[20px] font-extrabold text-[#16161A]">V</span>
          </div>
          <div className="min-w-0">
            <div className="font-display text-[22px] font-bold leading-tight tracking-[-0.01em]">Cocina</div>
            <div className="truncate text-[16px] font-medium" style={{ color: tema.text2 }}>
              {pendientes} {pendientes === 1 ? "comanda" : "comandas"} · {estacion}
            </div>
          </div>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2.5">
          {/* Estado de la conexión, siempre a la vista: un punto verde es lo que dice que lo que se
              ve es de ahora. */}
          <span className="inline-flex items-center gap-2 px-2 text-[16px] font-semibold" style={{ color: sinConexion ? "#FF8A80" : tema.text2 }}>
            <span className="h-3 w-3 rounded-full" style={{ background: sinConexion ? "#E04040" : "#8FE0AE" }} aria-hidden="true" />
            {sinConexion ? "Sin conexión" : "En línea"}
          </span>
          {sonido && audioBloqueado && (
            <button
              type="button"
              onClick={() => { void contextoAudio()?.resume().then(() => setAudioBloqueado(false)).catch(() => {}); }}
              className={`${botonEncabezado} border-[#D4A017] text-[#F2CB5C]`}
            >
              Activar sonido
            </button>
          )}
          <button
            type="button"
            onClick={() => setSonido((s) => { guardarPref(PREF.sonido, s ? "0" : "1"); return !s; })}
            aria-pressed={sonido}
            aria-label={sonido ? "Sonido encendido" : "Sonido apagado"}
            className={botonEncabezado}
            style={{ borderColor: tema.line, color: tema.text }}
          >
            {sonido ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4V5z" /><path d="M23 9l-6 6M17 9l6 6" /></svg>
            )}
            Sonido
          </button>
          <button
            type="button"
            onClick={() => setAltoContraste((v) => { guardarPref(PREF.contraste, v ? "0" : "1"); return !v; })}
            aria-pressed={altoContraste}
            className={botonEncabezado}
            style={altoContraste ? { borderColor: "#FFFFFF", background: "#FFFFFF", color: "#000000" } : { borderColor: tema.line, color: tema.text }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-[22px] w-[22px]" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" /></svg>
            Contraste
          </button>
          {confirmarSalir ? (
            <div className="relative">
              <button
                type="button"
                onClick={() => setAjustesAbierto((v) => !v)}
                aria-label="Ajustes"
                aria-expanded={ajustesAbierto}
                className={`${botonEncabezado} w-12 justify-center px-0`}
                style={{ borderColor: tema.line, color: tema.text }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></svg>
              </button>
              {ajustesAbierto && (
                <div className="absolute right-0 top-14 z-40 w-72 rounded-lg border p-2 shadow-2xl" style={{ background: tema.surface, borderColor: tema.line }}>
                  <button
                    type="button"
                    onClick={() => { setAjustesAbierto(false); setConfirmandoSalir(true); }}
                    className="flex h-14 w-full items-center rounded-md px-4 text-left text-[18px] font-semibold text-[#FF8A80] transition-colors duration-150 hover:bg-white/5"
                  >
                    {etiquetaSalir} esta pantalla
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button type="button" onClick={onSalir} className={botonEncabezado} style={{ borderColor: tema.line, color: tema.text }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-[22px] w-[22px]" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
              {etiquetaSalir}
            </button>
          )}
        </div>
      </header>

      {/* Sin conexión: franja roja que se ve a dos metros. Antes era una línea de 13 px y la
          pantalla seguía igual, como una cocina tranquila. */}
      {sinConexion && (
        <div role="alert" className="flex min-h-16 flex-shrink-0 flex-wrap items-center gap-x-4 gap-y-1 bg-[#E04040] px-5 py-2 text-white">
          <span className="font-display text-[24px] font-extrabold tracking-[0.02em]">SIN CONEXIÓN</span>
          <span className="text-[18px] font-semibold">
            {ultimaOk ? `Última actualización hace ${haceCuanto(ultimaOk, ahora)}` : "No se han podido leer las comandas"} · reintentando cada 5 s
          </span>
        </div>
      )}

      {/* Filtro por estación (solo si hay más de una) */}
      {hayAreas && (
        <nav className="flex h-[72px] flex-shrink-0 items-center gap-2.5 overflow-x-auto border-b px-5" style={{ borderColor: tema.line }}>
          {[TODAS, ...areasBarra].map((a) => {
            const activa = areaSel === a;
            return (
              <button
                key={a}
                type="button"
                onClick={() => elegirArea(a)}
                aria-pressed={activa}
                className="inline-flex h-12 flex-shrink-0 items-center gap-2.5 rounded-full px-5 text-[18px] font-bold transition-colors duration-150"
                style={activa ? { background: "#F0F0EC", color: "#16161A" } : { background: tema.surface, color: tema.text }}
              >
                {a === TODAS ? "Todas" : a}
                <span className="tabular-nums opacity-70">{cuantasPorArea(a)}</span>
              </button>
            );
          })}
        </nav>
      )}

      {/* Aviso de pedido nuevo */}
      {toast && (
        <div role="status" className="pointer-events-none fixed left-1/2 top-24 z-50 -translate-x-1/2 animate-vim-pop rounded-full bg-[#F0F0EC] px-6 py-3 text-[20px] font-bold text-[#16161A] shadow-2xl motion-reduce:animate-none">
          {toast}
        </div>
      )}

      {error && (
        <div className="mx-5 mt-3 flex flex-shrink-0 items-center gap-3 rounded-lg border border-[#5A2E2E] bg-[#2A1A1A] px-4 py-3 text-[18px] font-semibold text-[#FF8A80]" role="alert">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={() => setError(null)} aria-label="Cerrar aviso" className="h-11 rounded-md px-3 text-[18px] font-bold">
            ✕
          </button>
        </div>
      )}

      {/* Cuerpo: se mide para saber cuántas tarjetas completas caben */}
      <div ref={zonaRef} className="relative min-h-0 flex-1 overflow-hidden">
        {/* Capa de medición: las mismas tarjetas, invisibles, al ancho real de una columna. */}
        <div
          ref={medidasRef}
          aria-hidden="true"
          className="pointer-events-none invisible absolute left-0 top-0 flex flex-col"
          style={{ width: anchoTarjeta }}
        >
          {comandasFiltradas.map((c) => (
            <Tarjeta key={c.ticketId} c={c} ahora={ahora} tema={tema} areaSel={areaSel} medir />
          ))}
        </div>

        {comandas === null && <p className="p-8 text-center text-[18px]" style={{ color: tema.text2 }}>Cargando comandas…</p>}
        {comandas !== null && comandasFiltradas.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
            <svg viewBox="0 0 24 24" fill="none" stroke={tema.text3} strokeWidth="1.5" className="h-14 w-14" aria-hidden="true"><path d="M3 11l18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
            <p className="text-[22px] font-semibold" style={{ color: tema.text2 }}>Sin pedidos pendientes</p>
            <p className="text-[18px]" style={{ color: tema.text2 }}>Los nuevos pedidos aparecerán aquí solos.</p>
          </div>
        )}
        {enPantalla.length > 0 && (
          <div
            className="grid items-start"
            style={{ padding: PADDING, gap: GAP, gridTemplateColumns: `repeat(${columnas}, minmax(0, 1fr))` }}
          >
            {enPantalla.map((c) => (
              <Tarjeta
                key={c.ticketId}
                c={c}
                ahora={ahora}
                tema={tema}
                areaSel={areaSel}
                atenuada={sinConexion}
                altoMax={altoMaxTarjeta}
                onListo={() => listo(c)}
              />
            ))}
          </div>
        )}

        {/* Barra de páginas: solo cuando no cabe todo */}
        {totalPaginas > 1 && (
          <footer
            className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-4 border-t px-5"
            style={{ height: ALTO_BARRA, background: tema.bg, borderColor: tema.line }}
          >
            <div className="min-w-0">
              {paginaActual === 0 ? (
                <>
                  <div className="font-display text-[22px] font-extrabold tabular-nums">{enEspera} en espera</div>
                  <div className="truncate text-[16px] font-medium" style={{ color: tema.text2 }}>Entran solas conforme se cierran las de arriba</div>
                </>
              ) : (
                <>
                  <div className="font-display text-[22px] font-extrabold">Viendo la página {paginaActual + 1}</div>
                  <div className="truncate text-[16px] font-medium" style={{ color: tema.text2 }}>Vuelve sola a la primera en 20 s</div>
                </>
              )}
            </div>
            <div className="flex flex-shrink-0 items-center gap-3">
              <button
                type="button"
                aria-label="Página anterior"
                disabled={paginaActual === 0}
                onClick={() => setPagina(paginaActual - 1)}
                className="flex h-14 w-[72px] items-center justify-center rounded-lg border transition-transform duration-150 ease-vim active:scale-[0.97] disabled:opacity-40"
                style={{ borderColor: paginaActual === 0 ? tema.line : tema.text, color: tema.text }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[26px] w-[26px]" aria-hidden="true"><path d="M15 18l-6-6 6-6" /></svg>
              </button>
              <span className="min-w-[72px] text-center text-[20px] font-bold tabular-nums">{paginaActual + 1} de {totalPaginas}</span>
              <button
                type="button"
                aria-label="Página siguiente"
                disabled={paginaActual >= totalPaginas - 1}
                onClick={() => setPagina(paginaActual + 1)}
                className="flex h-14 w-[72px] items-center justify-center rounded-lg border transition-transform duration-150 ease-vim active:scale-[0.97] disabled:opacity-40"
                style={{ borderColor: paginaActual >= totalPaginas - 1 ? tema.line : tema.text, color: tema.text }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className="h-[26px] w-[26px]" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
              </button>
            </div>
          </footer>
        )}
      </div>

      {/* LISTO en espera: "Deshacer" grande, a la mano durante 5 s. La barra de abajo se vacía en
          ese tiempo para que se vea cuánto queda. */}
      {esperas.length > 0 && (
        <div
          className="fixed left-1/2 z-50 flex w-[min(560px,calc(100%-2rem))] -translate-x-1/2 flex-col gap-2"
          // Por encima de la barra de páginas cuando está: si no, tapaba las flechas.
          style={{ bottom: totalPaginas > 1 ? ALTO_BARRA + 16 : 16 }}
          role="status"
        >
          {esperas.slice(-3).map((e) => (
            <div key={e.id} className="relative overflow-hidden rounded-lg bg-[#F0F0EC] text-[#16161A] shadow-2xl">
              <div className="flex items-center gap-3 py-2 pl-5 pr-2">
                <div className="min-w-0 flex-1">
                  <div className="font-display text-[20px] font-extrabold tabular-nums">#{e.folioCorto} lista</div>
                  {e.area !== TODAS && <div className="text-[16px] font-semibold text-[#4A4A50]">{e.area}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => quitarEspera(e.id)}
                  className="font-display h-14 rounded border-2 border-[#16161A] px-6 text-[18px] font-extrabold transition-transform duration-150 active:scale-[0.97]"
                >
                  Deshacer
                </button>
              </div>
              <div
                className="kds-cuenta absolute bottom-0 left-0 h-1 w-full origin-left bg-[#16161A]"
                style={{ animation: `kdsCuenta ${DESHACER_MS}ms linear forwards` }}
              />
            </div>
          ))}
        </div>
      )}

      {confirmandoSalir && confirmarSalir && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="kds-salir-titulo">
          <div className="w-full max-w-[440px] rounded-lg p-6" style={{ background: tema.surface }}>
            <h2 id="kds-salir-titulo" className="font-display text-[22px] font-bold">{confirmarSalir.titulo}</h2>
            <p className="mt-2 text-[18px] leading-snug" style={{ color: tema.text2 }}>{confirmarSalir.mensaje}</p>
            <div className="mt-6 flex gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => setConfirmandoSalir(false)}
                className="font-display h-14 flex-1 rounded border text-[18px] font-bold"
                style={{ borderColor: tema.line, color: tema.text }}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => { setConfirmandoSalir(false); onSalir(); }}
                className="font-display h-14 flex-1 rounded bg-[#C0392B] text-[18px] font-bold text-white"
              >
                {confirmarSalir.boton}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes kdsCuenta { from { transform: scaleX(1) } to { transform: scaleX(0) } }
@media (prefers-reduced-motion: reduce) { .kds-cuenta { animation: none !important } }`}</style>
    </div>
  );
}

/**
 * Una comanda. Arriba, la franja del tiempo (el único color de la tarjeta); debajo, de dónde viene
 * y qué lleva. `medir` la pinta para la capa invisible que decide cuántas caben: igual, pero sin
 * botón real ni animación.
 */
function Tarjeta({
  c,
  ahora,
  tema,
  areaSel,
  medir = false,
  atenuada = false,
  altoMax,
  onListo,
}: {
  c: ComandaVista;
  ahora: number;
  tema: Tema;
  areaSel: string;
  medir?: boolean;
  atenuada?: boolean;
  altoMax?: number;
  onListo?: () => void;
}) {
  const min = minutosEnCocina(c.fechaEnvio, ahora);
  const estado = estadoDelTiempo(min);
  const f = FRANJA[estado];
  const nueva = c.fechaEnvio != null && ahora - new Date(c.fechaEnvio).getTime() < NUEVA_MS;
  // "Mesa · Mesa 1" dice lo mismo dos veces: con el número de mesa basta.
  const modo = labelModo(c.modoServicio);
  const origen = c.detalle?.startsWith("Mesa ") && modo === "Mesa" ? c.detalle : [modo, c.detalle].filter(Boolean).join(" · ");
  const etiquetaListo = areaSel === TODAS ? "LISTO" : `LISTO · ${areaSel}`;
  const claseListo =
    "font-display flex h-16 w-full items-center justify-center rounded-lg bg-[#F0F0EC] text-[22px] font-extrabold tracking-[0.04em] text-[#16161A]";

  return (
    <article
      className={[
        "flex flex-col overflow-hidden rounded-[10px]",
        medir ? "" : "animate-vim-pop motion-reduce:animate-none",
      ].join(" ")}
      style={{
        background: tema.surface,
        boxShadow: nueva ? "0 0 0 3px #F0F0EC" : undefined,
        opacity: atenuada ? 0.5 : 1,
        maxHeight: medir ? undefined : altoMax,
      }}
    >
      {/* Franja del tiempo */}
      <div
        className="flex h-16 flex-shrink-0 items-center justify-between gap-3 pl-[18px] pr-4"
        style={{ background: f.bg ?? tema.franja, color: f.fg }}
      >
        {/* El folio es lo que el cocinero canta: nunca se corta. Lo que cede, si falta ancho, es la
            etiqueta NUEVA; y TARDE va ENCIMA del reloj, no al lado, para que a 300 px quepan los
            tres sin encimarse. */}
        <div className="flex min-w-0 items-center gap-2 overflow-hidden">
          <span className="flex-shrink-0 font-display text-[28px] font-extrabold leading-none tabular-nums">#{c.folioCorto}</span>
          {nueva && (
            <span className="min-w-0 truncate rounded-full bg-[#F0F0EC] px-2.5 text-[16px] font-extrabold leading-7 text-[#16161A]">NUEVA</span>
          )}
        </div>
        <div className="flex flex-shrink-0 flex-col items-end justify-center">
          {estado === "tarde" && <span className="font-display text-[16px] font-extrabold leading-none tracking-[0.08em]">TARDE</span>}
          <span
            className={`font-display font-extrabold leading-none tabular-nums ${estado === "tarde" ? "mt-0.5 text-[30px]" : "text-[34px]"}`}
            style={{ color: f.reloj }}
          >
            {reloj(c.fechaEnvio, ahora)}
          </span>
        </div>
      </div>

      {/* De dónde viene: en su renglón, neutro. En la franja se cortaba en una tarjeta angosta, y
          con color propio Rappi se veía como una comanda tardada. */}
      <div className="px-[18px] pt-3 text-[18px] font-semibold leading-snug text-[#C8C8CC]">{origen}</div>

      {/* Nota de TODA la orden */}
      {c.notaOrden && (
        <div className="mx-[18px] mt-3 rounded-md bg-[#3A2F12] px-3.5 py-2.5 text-[20px] font-bold leading-snug text-[#F2CB5C]">
          {c.notaOrden}
        </div>
      )}

      {/* Renglones: los de un combo, juntos bajo su nombre */}
      <div className="min-h-0 flex-1 overflow-y-auto px-[18px]">
        {bloquesDeComanda(c.items).map((b, bi) => (
          <div key={`${b.combo ?? "suelto"}-${bi}`}>
            {b.combo && (
              <div className="pb-0.5 pt-3.5 text-[16px] font-bold uppercase tracking-[0.06em]" style={{ color: tema.text2 }}>{b.combo}</div>
            )}
            {b.items.map((it) => (
              <Renglon key={it.id} it={it} enCombo={b.combo != null} tema={tema} />
            ))}
          </div>
        ))}
      </div>

      {/* La orden sigue viva en otras estaciones: que la plancha lo sepa aunque la tarjeta salga
          de su pantalla al marcar LISTO. */}
      {c.otrasPendientes.length > 0 && (
        <div className="px-[18px] pt-3 text-[18px] font-semibold" style={{ color: tema.text2 }}>
          Falta en {c.otrasPendientes.join(", ")}
        </div>
      )}

      {/* LISTO en blanco y no en verde: el color de la tarjeta es solo el tiempo. Marca lo de esta
          vista (una estación, o todo) y se manda en 5 s si no se deshace. */}
      <div className="flex-shrink-0 p-3.5">
        {medir ? (
          <div className={claseListo}>{etiquetaListo}</div>
        ) : (
          <button
            type="button"
            onClick={onListo}
            className={`${claseListo} transition-[transform,background-color] duration-150 ease-vim hover:bg-white active:scale-[0.97]`}
          >
            {etiquetaListo}
          </button>
        )}
      </div>
    </article>
  );
}

function Renglon({ it, enCombo, tema }: { it: ItemComanda; enCombo: boolean; tema: Tema }) {
  return (
    <div
      className={["flex gap-3 border-b py-3 last:border-b-0", enCombo ? "ml-1 border-l-[3px] border-l-[#4A4A52] pl-3.5" : ""].join(" ")}
      style={{ borderBottomColor: "#34343A", opacity: it.listo ? 0.4 : 1 }}
    >
      {/* La cantidad solo cuando es más de uno: un "1" de 30 px en cada renglón era ruido. */}
      {it.cantidad > 1 && (
        <span className="font-display h-9 min-w-12 flex-shrink-0 self-start rounded-md bg-[#F0F0EC] px-2 text-center text-[22px] font-extrabold leading-9 text-[#16161A] tabular-nums">
          {it.cantidad}×
        </span>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className={`text-[24px] font-bold leading-tight ${it.listo ? "line-through" : ""}`}>{it.nombre}</div>
        {it.listo && <div className="text-[18px] font-bold text-[#8FE0AE]">✓ Listo · {it.area ?? SIN_AREA}</div>}
        {/* Lo que se QUITA, en negritas y primero: confundirlo con un extra es el error caro. */}
        {it.sin.map((s) => (
          <div key={`sin-${s}`} className="text-[20px] font-extrabold leading-snug" style={{ color: tema.text }}>{textoSin(s)}</div>
        ))}
        {it.modificadores.length > 0 && (
          <div className="text-[20px] font-medium leading-snug text-[#C8C8CC]">{it.modificadores.join(" · ")}</div>
        )}
        {it.notaCocina && <div className="text-[20px] font-semibold leading-snug text-[#F2CB5C]">“{it.notaCocina}”</div>}
      </div>
    </div>
  );
}
