"use client";
// El carrito: los renglones con sus elecciones y la cuenta (la nota para el restaurante se escribe
// en «Tus datos», en su primera pantalla). El total
// que manda es el de `cotizar`; mientras llega se ve el estimado atenuado. Con la tienda cerrada se
// puede seguir armando el pedido, pero en lugar de «Continuar» va el aviso.
import { useEffect, useState } from "react";
import { Aviso, botonClases, cn, type TonoAviso } from "@vim/ui/styles";
import { cotizar, type Resultado } from "../lib/api";
import { TOPES, estimarRenglon, estimarTotal, type Carrito, type CuerpoCarrito, type RenglonCarrito } from "../lib/carrito";
import type { Cotizacion, Menu, Modo, Sucursal } from "../lib/contrato";
import { formato, formatoMxn } from "../lib/dinero";
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
 * `cuerpo` en null = no toca cotizar (carrito cerrado, vacío, «Por zonas» sin colonia o con renglones por quitar).
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

/** TEXTO PROVISIONAL (James): el envío por distancia, antes de poner la ubicación. */
const ENVIO_POR_UBICACION = "Con tu ubicación";
/** TEXTO PROVISIONAL (James): el envío con catálogo de colonias, antes de elegir la colonia. */
const ENVIO_POR_COLONIA = "Con tu colonia";

export function VistaDelCarrito({
  sucursal, carrito, menu, ahora, avisos, cotizado, alCambiarCantidad, alQuitar, alCambiarModo, alContinuar, alCerrar,
}: {
  sucursal: Sucursal; carrito: Carrito; menu: Menu; ahora: Momento;
  /** Renglones que hay que quitar, con su porqué: `{ [renglon.id]: texto }`. */
  avisos: Record<string, string>;
  cotizado: Cotizado;
  alCambiarCantidad: (id: string, n: number) => void; alQuitar: (id: string) => void;
  alCambiarModo: (m: Modo) => void;
  alContinuar: () => void; alCerrar: () => void;
}) {
  if (carrito.renglones.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 px-6 py-16 text-center">
        <p className="font-display text-20 font-semibold tracking-tight">Tu pedido está vacío</p>
        <p className="text-15 text-ink-2">Elige algo del menú y aparecerá aquí.</p>
        <button type="button" onClick={alCerrar} className={cn(PRINCIPAL, "mt-2 h-14 px-6 text-16")}>Ver el menú</button>
      </div>
    );
  }

  const aDomicilio = carrito.modo === "DOMICILIO";
  // «Por zonas» la zona nunca la elige el cliente (0187 §6): la da la colonia, en «Tus datos». Hasta
  // entonces no hay envío que cotizar (la tienda no cotiza) y se sigue con el estimado.
  const porColonia = aDomicilio && sucursal.envio.cobro === "ZONAS";
  const cot = cotizado.resultado?.ok ? cotizado.resultado.datos : null;
  const error = cotizado.resultado && !cotizado.resultado.ok ? cotizado.resultado : null;
  // La cotización trae un renglón por cada uno del carrito, en el mismo orden.
  const porRenglon = cot && cot.renglones.length === carrito.renglones.length ? cot.renglones : null;
  const motivo = motivoDeCierre(sucursal, carrito.modo);
  const estimado = estimarTotal(carrito, menu);
  // Por distancia (0185) el envío sale de la ubicación, que se pone en «Tus datos»: aquí todavía no se sabe.
  const sinEnvioAun = aDomicilio && sucursal.envio.cobro === "DISTANCIA" && !cot?.distancia_km && !cot?.por_colonia;
  /** Se sigue sin cotización: falta la colonia, y sin ella no hay total que cotizar. */
  const sinCotizar = porColonia && !cot && !cotizado.cotizando;

  // Lo que impide continuar, del más concreto al más general. Si no hay nada, va el botón.
  const freno: { tono: TonoAviso; texto: string; reintentar?: boolean } | null =
    Object.keys(avisos).length > 0 ? { tono: "danger", texto: "Quita lo que está marcado para continuar." }
    : error ? { tono: "danger", texto: Object.values(textoDeError(error.error, { telefono: sucursal.telefono, detalle: error.detalle })).join(" "), reintentar: true }
    : motivo ? { tono: "warning", texto: textoCerrada(motivo, sucursal.horario, ahora) }
    : null;

  return (
    <>
      <div className={CUERPO}>
        <div className="px-4 pb-4 pt-2">
          <Entrega sucursal={sucursal} modo={carrito.modo} alCambiarModo={alCambiarModo} />
        </div>
        <ul className="divide-y divide-line border-t border-line px-4">
          {carrito.renglones.map((r, i) => {
            const centavos = estimarRenglon(r, menu);
            return (
              <li key={r.id} className="py-4">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={cn("min-w-0 text-16 font-semibold leading-snug", PARTE)}>{r.nombre}</span>
                  <span className={cn("flex-shrink-0 font-display text-16 font-semibold tabular-nums transition-opacity duration-150", !porRenglon && "opacity-50")}>
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
        {/* La cuenta, en la tarjeta de resumen de la casa (la misma del portal de factura). */}
        <div className="mx-4 mb-4 rounded-lg border border-line bg-sel px-4 py-3">
          <dl aria-busy={cotizado.cotizando} className="flex flex-col gap-2">
          <Linea concepto="Subtotal" importe={cot ? formatoMxn(cot.subtotal_mxn) : formato(estimado)} estimado={!cot} />
          {aDomicilio && <Linea concepto="Envío" importe={sinEnvioAun ? ENVIO_POR_UBICACION : cot ? formatoMxn(cot.envio_total_mxn) : ENVIO_POR_COLONIA} estimado={!cot} />}
          <Linea concepto={sinEnvioAun || sinCotizar ? "Total sin envío" : "Total"} importe={cot ? formatoMxn(cot.total_mxn) : formato(estimado)} estimado={!cot} fuerte />
          </dl>
          {/* Siempre ocupa su renglón: así la cuenta no brinca cuando llega el total. */}
          <p aria-live="polite" className="mt-2 min-h-5 text-13 text-ink-2">
            {/* Donde se puede pagar en línea, cuándo se paga se dice en «¿Cómo pagas?», al elegirlo. */}
            {cot ? (sucursal.pago_en_linea ? "" : "Pagas al recibir tu pedido.") : cotizado.cotizando ? "Calculando el total…" : "Total estimado."}
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
          <button type="button" onClick={alContinuar} disabled={!cot && !sinCotizar} className={cn(PRINCIPAL, "h-14 w-full justify-between px-5 text-16")}>
            <span>Continuar</span>
            <span className="tabular-nums">{cot ? formatoMxn(cot.total_mxn) : sinCotizar ? formato(estimado) : "Calculando…"}</span>
          </button>
        )}
      </div>
    </>
  );
}
