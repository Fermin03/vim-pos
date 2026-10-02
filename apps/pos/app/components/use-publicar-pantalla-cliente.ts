"use client";
import { useEffect, useRef } from "react";
import { abrirCanal, crearPublicador, LATIDO_MS } from "../lib/pantalla-cliente/canal";
import { construirVista, type EntradaVista, type Negocio, type VistaCliente } from "../lib/pantalla-cliente/vista";

/**
 * Publica a la pantalla del cliente lo que la caja tiene en la venta. Si no hay segunda pantalla
 * nadie escucha y no pasa nada: publicar no cuesta y no depende de saber si está abierta.
 */
export function usePublicarPantallaCliente(entrada: EntradaVista, negocio: Negocio): void {
  const publicador = useRef<ReturnType<typeof crearPublicador> | null>(null);
  const negocioRef = useRef(negocio);
  negocioRef.current = negocio;

  useEffect(() => {
    const canal = abrirCanal();
    if (!canal) return;
    const p = crearPublicador(canal, () => negocioRef.current);
    publicador.current = p;
    p.anunciar();
    const id = setInterval(() => p.latir(), LATIDO_MS);
    return () => { clearInterval(id); p.cerrar(); publicador.current = null; };
  }, []);

  // La vista se compara por su texto: el carrito cambia de identidad en cada render aunque el
  // cliente no vaya a ver nada distinto, y no hay por qué mandar el mismo mensaje dos veces.
  const clave = JSON.stringify(construirVista(entrada));
  useEffect(() => {
    publicador.current?.publicar(JSON.parse(clave) as VistaCliente);
  }, [clave]);
}
