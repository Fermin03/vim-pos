"use client";
import { useEffect, useRef, useState } from "react";
import { capasCarrusel, pasoSiguiente, type Anuncio, type ListaAnuncios } from "../lib/pantalla-cliente/anuncios";

/*
 * Fundido cruzado: la imagen que entra aparece ENCIMA de la que sale, solo con opacidad, 400 ms y
 * `--ease-out`. Cada imagen lleva el fondo de la página detrás (`bg-bg`), así que al terminar tapa
 * por completo a la anterior aunque tengan proporciones distintas. Con `prefers-reduced-motion`
 * no hay fundido: la que entra tapa a la otra de golpe (corte seco).
 */
const FUNDIDO_ANUNCIO = "animate-[vim-fade_400ms_var(--ease-out)] motion-reduce:animate-none";
/** Lo que dura el fundido de arriba; pasado esto la imagen se dibuja sin animación. */
const FUNDIDO_MS = 400;
// `object-contain`: el anuncio se ve entero en cualquier monitor; lo que sobra es fondo de página.
const CAPA = "absolute inset-0 h-full w-full bg-bg object-contain";

type Cuadro = { actual: Anuncio | null; anterior: Anuncio | null };

/**
 * Los anuncios del negocio en la pantalla del cliente, de uno en uno y a pantalla completa.
 * Diseño: `docs/diseno/pantalla-cliente.md`. Sin controles, sin puntos, sin texto encima.
 *
 * Qué imagen sigue, cuánto espera y qué pasa cuando una no carga lo decide `pasoSiguiente`
 * (con pruebas). Aquí solo queda lo del navegador: precargar, el temporizador y pintar.
 */
export function CarruselAnuncios({ lista, alQuedarseSinImagenes }: { lista: ListaAnuncios; alQuedarseSinImagenes: () => void }) {
  const [cuadro, setCuadro] = useState<Cuadro>({ actual: null, anterior: null });
  // Sube cuando la imagen que está en pantalla resulta rota: vuelve a correr el efecto de abajo.
  const [fallas, setFallas] = useState(0);
  // Las imágenes que no cargaron, de ESTA lista: una lista nueva las vuelve a intentar todas.
  const memoria = useRef({ lista, rotos: new Set<string>() });
  // El padre pasa una función nueva en cada render: se guarda aparte para no rearmar el temporizador.
  const avisar = useRef(alQuedarseSinImagenes);
  useEffect(() => { avisar.current = alQuedarseSinImagenes; });

  // Una vuelta por cada imagen que llega a la pantalla (o por cada lista nueva): precarga la que
  // sigue desde ya y la enseña cuando se cumple el tiempo de la que está. El tiempo es el de cada
  // imagen, por eso el temporizador se arma aquí y no con un intervalo fijo.
  useEffect(() => {
    if (memoria.current.lista !== lista) memoria.current = { lista, rotos: new Set() };
    const { rotos } = memoria.current;
    let reloj: ReturnType<typeof setTimeout> | undefined;
    let precarga: HTMLImageElement | null = null;
    let cargada: Anuncio | null = null;
    let vencido = false;

    const soltar = () => {
      if (precarga) { precarga.onload = null; precarga.onerror = null; precarga = null; }
    };
    // Se cambia solo cuando ya pasó el tiempo Y la siguiente ya cargó: nunca aparece a medio pintar.
    const cambiar = () => {
      const entra = cargada;
      if (vencido && entra) setCuadro((c) => ({ actual: entra, anterior: c.actual }));
    };
    /** Empieza a precargar la que sigue. Devuelve cuánto esperar, o null si no hay a cuál cambiar. */
    const preparar = (): number | null => {
      const paso = pasoSiguiente(lista, cuadro.actual, rotos);
      if (paso.hacer === "nada") { avisar.current(); return null; }
      if (paso.hacer === "quedarse") return null;
      const img = new Image();
      precarga = img;
      img.onload = () => { cargada = paso.anuncio; cambiar(); };
      img.onerror = () => {
        // No cargó: se anota y se prueba con la que sigue, sin tocar el tiempo de la que está.
        rotos.add(paso.anuncio.id);
        soltar();
        if (preparar() === null) clearTimeout(reloj);
      };
      img.src = paso.anuncio.url;
      return paso.enMs;
    };

    const enMs = preparar();
    if (enMs !== null) reloj = setTimeout(() => { vencido = true; cambiar(); }, enMs);
    return () => { clearTimeout(reloj); soltar(); };
  }, [lista, cuadro.actual, fallas]);

  // Cumplido el fundido de la que entra, se le quita la animación: queda opaca aunque el navegador
  // no haya avanzado la animación (ventana tapada, pestaña en segundo plano). Ver `capasCarrusel`.
  const [asentada, setAsentada] = useState<string | null>(null);
  const { actual } = cuadro;
  useEffect(() => {
    if (!actual) return;
    const reloj = setTimeout(() => setAsentada(actual.url), FUNDIDO_MS);
    return () => clearTimeout(reloj);
  }, [actual]);

  return (
    <section className="relative flex-1 overflow-hidden">
      {/* Una sola lista con `key`: al cambiar, la que estaba conserva su <img> (no se vuelve a montar
          ni a decodificar) y se queda debajo, ya sin animación, hasta el siguiente cambio. La nueva
          se agrega al final, o sea encima. */}
      {capasCarrusel(cuadro, asentada).map(({ anuncio: a, fundiendo }) => (
        // eslint-disable-next-line @next/next/no-img-element -- archivo local de la caja: sin red, sin optimizador
        <img
          key={a.url}
          src={a.url}
          alt=""
          draggable={false}
          className={fundiendo ? `${CAPA} ${FUNDIDO_ANUNCIO}` : CAPA}
          // Ya había cargado en la precarga; si aun así falla al pintarse, se anota y se pasa a otra.
          onError={a === actual ? () => { memoria.current.rotos.add(a.id); setFallas((n) => n + 1); } : undefined}
        />
      ))}
    </section>
  );
}
