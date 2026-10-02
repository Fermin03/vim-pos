"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { abrirCanal, SILENCIO_MS } from "../lib/pantalla-cliente/canal";
import { leerMensaje, type Negocio, type RenglonCliente, type VistaCliente } from "../lib/pantalla-cliente/vista";
import { fmtMxn } from "../lib/turno";

/** El negocio se recuerda entre arranques: por la mañana, antes de que entre el cajero, nadie
 *  publica nada y la pantalla igual tiene que enseñar el logo. */
const CLAVE_NEGOCIO = "vim.pantalla-cliente.negocio";

function negocioGuardado(): Negocio | null {
  try {
    const n: unknown = JSON.parse(localStorage.getItem(CLAVE_NEGOCIO) ?? "null");
    if (n && typeof n === "object" && "nombre" in n && typeof n.nombre === "string") {
      const logoUrl = "logoUrl" in n && typeof n.logoUrl === "string" ? n.logoUrl : null;
      return { nombre: n.nombre, logoUrl };
    }
  } catch { /* sin almacenamiento o con basura: se espera al saludo de la caja */ }
  return null;
}

/*
 * Movimiento. Solo dos cosas se mueven y las dos son entradas, con `--ease-out` y 200 ms:
 * el fundido al cambiar de fase y el renglón recién agregado. Las cifras NO se animan nunca:
 * esta pantalla cambia con cada toque del cajero y el total nuevo tiene que estar ahí al instante.
 * Con `prefers-reduced-motion` no se mueve nada.
 */
const FUNDIDO_FASE = "animate-[vim-fade_200ms_var(--ease-out)] motion-reduce:animate-none";
const ENTRADA_RENGLON = "animate-vim-pop motion-reduce:animate-none";

/** Ancho de una cifra en `em`, estimado por lo alto para Sora bold con cifras tabulares (el cero
 *  de Sora mide 0.74 em). Si la estimación falla, que sobre margen y no que se corte un dígito. */
function anchoEm(texto: string): number {
  let em = 0;
  for (const c of texto) em += c >= "0" && c <= "9" ? 0.76 : c === "," || c === "." ? 0.3 : 0.7;
  return em;
}

/**
 * Tamaño de letra de una cifra grande: `tope` en vmin, o menos si a ese tamaño no cabe en `ancho`.
 *
 * En un monitor vertical o casi cuadrado el ancho ES 100vmin, y "$1,234.50" a 16vmin ya lo roza.
 * Una cifra cortada por el borde no es un detalle feo: es un total falso de cara al cliente.
 */
function tamanoCifra(texto: string, tope: number, ancho: string): string {
  return `min(${tope}vmin, calc((${ancho}) / ${anchoEm(texto).toFixed(2)}))`;
}

/**
 * Lo que ve el cliente en el segundo monitor. Solo dibuja lo que la caja le publica: no inicia
 * sesión ni lee la base.
 *
 * Diseño: `docs/diseno/pantalla-cliente.md`. Todo mide en `vmin` porque el monitor puede ser
 * horizontal, vertical o casi cuadrado; nadie lo toca (sin cursor, sin selección, sin scroll).
 */
export function PantallaCliente() {
  const [vista, setVista] = useState<VistaCliente>({ fase: "reposo" });
  const [negocio, setNegocio] = useState<Negocio | null>(null);

  useEffect(() => {
    setNegocio(negocioGuardado());
    const canal = abrirCanal();
    if (!canal) return;
    let silencio: ReturnType<typeof setTimeout> | undefined;
    canal.onmessage = (e) => {
      const m = leerMensaje(e.data);
      if (!m) return; // lo que no se entiende se ignora; queda lo último válido
      if (m.tipo === "negocio") {
        const n = { nombre: m.nombre, logoUrl: m.logoUrl };
        setNegocio(n);
        try { localStorage.setItem(CLAVE_NEGOCIO, JSON.stringify(n)); } catch { /* */ }
        return;
      }
      if (m.tipo !== "estado") return;
      setVista(m.vista);
      clearTimeout(silencio);
      // Si la caja se cuelga o se recarga a media cuenta, deja de latir: a los 15 s se vuelve a
      // reposo para no dejarle la cuenta de un cliente al siguiente.
      if (m.vista.fase !== "reposo") silencio = setTimeout(() => setVista({ fase: "reposo" }), SILENCIO_MS);
    };
    canal.postMessage({ tipo: "hola", v: 1 });
    return () => { clearTimeout(silencio); canal.onmessage = null; canal.close(); };
  }, []);

  return (
    <main className="flex h-screen w-screen cursor-none select-none flex-col overflow-hidden bg-bg text-ink" data-fase={vista.fase}>
      {/* La `key` es la fase: al cambiar se monta de nuevo y vuelve a correr el fundido. Dentro de
          una misma fase nada se remonta, así que agregar un artículo no funde la pantalla. */}
      <div key={vista.fase} className={`flex min-h-0 flex-1 flex-col ${FUNDIDO_FASE}`}>
        {vista.fase === "reposo" && <Reposo negocio={negocio} />}
        {vista.fase === "cuenta" && <Cuenta renglones={vista.renglones} envio={vista.envio} total={vista.total} />}
        {vista.fase === "cobro" && <Cobro total={vista.total} />}
        {vista.fase === "pagado" && <Pagado cambio={vista.cambio} />}
      </div>
    </main>
  );
}

function Reposo({ negocio }: { negocio: Negocio | null }) {
  const logoUrl = negocio?.logoUrl ?? null;
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[4vmin] p-[6vmin] text-center">
      {logoUrl ? (
        // Alto fijo en vmin y no el tamaño natural de la imagen: un logo de 200 px se vería bien
        // en un monitor de 768 y como una estampilla en uno 4K.
        // eslint-disable-next-line @next/next/no-img-element -- data URI local: sin red, sin optimizador
        <img src={logoUrl} alt="" draggable={false} className="h-[34vmin] w-auto max-w-[72vmin] object-contain" />
      ) : null}
      {negocio && (
        // Sin logo, el nombre es lo único que hay en pantalla: crece para llenar ese papel.
        <h1 className={`max-w-[88vmin] text-balance break-words font-display font-semibold leading-tight tracking-[-0.02em] ${logoUrl ? "text-[7vmin]" : "text-[10vmin]"}`}>
          {negocio.nombre}
        </h1>
      )}
    </section>
  );
}

/** La cifra que manda en la fase: lo más grande de la pantalla. */
function CifraGrande({ monto, className = "" }: { monto: number; className?: string }) {
  const texto = fmtMxn(monto);
  return (
    <p
      className={`whitespace-nowrap font-display font-bold leading-none tabular-nums tracking-[-0.03em] ${className}`}
      // 12vmin: los 6vmin de margen de la sección, a cada lado.
      style={{ fontSize: tamanoCifra(texto, 16, "100vw - 12vmin") }}
    >
      {texto}
    </p>
  );
}

function Cobro({ total }: { total: number }) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-[2.5vmin] p-[6vmin] text-center">
      <h1 className="font-display text-[7vmin] font-semibold leading-tight tracking-[-0.02em]">Total a pagar</h1>
      <CifraGrande monto={total} />
    </section>
  );
}

function Pagado({ cambio }: { cambio: number }) {
  const hayCambio = cambio > 0;
  return (
    <section className="flex flex-1 flex-col items-center justify-center p-[6vmin] text-center">
      {/* La misma palomita del "Cobro completado" de la caja. Sin ella, cobro y pagado son el mismo
          dibujo —un letrero y una cifra— y de lejos «lo que debe» se confunde con «su cambio». */}
      <span className="flex h-[14vmin] w-[14vmin] items-center justify-center rounded-full bg-success-soft text-success">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className="h-[7vmin] w-[7vmin]" aria-hidden="true">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      </span>
      {/* Con cambio manda la cifra; sin cambio no hay cifra y el agradecimiento ocupa su lugar. */}
      <h1 className={`mt-[3vmin] font-display font-semibold leading-tight tracking-[-0.02em] ${hayCambio ? "text-[7vmin]" : "text-[12vmin]"}`}>
        ¡Gracias!
      </h1>
      {hayCambio ? (
        <>
          <p className="mt-[5vmin] text-[4vmin] font-medium text-ink-2">Su cambio</p>
          <CifraGrande monto={cambio} className="mt-[1vmin] text-success" />
        </>
      ) : (
        <p className="mt-[1vmin] text-[5vmin] text-ink-2">Vuelva pronto</p>
      )}
    </section>
  );
}

/** Lo que comparten los renglones: en horizontal la lista no se estira de orilla a orilla (la
 *  vista tendría que cruzar medio monitor del nombre al importe); en vertical ocupa todo. */
const COLUMNA = "mx-auto w-full max-w-[130vmin] px-[5vmin]";
const RENGLON = "flex items-baseline gap-[2.5vmin] border-t border-line py-[2vmin] text-[4vmin] leading-tight first:border-t-0";
const CANTIDAD = "min-w-[8vmin] shrink-0 text-right font-display font-semibold tabular-nums text-ink-2";
const IMPORTE = "shrink-0 whitespace-nowrap font-display font-semibold tabular-nums";

function Cuenta({ renglones, envio, total }: { renglones: RenglonCliente[]; envio: { nombre: string; importe: number } | null; total: number }) {
  const fin = useRef<HTMLLIElement | null>(null);
  // Lo que ya estaba al entrar a la fase llega con el fundido de la fase; solo se anima lo que se
  // agrega después. Se fija al montar y no cambia: así la clase de cada renglón es estable y su
  // entrada corre una sola vez, aunque la caja repita el estado cada 5 s.
  const [deEntrada] = useState(() => new Set(renglones.map((r) => r.id)));
  const [envioDeEntrada] = useState(() => envio !== null);

  // El último artículo agregado siempre queda a la vista, aunque la lista ya no quepa. Antes de
  // pintar, para que el renglón nuevo no aparezca un cuadro fuera de la pantalla; y con cada
  // estado que llega (no solo al cambiar el número de renglones), porque un renglón que crece
  // —dos líneas de detalle donde había una— también empuja al último.
  useLayoutEffect(() => {
    fin.current?.scrollIntoView({ block: "end" });
  }, [renglones, envio]);

  const textoTotal = fmtMxn(total);

  return (
    <>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ul className={`${COLUMNA} flex-1 overflow-hidden pt-[4vmin]`}>
          {renglones.map((r) => (
            <li key={r.id} className={`${RENGLON} ${deEntrada.has(r.id) ? "" : ENTRADA_RENGLON}`}>
              <span className={CANTIDAD}>{r.cantidad}×</span>
              <span className="min-w-0 flex-1">
                <span className="block break-words font-medium">{r.nombre}</span>
                {r.detalle.length > 0 && <span className="mt-[0.6vmin] block break-words text-[2.8vmin] leading-snug text-ink-2">{r.detalle.join(" · ")}</span>}
              </span>
              <span className={IMPORTE}>{fmtMxn(r.importe)}</span>
            </li>
          ))}
          {envio && (
            <li className={`${RENGLON} ${envioDeEntrada ? "" : ENTRADA_RENGLON}`}>
              <span className="min-w-[8vmin] shrink-0" />
              <span className="min-w-0 flex-1 break-words text-ink-2">Envío · {envio.nombre}</span>
              <span className={IMPORTE}>{fmtMxn(envio.importe)}</span>
            </li>
          )}
          <li ref={fin} aria-hidden className="h-[2vmin]" />
        </ul>
        {/* Cuando la lista ya no cabe, el renglón de arriba queda cortado por el borde. Se desvanece
            en vez de cortarse en seco. Mide lo mismo que el margen de arriba de la lista, así que
            mientras todo quepa no toca ningún renglón. */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[4vmin] bg-gradient-to-b from-bg to-bg/0" />
      </div>
      <footer className="border-t border-line-strong bg-surface">
        <div className={`${COLUMNA} flex items-baseline justify-between gap-[3vmin] py-[3.5vmin]`}>
          {/* El mismo bloque que el total del costado de la caja: etiqueta en versalitas, cifra en Sora. */}
          <span className="text-[4vmin] font-bold uppercase tracking-[0.04em]">Total</span>
          <span
            className="whitespace-nowrap font-display font-bold leading-none tabular-nums tracking-[-0.02em]"
            // 30vmin: los márgenes de la columna (10), la etiqueta (~15) y la separación (3), con holgura.
            style={{ fontSize: tamanoCifra(textoTotal, 11, "min(100vw, 130vmin) - 30vmin") }}
          >
            {textoTotal}
          </span>
        </div>
      </footer>
    </>
  );
}
