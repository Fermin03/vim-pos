"use client";
// El reto del banco (3D Secure) dentro de la pantalla de la tarjeta: la página de Mercado Pago en un
// marco. Lo que pasa ahí dentro (el código del banco, su aplicación) no es de la tienda ni se toca:
// aquí solo se le da lugar. Qué pasó con el pago lo dice el servidor (lib/verificacion.ts); el
// título, la línea de apoyo y «Cancelar» los pone «Tus datos» (datos.tsx).
//
// La dirección llega ya comprobada (https y de Mercado Pago: `urlDeReto`); este componente no abre
// ninguna otra cosa. La CSP de la tienda (`frame-src`) tampoco dejaría.
import { useState } from "react";
import { cn } from "@vim/ui/styles";
import { RETO } from "../lib/textos";

export function MarcoDelReto({ url }: {
  /** null = todavía no se tiene (se llegó recargando la página): se le está preguntando al servidor. */
  url: string | null;
}) {
  const [cargado, setCargado] = useState(false);
  const conMarco = url !== null;
  return (
    // A todo el ancho de la hoja (sin el margen de los textos): en un teléfono la página del banco
    // necesita cada pixel. El alto es fijo —lo que suele pedir un reto, con la franja de cookies de
    // Mercado Pago— y, si el contenido es más alto, se desplaza por dentro del marco.
    <div className={cn("relative border-t border-line bg-surface", conMarco ? "h-[500px]" : "min-h-32")}>
      <p aria-live="polite" className="absolute inset-0 flex items-center justify-center px-4 text-center text-15 text-ink-2">
        {cargado ? "" : RETO.cargando}
      </p>
      {conMarco && (
        // Sin `sandbox`: la página del banco necesita sus scripts, sus formularios y su propio origen.
        // Entra con un fundido corto cuando ya cargó, para que no se vea el marco en blanco.
        <iframe key={url} src={url} title={RETO.marco} onLoad={() => setCargado(true)}
          className={cn("absolute inset-0 h-full w-full transition-opacity duration-200 ease-vim motion-reduce:transition-none", cargado ? "opacity-100" : "opacity-0")} />
      )}
    </div>
  );
}
