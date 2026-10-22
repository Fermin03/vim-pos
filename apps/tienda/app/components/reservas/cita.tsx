"use client";
// La página de una cita (`/<negocio>/cita/<codigo>`): estado, datos y, a tiempo, «Cambiar horario» y
// «Cancelar cita». Tarde, el aviso con el WhatsApp del negocio. Como el seguimiento de un pedido, la
// lee el navegador: el código es la llave de la cita y no pasa por cachés ni se escribe en pantalla.
//
// TEXTOS PROVISIONALES: los revisa James.
import { useEffect, useState } from "react";
import { Aviso, StatusChip, botonClases, cn } from "@vim/ui/styles";
import { cancelarCita, confirmarPagoDeCita, moverCita, verCita } from "../../lib/api";
import type { Cita } from "../../lib/contrato";
import { aCentavos, formatoMxn } from "../../lib/dinero";
import { estadoDeCita, esperaPago, fechaLarga, horaDe, queSePuede, textoDeFallo } from "../../lib/reservas";
import { aLaHora } from "../../lib/horario";
import { enlaceWhatsApp } from "../../lib/telefono";
import { useAccion } from "../campo";
import { Esqueleto, FOCO, PARTE, PRINCIPAL } from "../piezas";
import { Horarios } from "./horarios";

const SECUNDARIO = cn("inline-flex h-12 w-full items-center justify-center rounded border border-line-strong px-4 font-display text-15 font-semibold text-ink hover:bg-hover disabled:opacity-50", FOCO);

export function PaginaDeCita({ slug, codigo, hoy, diasReserva }: { slug: string; codigo: string; hoy: string; diasReserva: number }) {
  const [cita, setCita] = useState<Cita | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [modo, setModo] = useState<"ver" | "cambiar" | "cancelar">("ver");
  const [nueva, setNueva] = useState<string | null>(null);
  const [hecho, setHecho] = useState<string | null>(null);
  /** Sube cuando el horario elegido ya no estaba: la lista se vuelve a pedir. */
  const [recarga, setRecarga] = useState(0);
  const accion = useAccion();

  useEffect(() => {
    const corte = new AbortController();
    void (async () => {
      let r = await verCita(slug, codigo, corte.signal);
      // Apartada esperando el anticipo: se le pregunta a Mercado Pago por si el pago ya pasó.
      if (r.ok && esperaPago(r.datos)) r = await confirmarPagoDeCita(slug, codigo, corte.signal);
      if (corte.signal.aborted) return;
      if (r.ok) setCita(r.datos); else setFallo(textoDeFallo(r));
    })();
    return () => corte.abort();
  }, [slug, codigo]);

  useEffect(() => { if (modo !== "ver") document.getElementById(`cita-${modo}`)?.focus(); }, [modo]);
  // Tras cancelar o cambiar, la sección que tenía el foco desaparece: el foco va al resultado.
  useEffect(() => { if (hecho) document.getElementById("cita-resultado")?.focus(); }, [hecho]);

  if (fallo) {
    return (
      <div className="px-4 py-12 text-center">
        <h1 className="font-display text-20 font-semibold">No pudimos abrir tu cita</h1>
        <p className="mt-2 text-16 text-ink-2">{fallo}</p>
      </div>
    );
  }
  if (!cita) {
    return (
      <div aria-busy="true" className="flex flex-col gap-3 px-4 py-6">
        <p className="sr-only" aria-live="polite">Cargando tu cita…</p>
        <Esqueleto className="h-7 w-48" /><Esqueleto className="h-5 w-64" /><Esqueleto className="h-32 w-full rounded-lg" />
      </div>
    );
  }

  const estado = estadoDeCita(cita);
  const sePuede = queSePuede(cita);
  const whatsapp = enlaceWhatsApp(cita.whatsapp, `Hola, quiero cambiar mi cita del ${fechaLarga(cita.dia)} ${aLaHora(cita.hora)}.`);
  const anticipoPagado = (aCentavos(cita.anticipo_pagado_mxn) ?? 0) > 0;

  /** Cancelar o mover: con la cita de vuelta se pinta; tarde (FUERA_DE_PLAZO) se relee para enseñar el aviso. */
  const correr = (llamar: () => ReturnType<typeof cancelarCita>, listo: string) => accion.correr(async () => {
    const r = await llamar();
    if (r.ok) { setCita(r.datos); setModo("ver"); setNueva(null); setHecho(listo); return null; }
    if (r.error === "FUERA_DE_PLAZO") { const v = await verCita(slug, codigo); if (v.ok) setCita(v.datos); setModo("ver"); }
    // Ese horario lo ganó alguien más: la lista se actualiza y se elige otro.
    if (r.error === "HUECO_OCUPADO") { setNueva(null); setRecarga((n) => n + 1); }
    return textoDeFallo(r);
  });

  return (
    <div className="flex flex-col gap-5 px-4 pb-10">
      <div className="flex flex-col items-start gap-2">
        <StatusChip tone={estado.tono}>{estado.etiqueta}</StatusChip>
        <h1 className="font-display text-24 font-semibold first-letter:uppercase">{fechaLarga(cita.dia, hoy)}</h1>
        <p className="text-16 text-ink-2">{horaDe(cita.inicia)}{cita.termina && ` a ${horaDe(cita.termina)}`}</p>
      </div>

      <div id="cita-resultado" tabIndex={-1} aria-live="polite" className="outline-none empty:hidden">{hecho && <Aviso tono="success" className="!text-14">{hecho}</Aviso>}</div>
      {cita.cancelada_motivo && <p className="text-15 text-ink">{cita.cancelada_motivo.replace(/\.?$/, ".")}</p>}
      {cita.reembolso && <Aviso tono={cita.reembolso.estado === "DEVUELTO" ? "success" : "info"} role="status" className="!text-14">{cita.reembolso.mensaje}</Aviso>}

      <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
        <p className={cn("text-15", PARTE)}>
          <span className="font-semibold">{cita.sucursal.nombre}</span>
          {cita.sucursal.direccion && <span className="block text-ink-2">{cita.sucursal.direccion}</span>}
        </p>
        <ul className="flex flex-col gap-2 border-t border-line pt-3">
          {cita.servicios.map((s, i) => (
            <li key={`${s.producto_id}-${i}`} className={cn("flex items-start justify-between gap-3 text-15", PARTE)}>
              <span>
                <span className="font-medium">{s.nombre}</span>
                <span className="block text-14 text-ink-2">{s.colaborador} · {horaDe(s.inicia)}</span>
              </span>
              <span className="tabular-nums">{formatoMxn(s.precio)}</span>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-1 border-t border-line pt-3 text-15">
          <p className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatoMxn(cita.total_mxn)}</span></p>
          {anticipoPagado && <p className="flex justify-between text-ink-2"><span>Anticipo pagado</span><span className="tabular-nums">{formatoMxn(cita.anticipo_pagado_mxn)}</span></p>}
        </div>
      </div>

      {accion.error && <Aviso tono="danger" role="alert" className="!text-14">{accion.error}</Aviso>}

      {sePuede === "contactar" && (
        <div className="flex flex-col gap-3 rounded-lg bg-hover p-4">
          <p className="text-15">Para cambios, comunícate con el negocio.</p>
          {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={cn(PRINCIPAL, "h-12 w-full text-15")}>Escribir por WhatsApp</a>}
        </div>
      )}

      {sePuede === "cambiar" && modo === "ver" && (
        <div className="flex flex-col gap-3">
          <button type="button" onClick={() => { setHecho(null); setModo("cambiar"); }} className={SECUNDARIO}>Cambiar horario</button>
          <button type="button" onClick={() => { setHecho(null); setModo("cancelar"); }} className={cn(SECUNDARIO, "text-danger")}>Cancelar cita</button>
          <p className="text-13 text-ink-2">Puedes cambiarla o cancelarla hasta {cita.cancelar_horas} horas antes.</p>
        </div>
      )}

      {sePuede === "cambiar" && modo === "cambiar" && (
        <section aria-labelledby="cita-cambiar" className="flex flex-col gap-4">
          <h2 id="cita-cambiar" tabIndex={-1} className="font-display text-20 font-semibold outline-none">Elige otro horario</h2>
          <Horarios slug={slug} sucursalId={cita.sucursal.id} codigo={codigo} hoy={hoy} diasReserva={diasReserva} diaInicial={cita.dia} recarga={recarga}
            cadena={cita.servicios.map((s) => ({ producto_id: s.producto_id, usuario_id: s.colaborador_id }))}
            elegido={nueva} alElegir={setNueva} />
          <button type="button" disabled={!nueva || accion.ocupado} aria-busy={accion.ocupado}
            onClick={() => nueva && void correr(() => moverCita(slug, codigo, nueva), "Listo, cambiamos tu cita. Te mandamos los datos a tu correo.")}
            className={cn(PRINCIPAL, "h-14 w-full text-16")}>
            {accion.ocupado ? "Cambiando…" : nueva ? `Cambiar a las ${horaDe(nueva)}` : "Elige un horario"}
          </button>
          <button type="button" onClick={() => { setModo("ver"); setNueva(null); }} className={SECUNDARIO}>No cambiar</button>
        </section>
      )}

      {sePuede === "cambiar" && modo === "cancelar" && (
        <section aria-labelledby="cita-cancelar" className="flex flex-col gap-3 rounded-lg border border-danger-line bg-danger-soft p-4">
          <h2 id="cita-cancelar" tabIndex={-1} className="font-display text-18 font-semibold outline-none">¿Cancelar tu cita?</h2>
          {anticipoPagado && <p className="text-15">Te devolvemos tu anticipo completo por Mercado Pago.</p>}
          <button type="button" disabled={accion.ocupado} aria-busy={accion.ocupado}
            onClick={() => void correr(() => cancelarCita(slug, codigo), "Cancelamos tu cita.")}
            className={cn(botonClases({ variant: "danger" }), "h-12 w-full font-display text-15", FOCO)}>
            {accion.ocupado ? "Cancelando…" : "Sí, cancelar"}
          </button>
          <button type="button" onClick={() => setModo("ver")} className={SECUNDARIO}>No, conservarla</button>
        </section>
      )}
    </div>
  );
}
