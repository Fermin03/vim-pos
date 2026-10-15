"use client";
// Un mapa con un pin que se mueve: el del cliente en la tienda (envío por distancia, 0185) y el de la
// sucursal en el admin. MapLibre GL JS con las teselas de OpenFreeMap (gratis, sin cuenta ni llave;
// la atribución de OpenFreeMap, OpenMapTiles y OpenStreetMap la pone MapLibre desde el estilo).
//
// La librería NO va en el paquete de la página: se descarga de `/mapa/<versión>/` la primera vez que
// se pinta un mapa (ver packages/ui/copiar-mapa.mjs), y su worker sale del mismo lugar. Quien use
// esto añade a su CSP `connect-src https://tiles.openfreemap.org` y nada más.
//
// El pin se mueve arrastrándolo o tocando el mapa. Con teclado: el mapa se mueve con las flechas y
// «Poner el pin en el centro» lo trae a donde se está mirando.
import { useEffect, useRef, useState } from "react";
import type { Map as MapaML, Marker } from "maplibre-gl";
import { cn } from "./cn";

export type PuntoDelMapa = { lat: number; lng: number };

/** La versión copiada en `public/mapa/`. La misma que fija el package.json de la app. */
export const VERSION_DEL_MAPA = "6.11.2";
const BASE = `/mapa/${VERSION_DEL_MAPA}`;
/** El estilo de OpenFreeMap: claro, con nombres de calles y colonias legibles. */
export const ESTILO_DEL_MAPA = "https://tiles.openfreemap.org/styles/liberty";
/** El único origen que el mapa le pide a la red. Va en `connect-src`. */
export const ORIGEN_DEL_MAPA = "https://tiles.openfreemap.org";

type MapLibre = typeof import("maplibre-gl");
let carga: Promise<MapLibre> | null = null;
/** Una sola descarga por página, y su hoja de estilos. Si falla, la siguiente vez se intenta de nuevo. */
function cargarMapLibre(): Promise<MapLibre> {
  if (!carga) {
    if (!document.querySelector(`link[data-mapa="${VERSION_DEL_MAPA}"]`)) {
      const link = document.createElement("link");
      link.rel = "stylesheet"; link.href = `${BASE}/maplibre-gl.css`; link.dataset.mapa = VERSION_DEL_MAPA;
      document.head.appendChild(link);
    }
    carga = (import(/* webpackIgnore: true */ `${BASE}/maplibre-gl.mjs`) as Promise<MapLibre>)
      .catch((e: unknown) => { carga = null; throw e; });
  }
  return carga;
}

const redondear = (p: { lat: number; lng: number }): PuntoDelMapa => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 });
const sinMovimiento = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export type PropsDelMapa = {
  /** Dónde abre el mapa si no hay pin. */
  centro: PuntoDelMapa;
  /** El pin. null = todavía no hay: se pone al tocar el mapa (o con «Poner el pin en el centro»). */
  pin: PuntoDelMapa | null;
  /** El pin se soltó en otro lugar (ya redondeado a 6 decimales). */
  alMover: (p: PuntoDelMapa) => void;
  /** Mientras se arrastra, para enseñar algo en vivo. */
  alArrastrar?: (p: PuntoDelMapa) => void;
  /** Un punto fijo de referencia (la sucursal, vista desde la tienda). */
  referencia?: PuntoDelMapa | null;
  /** Lo que dice el mapa a un lector de pantalla. */
  etiqueta: string;
  /** El texto del botón que trae el pin al centro. */
  textoCentro: string;
  /** Lo que se enseña si el mapa no carga, y el botón para reintentar. */
  textoFallo: string;
  textoReintentar: string;
  zoom?: number;
  className?: string;
};

export function MapaConPin({
  centro, pin, alMover, alArrastrar, referencia, etiqueta, textoCentro, textoFallo, textoReintentar, zoom = 15, className,
}: PropsDelMapa) {
  const caja = useRef<HTMLDivElement>(null);
  const mapa = useRef<MapaML | null>(null);
  const marca = useRef<Marker | null>(null);
  const ml = useRef<MapLibre | null>(null);
  // Los avisos van por ref: el mapa se crea una vez y debe llamar a la versión vigente.
  const avisar = useRef({ alMover, alArrastrar });
  avisar.current = { alMover, alArrastrar };
  const [estado, setEstado] = useState<"cargando" | "listo" | "fallo">("cargando");
  const [intento, setIntento] = useState(0);

  /** Pone (o mueve) el pin. Lo crea la primera vez. */
  const ponerPin = (p: PuntoDelMapa) => {
    const m = mapa.current, lib = ml.current;
    if (!m || !lib) return;
    if (!marca.current) {
      const pinNuevo = new lib.Marker({ draggable: true, color: "#16161A" }).setLngLat([p.lng, p.lat]).addTo(m);
      pinNuevo.getElement().setAttribute("aria-hidden", "true");
      pinNuevo.on("drag", () => avisar.current.alArrastrar?.(redondear(pinNuevo.getLngLat())));
      pinNuevo.on("dragend", () => avisar.current.alMover(redondear(pinNuevo.getLngLat())));
      marca.current = pinNuevo;
    } else marca.current.setLngLat([p.lng, p.lat]);
  };

  useEffect(() => {
    let vivo = true;
    setEstado("cargando");
    cargarMapLibre().then((lib) => {
      if (!vivo || !caja.current) return;
      ml.current = lib;
      const inicio = pin ?? centro;
      const m = new lib.Map({
        container: caja.current, style: ESTILO_DEL_MAPA, center: [inicio.lng, inicio.lat], zoom,
        // Un dedo mueve el mapa dentro de la hoja; el gesto de dos dedos acerca. Sin girar ni inclinar.
        dragRotate: false, pitchWithRotate: false, touchPitch: false,
        cooperativeGestures: false,
      });
      m.touchZoomRotate.disableRotation();
      m.getCanvas().setAttribute("aria-label", etiqueta);
      mapa.current = m;
      if (referencia) {
        const punto = document.createElement("div");
        punto.className = "h-4 w-4 rounded-full border-[3px] border-white bg-ink-2 shadow";
        punto.setAttribute("aria-hidden", "true");
        new lib.Marker({ element: punto }).setLngLat([referencia.lng, referencia.lat]).addTo(m);
      }
      if (pin) ponerPin(pin);
      // Tocar el mapa pone el pin ahí (y lo suelta: es lo mismo que arrastrarlo).
      m.on("click", (e) => { const p = redondear(e.lngLat); ponerPin(p); avisar.current.alMover(p); });
      m.on("load", () => { if (vivo) setEstado("listo"); });
      m.on("error", () => { /* una tesela que no llegó no tumba el mapa; MapLibre la vuelve a pedir */ });
    }).catch(() => { if (vivo) setEstado("fallo"); });
    return () => {
      vivo = false;
      marca.current = null;
      mapa.current?.remove();
      mapa.current = null;
    };
    // El mapa se crea una vez por intento; el pin de fuera se sigue en el efecto de abajo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intento]);

  // El pin cambió desde fuera (p. ej. «Usar mi ubicación»): se mueve y el mapa va hacia él.
  const lat = pin?.lat, lng = pin?.lng;
  useEffect(() => {
    if (lat === undefined || lng === undefined || !mapa.current) return;
    const actual = marca.current?.getLngLat();
    if (actual && Math.abs(actual.lat - lat) < 1e-7 && Math.abs(actual.lng - lng) < 1e-7) return;
    ponerPin({ lat, lng });
    mapa.current.easeTo({ center: [lng, lat], duration: sinMovimiento() ? 0 : 250 });
  }, [lat, lng]);

  const alCentro = () => {
    const c = mapa.current?.getCenter();
    if (!c) return;
    const p = redondear(c);
    ponerPin(p);
    avisar.current.alMover(p);
  };

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="relative h-60 w-full overflow-hidden rounded-lg border border-line bg-hover">
        {/* La altura va en el contenedor mismo: MapLibre le pone `position: relative` (su hoja de estilos), así que no puede colgar de `inset`. */}
        <div ref={caja} className="h-full w-full" />
        {estado === "fallo" && (
          <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center text-14 text-ink-2">
            {textoFallo}
            <button type="button" onClick={() => setIntento((n) => n + 1)}
              className="h-11 rounded border border-line-strong bg-surface px-3 text-14 font-semibold text-ink active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              {textoReintentar}
            </button>
          </div>
        )}
      </div>
      {estado === "listo" && (
        <button type="button" onClick={alCentro}
          className="self-start text-14 font-medium text-ink underline underline-offset-4 min-h-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
          {textoCentro}
        </button>
      )}
    </div>
  );
}
