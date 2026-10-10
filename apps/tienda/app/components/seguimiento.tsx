"use client";
// El seguimiento en vivo de un pedido. La primera lectura NO sale del servidor: el código es la
// llave del pedido y no debe pasar por cachés ni por más registros de los necesarios. Aquí solo se
// pinta; el ritmo del sondeo y los pasos del recorrido están en lib/seguimiento.ts.
//
// El código nunca se escribe en la pantalla: «Copiar enlace» lo toma de la barra de direcciones.
import { useEffect, useState } from "react";
import Link from "next/link";
import { Aviso, botonClases, cn } from "@vim/ui/styles";
import { seguimiento } from "../lib/api";
import type { Seguimiento } from "../lib/contrato";
import { formatoMxn } from "../lib/dinero";
import { aLaHora, momentoMx } from "../lib/horario";
import { SONDEO_INICIAL, recorrido, sinConexion, sondear, tardando, terminado, type Paso, type Sondeo } from "../lib/seguimiento";
import { enlaceTel, enlaceWhatsApp, formatoTelefono } from "../lib/telefono";
import { textoDeError, textoDeEstado } from "../lib/textos";
import { Linea } from "./carrito";
import { Esqueleto, FOCO, PARTE, PRINCIPAL } from "./piezas";

const GHOST = cn(botonClases({ variant: "ghost" }), "h-12");

/** Copia al portapapeles; si el navegador no lo ofrece (o lo niega), con el método de antes. */
async function copiar(texto: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(texto);
    return true;
  } catch {
    const t = document.createElement("textarea");
    t.value = texto;
    t.setAttribute("readonly", "");
    t.style.cssText = "position:fixed;top:0;left:0;opacity:0";
    document.body.appendChild(t);
    t.select();
    try { return document.execCommand("copy"); } catch { return false; } finally { t.remove(); }
  }
}

function Recorrido({ pasos }: { pasos: Paso[] }) {
  return (
    <ol aria-label="Recorrido de tu pedido" className="flex flex-col">
      {pasos.map((p, i) => (
        <li key={p.estado} aria-current={p.fase === "actual" ? "step" : undefined} className="relative flex items-center gap-3 pb-6 last:pb-0">
          {/* La línea que une este paso con el siguiente: llena si ya se pasó por aquí. */}
          {i < pasos.length - 1 && <span aria-hidden="true" className={cn("absolute left-[11px] top-6 h-full w-0.5", p.fase === "hecho" ? "bg-ink" : "bg-line-strong")} />}
          <span aria-hidden="true" className={cn(
            "relative flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-200",
            p.fase === "pendiente" ? "border-line-strong bg-surface" : "border-ink bg-ink text-surface",
            // El paso en curso late (globals.css): la página se mira de reojo y así se ve que sigue viva.
            p.fase === "actual" && "latido",
          )}>
            {p.fase === "hecho" && <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>}
            {p.fase === "actual" && <span className="relative h-2 w-2 rounded-full bg-surface" />}
          </span>
          <span className={cn("text-16 leading-snug", p.fase === "actual" ? "font-semibold text-ink" : p.fase === "hecho" ? "text-ink-2" : "text-ink-3")}>
            {p.titulo}
            <span className="sr-only">{p.fase === "hecho" ? " (listo)" : p.fase === "actual" ? " (ahora)" : " (falta)"}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function Contacto({ telefono, folio }: { telefono: string | null; folio: string }) {
  const tel = enlaceTel(telefono), wa = enlaceWhatsApp(telefono, `Hola, tengo una duda con mi pedido ${folio}.`);
  if (!telefono) return null;
  if (!tel || !wa) return <p className="text-15 text-ink-2">Teléfono del restaurante: <span className="font-semibold text-ink">{telefono}</span></p>;
  return (
    <div className="grid grid-cols-2 gap-3">
      <a href={tel} className={GHOST} aria-label={`Llamar al restaurante: ${formatoTelefono(telefono)}`}>Llamar</a>
      <a href={wa} target="_blank" rel="noopener noreferrer" className={GHOST} aria-label="Escribir al restaurante por WhatsApp">WhatsApp</a>
    </div>
  );
}

function Pedido({ slug, pedido, sondeo }: { slug: string; pedido: Seguimiento; sondeo: Sondeo }) {
  const [copiado, setCopiado] = useState<boolean | null>(null);
  const texto = textoDeEstado(pedido.estado, pedido.motivo);
  const pasos = recorrido(pedido.modo, pedido.estado);
  const cancelado = pedido.estado === "CANCELADO";
  const recibido = new Date(pedido.recibido_at);
  const envio = formatoMxn(pedido.envio_total_mxn);

  return (
    <div className="flex flex-col gap-8 px-4 pb-10">
      <header className="flex flex-col gap-2">
        <p className="text-14 text-ink-2">
          Pedido <span className="font-display font-semibold tabular-nums text-ink">{pedido.folio_corto}</span>
          {!Number.isNaN(recibido.getTime()) && <>, recibido {aLaHora(momentoMx(recibido).hora)}</>}
        </p>
        {/* Lo que cambia solo se anuncia: el estado y su línea de apoyo, juntos. */}
        {/* La llave hace que el estado nuevo entre con un fundido corto: se nota que cambió sin que brinque. */}
        <div key={pedido.estado} aria-live="polite" aria-atomic="true" className="animate-vim-fade motion-reduce:animate-none">
          <h1 className={cn("font-display text-32 font-semibold leading-tight tracking-tight", cancelado && "text-danger")}>{texto.titulo}</h1>
          <p className="mt-2 text-16 leading-relaxed text-ink-2">{texto.apoyo}</p>
        </div>
        {sinConexion(sondeo) && <Aviso tono="warning" role="status" className="mt-2 !text-14">Sin conexión. Reintentando…</Aviso>}
      </header>

      {pasos && <Recorrido pasos={pasos} />}

      <section aria-label="El restaurante" className="flex flex-col gap-3">
        {/* Cancelado: arriba ya está el motivo; aquí solo cómo hablarle al restaurante. */}
        {!cancelado && (
          <p className={cn("text-15", PARTE)}>
            <span className="font-semibold">{pedido.sucursal.nombre}</span>
            <span className="text-ink-2">{pedido.modo === "RECOGER" ? ". Aquí recoges tu pedido." : ". De aquí sale tu pedido."}</span>
          </p>
        )}
        <Contacto telefono={pedido.sucursal.telefono} folio={pedido.folio_corto} />
      </section>

      <section aria-label="Tu pedido" className="rounded-lg border border-line bg-sel px-4 py-4">
        <h2 className="font-display text-18 font-semibold tracking-tight">Tu pedido</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {pedido.renglones.map((r, i) => (
            <li key={i} className="flex gap-3 text-16 leading-snug">
              <span className="w-7 flex-shrink-0 font-display font-semibold tabular-nums">{r.cantidad}×</span>
              <span className={cn("min-w-0", PARTE)}>
                {r.nombre}
                {r.detalle && <span className="mt-0.5 block text-14 text-ink-2">{r.detalle}</span>}
              </span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-2 border-t border-line pt-4">
          <Linea concepto="Subtotal" importe={formatoMxn(pedido.subtotal_mxn)} estimado={false} />
          {pedido.modo === "DOMICILIO" && envio && <Linea concepto="Envío" importe={envio} estimado={false} />}
          <Linea concepto="Total" importe={formatoMxn(pedido.total_mxn)} estimado={false} fuerte />
        </dl>
        {!cancelado && (
          <p className="mt-2 text-14 text-ink-2">
            {pedido.estado === "ENTREGADO" ? "Pagaste" : "Pagas"} {pedido.pago === "EFECTIVO" ? "en efectivo" : "con tarjeta"} al {pedido.modo === "RECOGER" ? "recoger" : "recibir"}.
          </p>
        )}
      </section>

      {terminado(sondeo) ? (
        <Link href={`/${slug}`} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>Pedir de nuevo</Link>
      ) : (
        <div className="flex flex-col items-start gap-1 border-t border-line pt-6">
          <p className="text-14 leading-relaxed text-ink-2">Guarda este enlace para volver a ver tu pedido.</p>
          <button type="button" onClick={async () => setCopiado(await copiar(location.href))}
            className={cn("inline-flex min-h-11 items-center text-15 font-medium text-ink underline underline-offset-4", FOCO)}>
            Copiar enlace
          </button>
          <p aria-live="polite" className="min-h-5 text-14 text-ink-2">
            {copiado === true ? "Enlace copiado." : copiado === false ? "No pudimos copiarlo. Copia la dirección desde la barra de tu navegador." : ""}
          </p>
        </div>
      )}
    </div>
  );
}

export function SeguimientoDelPedido({ slug, codigo }: { slug: string; codigo: string }) {
  const [sondeo, setSondeo] = useState<Sondeo>(SONDEO_INICIAL);
  /** «Reintentar ahora» arranca el sondeo de cero: lee en el acto, sin esperar su turno. */
  const [turno, setTurno] = useState(0);
  useEffect(() => sondear((senal) => seguimiento(slug, codigo, senal), setSondeo), [slug, codigo, turno]);

  if (sondeo.noEncontrado) {
    const t = textoDeError("PEDIDO_NO_ENCONTRADO");
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <h1 className="font-display text-20 font-semibold">{t.texto}</h1>
        <p className="text-16 text-ink-2">{t.hacer}</p>
        <Link href={`/${slug}`} className={cn(GHOST, "mt-3 px-5")}>Ver el menú</Link>
      </div>
    );
  }
  if (!sondeo.pedido) {
    return (
      <div className="flex flex-col gap-3 px-4 py-10" aria-live="polite">
        <h1 className="font-display text-24 font-semibold">Tu pedido</h1>
        {tardando(sondeo) ? (
          <>
            <p className="text-16 leading-relaxed text-ink-2">Estamos tardando en cargar tu pedido. Seguimos intentando…</p>
            <button type="button" onClick={() => { setSondeo(SONDEO_INICIAL); setTurno((n) => n + 1); }} className={cn(GHOST, "self-start px-5")}>Reintentar ahora</button>
          </>
        ) : (
          // El hueco del estado y del recorrido, del tamaño que van a tener: al llegar nada brinca.
          <>
            <p className="text-16 text-ink-2">Buscando tu pedido…</p>
            <Esqueleto className="mt-2 h-8 w-48" />
            <Esqueleto className="h-4 w-64 max-w-full" />
            <div className="mt-6 flex flex-col gap-6">
              {["w-32", "w-40", "w-28", "w-24"].map((ancho) => (
                <div key={ancho} className="flex items-center gap-3"><Esqueleto className="h-6 w-6 flex-shrink-0" /><Esqueleto className={cn("h-4", ancho)} /></div>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
  return <Pedido slug={slug} pedido={sondeo.pedido} sondeo={sondeo} />;
}
