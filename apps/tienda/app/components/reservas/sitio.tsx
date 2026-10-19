"use client";
// El sitio de reservas de un negocio de belleza: inicio (sucursal, servicios por categoría, ubicación
// y horario), «Tu cita» (servicios, ¿con quién?, día y hora) y «Tus datos» (reservar.tsx). El logo y
// el nombre los pone el marco ([negocio]/layout.tsx). Celular primero: una columna.
//
// TEXTOS PROVISIONALES: los revisa James.
import { useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Icono, cn } from "@vim/ui/styles";
import type { ServicioDeCadena } from "../../lib/api";
import type { Reservas, ServicioReservable } from "../../lib/contrato";
import { formatoMxn } from "../../lib/dinero";
import { semanaLegible } from "../../lib/horario";
import {
  MAX_SERVICIOS, SIN_CATEGORIA, categoriasDe, duracionLegible, intentoDeReserva, quienesHacen, resumenDe, serviciosDeSucursal,
} from "../../lib/reservas";
import { enlaceWhatsApp } from "../../lib/telefono";
import { FOCO, PARTE, PRINCIPAL } from "../piezas";
import { Horarios } from "./horarios";
import { Reservar } from "./reservar";

type Pantalla = "inicio" | "cita" | "datos";
const H2 = "font-display text-20 font-semibold outline-none";
const ENLACE = cn("inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4", FOCO);
const SECUNDARIO = cn("inline-flex h-12 items-center justify-center rounded border border-line-strong px-4 font-display text-15 font-semibold text-ink hover:bg-hover", FOCO);

function TarjetaDeServicio({ s, alReservar }: { s: ServicioReservable; alReservar: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-surface p-4">
      <div className={cn("min-w-0 flex-1", PARTE)}>
        <p className="text-16 font-semibold text-ink">{s.nombre}</p>
        <p className="mt-1 text-14 tabular-nums text-ink-2">{formatoMxn(s.precio)} · {duracionLegible(s.duracion_min)}</p>
      </div>
      <button type="button" onClick={alReservar} aria-label={`Reservar ${s.nombre}`}
        className={cn("h-11 flex-shrink-0 rounded px-3 font-display text-15 font-semibold text-ink underline decoration-accent decoration-2 underline-offset-4 hover:bg-hover active:scale-[.97] transition-transform duration-150 ease-vim", FOCO)}>
        Reservar
      </button>
    </li>
  );
}

export function SitioReservas({ reservas, hoy, sucursalInicial }: { reservas: Reservas; hoy: string; sucursalInicial?: string }) {
  const [sucursalId, setSucursalId] = useState(
    reservas.sucursales.find((x) => x.id === sucursalInicial)?.id ?? reservas.sucursales[0]?.id ?? "");
  const [cambiando, setCambiando] = useState(false);
  const [pantalla, setPantalla] = useState<Pantalla>("inicio");
  const [cadena, setCadena] = useState<ServicioDeCadena[]>([]);
  const [inicia, setInicia] = useState<string | null>(null);
  const [categoria, setCategoria] = useState<string | null>(null);
  const [agregando, setAgregando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const intento = useRef(intentoDeReserva()).current;

  const sucursal = reservas.sucursales.find((x) => x.id === sucursalId);
  const servicios = useMemo(() => serviciosDeSucursal(reservas, sucursalId), [reservas, sucursalId]);
  const categorias = categoriasDe(servicios);
  const visibles = categoria ? servicios.filter((s) => (s.categoria ?? SIN_CATEGORIA) === categoria) : servicios;

  // Cada pantalla nueva arranca arriba, con el foco en su título.
  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (pantalla !== "inicio") document.getElementById(`titulo-${pantalla}`)?.focus();
  }, [pantalla]);

  if (!sucursal) return <p className="px-4 py-8 text-16">Las reservas en línea no están disponibles por ahora.</p>;
  const whatsapp = enlaceWhatsApp(sucursal.whatsapp ?? reservas.whatsapp, "Hola, quiero hacer una cita.");

  const agregar = (s: ServicioReservable) => {
    setCadena((c) => (c.length >= MAX_SERVICIOS || c.some((e) => e.producto_id === s.producto_id) ? c : [...c, { producto_id: s.producto_id, usuario_id: null }]));
    setInicia(null); setAgregando(false); setAviso(null); setPantalla("cita");
  };
  const quitar = (i: number) => {
    const resto = cadena.filter((_, j) => j !== i);
    setCadena(resto); setInicia(null);
    if (resto.length === 0) setPantalla("inicio");
  };
  const conQuien = (i: number, usuario: string | null) => {
    setCadena((c) => c.map((e, j) => (j === i ? { ...e, usuario_id: usuario } : e)));
    setInicia(null);
  };
  const elegirSucursal = (id: string) => { setSucursalId(id); setCadena([]); setInicia(null); setCambiando(false); setCategoria(null); };

  if (pantalla === "datos" && inicia) {
    return (
      <Reservar reservas={reservas} sucursal={sucursal} cadena={cadena} inicia={inicia} hoy={hoy} intento={intento}
        alVolver={() => setPantalla("cita")}
        alPerderHorario={(texto) => { setAviso(texto); setInicia(null); setPantalla("cita"); }} />
    );
  }

  if (pantalla === "cita") {
    const total = resumenDe(reservas.servicios, cadena);
    const otros = servicios.filter((s) => !cadena.some((e) => e.producto_id === s.producto_id));
    return (
      <div className="flex flex-col gap-6 px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setPantalla("inicio")} aria-label="Volver a los servicios"
            className={cn("-ml-2 flex h-11 w-11 items-center justify-center rounded hover:bg-hover", FOCO)}>
            <Icono nombre="chevron-izquierda" className="h-5 w-5" />
          </button>
          <h2 id="titulo-cita" tabIndex={-1} className={H2}>Tu cita</h2>
        </div>

        <section aria-label="Servicios de tu cita" className="flex flex-col gap-3">
          <ul className="flex flex-col gap-3">
            {cadena.map((e, i) => {
              const s = reservas.servicios.find((x) => x.producto_id === e.producto_id);
              const quienes = quienesHacen(reservas, sucursalId, e.producto_id);
              return (
                <li key={`${e.producto_id}-${i}`} className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
                  <div className="flex items-start gap-3">
                    <div className={cn("min-w-0 flex-1", PARTE)}>
                      <p className="text-16 font-semibold">{s?.nombre}</p>
                      {s && <p className="mt-1 text-14 tabular-nums text-ink-2">{formatoMxn(s.precio)} · {duracionLegible(s.duracion_min)}</p>}
                    </div>
                    <button type="button" onClick={() => quitar(i)} aria-label={`Quitar ${s?.nombre ?? "servicio"}`}
                      className={cn("-mr-2 -mt-2 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded text-ink-2 hover:bg-hover hover:text-ink", FOCO)}>
                      <Icono nombre="eliminar" className="h-5 w-5" />
                    </button>
                  </div>
                  <label className="flex flex-col gap-1 text-14 font-medium">
                    ¿Con quién?
                    <select value={e.usuario_id ?? ""} onChange={(ev) => conQuien(i, ev.target.value || null)}
                      className="h-12 w-full rounded border border-line-strong bg-surface px-3 text-16 text-ink focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink">
                      <option value="">Quien esté libre</option>
                      {quienes.map((c) => <option key={c.id} value={c.id}>{c.nombre_corto}</option>)}
                    </select>
                  </label>
                </li>
              );
            })}
          </ul>
          {cadena.length < MAX_SERVICIOS && otros.length > 0 && (
            agregando ? (
              <div className="flex flex-col gap-2">
                <p className="text-14 font-medium text-ink-2">Agrega otro servicio</p>
                <ul className="flex flex-col gap-2">{otros.map((s) => <TarjetaDeServicio key={s.producto_id} s={s} alReservar={() => agregar(s)} />)}</ul>
                <button type="button" onClick={() => setAgregando(false)} className={cn(ENLACE, "self-start")}>Cancelar</button>
              </div>
            ) : (
              <button type="button" onClick={() => setAgregando(true)} className={cn(SECUNDARIO, "gap-2 self-start")}>
                <Icono nombre="mas" className="h-5 w-5" /> Agregar otro servicio
              </button>
            )
          )}
        </section>

        {aviso && <Aviso tono="warning" role="alert" className="!text-14">{aviso}</Aviso>}

        <Horarios slug={reservas.slug} sucursalId={sucursalId} cadena={cadena} hoy={hoy} diasReserva={reservas.reglas.dias_reserva}
          elegido={inicia} alElegir={(h) => { setInicia(h); if (h) setAviso(null); }} />

        {/* La acción queda al alcance del pulgar mientras se recorren los horarios. */}
        <div className="sticky bottom-0 z-10 -mx-4 border-t border-line bg-surface/95 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-14 text-ink-2">
              <span className="block font-display text-16 font-semibold tabular-nums text-ink">{formatoMxn(total.total)}</span>
              {duracionLegible(total.duracion)}
            </p>
            <button type="button" disabled={!inicia} onClick={() => setPantalla("datos")} className={cn(PRINCIPAL, "h-14 px-6 text-16")}>
              Continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 px-4 pb-8">
      <section aria-label="El negocio" className="flex flex-col gap-4">
        <p className={cn("text-15 text-ink-2", PARTE)}>
          {sucursal.direccion ?? sucursal.nombre}
          {reservas.sucursales.length > 1 && (
            <>
              {" · "}
              <button type="button" aria-expanded={cambiando} onClick={() => setCambiando((v) => !v)} className={cn("min-h-11 font-medium text-ink underline underline-offset-4", FOCO)}>
                Cambiar ubicación
              </button>
            </>
          )}
        </p>
        {cambiando && (
          <ul aria-label="Sucursales" className="flex flex-col gap-2">
            {reservas.sucursales.map((x) => (
              <li key={x.id}>
                <button type="button" aria-pressed={x.id === sucursalId} onClick={() => elegirSucursal(x.id)}
                  className={cn("flex min-h-14 w-full flex-col items-start rounded-lg border px-4 py-3 text-left hover:bg-hover", x.id === sucursalId ? "border-ink" : "border-line", FOCO)}>
                  <span className="text-16 font-semibold">{x.nombre}</span>
                  {x.direccion && <span className={cn("text-14 text-ink-2", PARTE)}>{x.direccion}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
        <a href="#servicios" className={cn(PRINCIPAL, "h-14 w-full text-16")}>Reservar cita</a>
        {reservas.descripcion && <p className={cn("text-16 leading-relaxed text-ink", PARTE)}>{reservas.descripcion}</p>}
      </section>

      <section id="servicios" aria-labelledby="titulo-servicios" className="flex scroll-mt-4 flex-col gap-4">
        <h2 id="titulo-servicios" className={H2}>Servicios</h2>
        {categorias.length > 1 && (
          <div role="group" aria-label="Filtrar por categoría" className="-mx-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
            {[null, ...categorias].map((c) => {
              const activo = c === categoria;
              return (
                <button key={c ?? "todos"} type="button" aria-pressed={activo} onClick={() => setCategoria(c)}
                  className={cn("h-11 flex-shrink-0 whitespace-nowrap rounded-full border px-4 text-15 font-medium transition-colors duration-150",
                    activo ? "border-transparent bg-ink text-surface" : "border-line-strong bg-surface text-ink hover:bg-hover", FOCO)}>
                  {c ?? "Todos"}
                </button>
              );
            })}
          </div>
        )}
        {servicios.length === 0 ? (
          <p className="text-15 text-ink-2">Esta sucursal no tiene servicios en línea por ahora.</p>
        ) : (categoria ? [categoria] : categorias).map((c) => {
          const deEsta = visibles.filter((s) => (s.categoria ?? SIN_CATEGORIA) === c);
          return (
            <div key={c} className="flex flex-col gap-3">
              {categorias.length > 1 && <h3 className="font-display text-16 font-semibold text-ink-2">{c}</h3>}
              <ul className="flex flex-col gap-3">{deEsta.map((s) => <TarjetaDeServicio key={s.producto_id} s={s} alReservar={() => agregar(s)} />)}</ul>
            </div>
          );
        })}
      </section>

      <section aria-labelledby="titulo-ubicacion" className="flex flex-col gap-3">
        <h2 id="titulo-ubicacion" className={H2}>Ubicación y horario</h2>
        <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
          <p className={cn("flex items-start gap-2 text-15", PARTE)}>
            <Icono nombre="pin" className="mt-0.5 h-5 w-5 flex-shrink-0 text-ink-2" />
            <span>{sucursal.nombre}{sucursal.direccion && <span className="block text-ink-2">{sucursal.direccion}</span>}</span>
          </p>
          <div className="flex flex-wrap gap-x-5">
            {sucursal.ubicacion && (
              <a href={`https://www.google.com/maps/search/?api=1&query=${sucursal.ubicacion.lat},${sucursal.ubicacion.lng}`} target="_blank" rel="noopener noreferrer" className={ENLACE}>
                Cómo llegar
              </a>
            )}
            {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={ENLACE}>WhatsApp</a>}
          </div>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 border-t border-line pt-3 text-14">
            {semanaLegible(sucursal.horario).map((d) => (
              <div key={d.dia} className="contents">
                <dt className="text-ink-2">{d.nombre}</dt>
                <dd className="tabular-nums text-ink">{d.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </div>
  );
}
