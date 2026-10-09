"use client";
// El carrito: los renglones con sus elecciones, la nota para el restaurante y la cuenta. El total
// que manda es el de `cotizar`; mientras llega se ve el estimado atenuado. Con la tienda cerrada se
// puede seguir armando el pedido, pero en lugar de «Continuar» va el aviso.
import { useEffect, useId, useState } from "react";
import { Aviso, botonClases, cn, type TonoAviso } from "@vim/ui/styles";
import { cotizar, type Resultado } from "../lib/api";
import { TOPES, estimarRenglon, estimarTotal, type Carrito, type CuerpoCarrito, type RenglonCarrito } from "../lib/carrito";
import type { Cotizacion, Menu, Modo, Sucursal } from "../lib/contrato";
import { aCentavos, formato, formatoMxn } from "../lib/dinero";
import type { Momento } from "../lib/horario";
import { cotizarConEspera, motivoDeCierre } from "../lib/pantalla";
import { textoCerrada, textoDeError } from "../lib/textos";
import { Entrega } from "./entrega";
import { CUERPO, PIE } from "./hoja";
import { Cantidad, PARTE, PRINCIPAL } from "./piezas";

export type Cotizado = {
  /** El resultado de cotizar EXACTAMENTE el carrito de ahora; null mientras no llega o si no toca cotizar. */
  resultado: Resultado<Cotizacion> | null;
  cotizando: boolean;
  reintentar: () => void;
};

/**
 * Cotiza `cuerpo` cada vez que cambia, tras una espera corta, y cancela la cotización anterior.
 * `cuerpo` en null = no toca cotizar (carrito cerrado, vacío, sin zona o con renglones por quitar).
 */
export function useCotizacion(slug: string, cuerpo: CuerpoCarrito | null): Cotizado {
  const clave = cuerpo && JSON.stringify(cuerpo);
  const [ultima, setUltima] = useState<{ clave: string; resultado: Resultado<Cotizacion> } | null>(null);
  const [intento, setIntento] = useState(0);
  useEffect(() => {
    if (!clave) return;
    return cotizarConEspera((c, senal) => cotizar(slug, c, senal), JSON.parse(clave) as CuerpoCarrito, (resultado) => setUltima({ clave, resultado }));
  }, [slug, clave, intento]);
  const resultado = ultima && ultima.clave === clave ? ultima.resultado : null;
  return { resultado, cotizando: !!clave && !resultado, reintentar: () => { setUltima(null); setIntento((n) => n + 1); } };
}

function Elecciones({ r }: { r: RenglonCarrito }) {
  const mods = (m: { nombre: string }[]) => m.map((x) => x.nombre).join(", ");
  if (r.modificadores.length + r.componentes.length === 0 && !r.nota) return null;
  return (
    <ul className={cn("mt-1 flex flex-col gap-0.5 text-14 leading-snug text-ink-2", PARTE)}>
      {r.modificadores.length > 0 && <li>{mods(r.modificadores)}</li>}
      {r.componentes.map((c) => <li key={`${c.grupoId}:${c.productoId}`}>{c.nombre}{c.modificadores.length > 0 && ` (${mods(c.modificadores)})`}</li>)}
      {r.nota && <li>Nota: {r.nota}</li>}
    </ul>
  );
}

/** Una línea de la cuenta: concepto, puntos guía e importe. */
export function Linea({ concepto, importe, estimado, fuerte }: { concepto: string; importe: string; estimado: boolean; fuerte?: boolean }) {
  return (
    <div className={cn("flex items-baseline gap-2", fuerte ? "pt-2 font-display text-20 font-semibold" : "text-15")}>
      <dt className="flex flex-1 items-baseline gap-2 after:flex-1 after:border-b after:border-dotted after:border-line-strong after:content-['']">{concepto}</dt>
      <dd className={cn("tabular-nums transition-opacity duration-150", estimado && "opacity-50")}>{importe}</dd>
    </div>
  );
}

export function VistaDelCarrito({
  sucursal, carrito, menu, ahora, avisos, cotizado, nota, alCambiarNota, alCambiarCantidad, alQuitar, alCambiarModo, alCambiarZona, alContinuar, alCerrar,
}: {
  sucursal: Sucursal; carrito: Carrito; menu: Menu; ahora: Momento;
  /** Renglones que hay que quitar, con su porqué: `{ [renglon.id]: texto }`. */
  avisos: Record<string, string>;
  cotizado: Cotizado; nota: string; alCambiarNota: (n: string) => void;
  alCambiarCantidad: (id: string, n: number) => void; alQuitar: (id: string) => void;
  alCambiarModo: (m: Modo) => void; alCambiarZona: (id: string | null) => void;
  alContinuar: () => void; alCerrar: () => void;
}) {
  const idNota = useId();

  if (carrito.renglones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <p className="font-display text-18 font-semibold">Tu pedido está vacío</p>
        <p className="text-15 text-ink-2">Elige algo del menú y aparecerá aquí.</p>
        <button type="button" onClick={alCerrar} className={cn(PRINCIPAL, "h-12 px-6 text-15")}>Ver el menú</button>
      </div>
    );
  }

  const aDomicilio = carrito.modo === "DOMICILIO";
  const zona = sucursal.zonas.find((z) => z.id === carrito.zonaId);
  const faltaZona = aDomicilio && !zona && sucursal.zonas.length > 0;
  const cot = cotizado.resultado?.ok ? cotizado.resultado.datos : null;
  const error = cotizado.resultado && !cotizado.resultado.ok ? cotizado.resultado : null;
  // La cotización trae un renglón por cada uno del carrito, en el mismo orden.
  const porRenglon = cot && cot.renglones.length === carrito.renglones.length ? cot.renglones : null;
  const motivo = motivoDeCierre(sucursal, carrito.modo);
  const estimado = estimarTotal(carrito, menu);
  const envioEstimado = aDomicilio && zona ? aCentavos(zona.costo_mxn) ?? 0 : 0;

  // Lo que impide continuar, del más concreto al más general. Si no hay nada, va el botón.
  const freno: { tono: TonoAviso; texto: string; reintentar?: boolean } | null =
    Object.keys(avisos).length > 0 ? { tono: "danger", texto: "Quita lo que está marcado para continuar." }
    : faltaZona ? { tono: "info", texto: "Elige tu zona de entrega para ver el total." }
    : error ? { tono: "danger", texto: Object.values(textoDeError(error.error, { telefono: sucursal.telefono, detalle: error.detalle })).join(" "), reintentar: true }
    : motivo ? { tono: "warning", texto: textoCerrada(motivo, sucursal.horario, ahora) }
    : null;

  return (
    <>
      <div className={CUERPO}>
        <div className="border-b border-line px-4 py-4">
          <Entrega sucursal={sucursal} modo={carrito.modo} zonaId={carrito.zonaId} alCambiarModo={alCambiarModo} alCambiarZona={alCambiarZona} />
        </div>
        <ul className="divide-y divide-line px-4">
          {carrito.renglones.map((r, i) => {
            const centavos = estimarRenglon(r, menu);
            return (
              <li key={r.id} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn("min-w-0 text-16 font-semibold leading-snug", PARTE)}>{r.nombre}</span>
                  <span className={cn("flex-shrink-0 font-display text-15 font-semibold tabular-nums transition-opacity duration-150", !porRenglon && "opacity-50")}>
                    {porRenglon ? formatoMxn(porRenglon[i]!.total_mxn) : centavos === null ? "" : formato(centavos)}
                  </span>
                </div>
                <Elecciones r={r} />
                {avisos[r.id] && <p role="alert" className="mt-2 text-14 font-medium text-danger">{avisos[r.id]}</p>}
                <div className="mt-3 flex items-center gap-3">
                  <Cantidad valor={r.cantidad} max={TOPES.porRenglon} de={r.nombre} alCambiar={(n) => alCambiarCantidad(r.id, n)} alQuitar={() => alQuitar(r.id)} />
                  {avisos[r.id] && <button type="button" onClick={() => alQuitar(r.id)} className={botonClases({ variant: "ghost" })}>Quitar</button>}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="border-t border-line px-4 py-4">
          <label htmlFor={idNota} className="flex items-baseline justify-between gap-3">
            <span className="text-15 font-semibold">Nota para el restaurante</span>
            <span className="text-13 text-ink-2">Opcional</span>
          </label>
          <textarea id={idNota} value={nota} onChange={(e) => alCambiarNota(e.target.value)} maxLength={TOPES.nota} rows={2}
            className="mt-2 block w-full resize-none rounded border border-line-strong px-3 py-2 text-16 focus:border-ink focus:outline-none" />
        </div>
        <div className="border-t border-line px-4 py-4">
          <dl aria-busy={cotizado.cotizando} className="flex flex-col gap-2">
          <Linea concepto="Subtotal" importe={cot ? formatoMxn(cot.subtotal_mxn) : formato(estimado)} estimado={!cot} />
          {aDomicilio && <Linea concepto="Envío" importe={cot ? formatoMxn(cot.envio_total_mxn) : zona ? formato(envioEstimado) : "Por elegir"} estimado={!cot} />}
          <Linea concepto="Total" importe={cot ? formatoMxn(cot.total_mxn) : formato(estimado + envioEstimado)} estimado={!cot} fuerte />
          </dl>
          {/* Siempre ocupa su renglón: así la cuenta no brinca cuando llega el total. */}
          <p aria-live="polite" className="mt-2 min-h-5 text-13 text-ink-2">
            {cot ? "Pagas al recibir tu pedido." : cotizado.cotizando ? "Calculando el total…" : "Total estimado."}
          </p>
        </div>
      </div>
      <div className={PIE}>
        {freno ? (
          <div className="flex flex-col gap-2">
            <Aviso tono={freno.tono} role={freno.tono === "danger" ? "alert" : "status"} className="!text-14">{freno.texto}</Aviso>
            {freno.reintentar && <button type="button" onClick={cotizado.reintentar} className={cn(botonClases({ variant: "ghost" }), "h-12")}>Volver a intentar</button>}
          </div>
        ) : (
          <button type="button" onClick={alContinuar} disabled={!cot} className={cn(PRINCIPAL, "h-14 w-full justify-between px-5 text-16")}>
            <span>Continuar</span>
            <span className="tabular-nums">{cot ? formatoMxn(cot.total_mxn) : "Calculando…"}</span>
          </button>
        )}
      </div>
    </>
  );
}
