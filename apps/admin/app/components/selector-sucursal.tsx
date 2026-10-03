"use client";
/**
 * De qué sucursal son las cifras del panel y de los reportes.
 *
 * Antes todo sumaba las sucursales del negocio sin decirlo: un dueño con dos locales no podía ver
 * cómo iba cada uno sin abrir el consolidado, y el top de productos o los cortes de turno mezclaban
 * las dos cocinas. Ahora se mira UNA sucursal por defecto y "Todas" es la opción explícita.
 *
 * La elección viaja como el rango: en la URL (`?sucursal=`, se puede compartir) y entre pantallas
 * (localStorage, para que el panel y los reportes no vuelvan a la primera sucursal en cada clic).
 * Con una sola sucursal no hay nada que elegir y el control no se pinta.
 */
import { useCallback, useEffect, useState } from "react";
import { listarSucursalesOpciones, type SucursalOpcion } from "../lib/inventario";

const CLAVE = "vim.reportes.sucursal";
const TODAS = "todas";

export type SucursalReporte = {
  sucursales: SucursalOpcion[];
  /** La sucursal elegida; `null` = todas juntas. */
  id: string | null;
  /** Nombre para rótulos: el de la sucursal, o `null` si son todas. */
  nombre: string | null;
  /** `false` hasta saber qué sucursal mirar: antes de eso no se consulta nada. */
  listo: boolean;
  /** Para `useConsulta(..., extra)`: cambia cuando cambia la sucursal. */
  clave: string;
  /** "Sucursal Centro" / "Todas las sucursales" (para el Excel). Vacío con una sola sucursal. */
  alcance: string;
  cambiar: (id: string | null) => void;
};

function recordar(valor: string) {
  const u = new URL(window.location.href);
  u.searchParams.set("sucursal", valor);
  window.history.replaceState(window.history.state, "", u);
  try {
    localStorage.setItem(CLAVE, valor);
  } catch {
    /* sin almacenamiento: la elección vive solo en la URL */
  }
}

/** Elige con lo que hay: URL → lo último que se usó → la primera sucursal. */
export function elegirInicial(sucursales: SucursalOpcion[], url: string | null, guardada: string | null): string | null {
  if (sucursales.length <= 1) return sucursales[0]?.id ?? null;
  for (const v of [url, guardada]) {
    if (v === TODAS) return null;
    if (v && sucursales.some((s) => s.id === v)) return v;
  }
  return sucursales[0]!.id;
}

export function useSucursalReporte(): SucursalReporte {
  const [sucursales, setSucursales] = useState<SucursalOpcion[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let vivo = true;
    listarSucursalesOpciones()
      .then((lista) => {
        if (!vivo) return;
        let guardada: string | null = null;
        try {
          guardada = localStorage.getItem(CLAVE);
        } catch {
          guardada = null;
        }
        const inicial = elegirInicial(lista, new URLSearchParams(window.location.search).get("sucursal"), guardada);
        setSucursales(lista);
        setId(inicial);
        if (lista.length > 1) recordar(inicial ?? TODAS);
      })
      // Si no se pueden leer las sucursales, se ve todo junto (como antes) en vez de nada.
      .catch(() => {})
      .finally(() => {
        if (vivo) setListo(true);
      });
    return () => {
      vivo = false;
    };
  }, []);

  const cambiar = useCallback((nuevo: string | null) => {
    setId(nuevo);
    recordar(nuevo ?? TODAS);
  }, []);

  const nombre = id ? (sucursales.find((s) => s.id === id)?.nombre ?? null) : null;
  const varias = sucursales.length > 1;
  return {
    sucursales,
    id,
    nombre,
    listo,
    clave: id ?? TODAS,
    alcance: !varias ? "" : nombre ? `Sucursal ${nombre}` : "Todas las sucursales",
    cambiar,
  };
}

const campo =
  "h-11 min-w-0 max-w-full flex-1 rounded border border-line-strong bg-surface pl-2.5 pr-8 text-13 font-semibold outline-none transition-colors hover:border-ink focus:border-ink lg:h-9 lg:flex-none";

/** El control. No se pinta con una sola sucursal (o mientras carga). */
export function SelectorSucursal({ sucursal, className = "" }: { sucursal: SucursalReporte; className?: string }) {
  if (sucursal.sucursales.length <= 1) return null;
  return (
    <label className={`inline-flex min-w-0 items-center gap-2 ${className}`}>
      <span className="sr-only">Sucursal</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 flex-shrink-0 text-ink-3" aria-hidden="true">
        <path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6" />
      </svg>
      <select className={campo} value={sucursal.id ?? TODAS} onChange={(e) => sucursal.cambiar(e.target.value === TODAS ? null : e.target.value)}>
        {sucursal.sucursales.map((s) => (
          <option key={s.id} value={s.id}>
            {s.nombre}
          </option>
        ))}
        <option value={TODAS}>Todas las sucursales</option>
      </select>
    </label>
  );
}
