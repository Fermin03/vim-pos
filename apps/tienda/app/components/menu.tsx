"use client";
// El menú: las categorías con su barra pegajosa de chips (el activo sigue al desplazamiento) y los
// productos como una carta — texto a la izquierda, foto a la derecha si hay, sin hueco si no.
import { useEffect, useRef, useState } from "react";
import { cn } from "@vim/ui/styles";
import type { Menu, Producto } from "../lib/contrato";
import { formatoMxn } from "../lib/dinero";
import { urlDeFoto } from "../lib/imagen";
import { categoriaActiva } from "../lib/pantalla";
import { FOCO } from "./piezas";

/** Una foto que, si no carga, desaparece en vez de dejar el icono de imagen rota. */
export function Foto({ src, alt, lado, className }: { src: string; alt: string; lado: [number, number]; className?: string }) {
  const [rota, setRota] = useState(false);
  if (rota) return null;
  return (
    <img src={src} alt={alt} width={lado[0]} height={lado[1]} loading="lazy" decoding="async"
      onError={() => setRota(true)} className={cn("bg-hover object-cover", className)} />
  );
}

function Tarjeta({ producto, enPedido, alElegir }: { producto: Producto; enPedido: number; alElegir: (p: Producto) => void }) {
  const foto = urlDeFoto(producto.imagen_url);
  return (
    <li>
      <button type="button" disabled={producto.agotado}
        // Safari no enfoca un botón al tocarlo: sin esto, al cerrar la hoja el foco no tendría a dónde volver.
        onClick={(e) => { e.currentTarget.focus(); alElegir(producto); }}
        className={cn("flex w-full items-start gap-3 px-4 py-4 text-left transition-colors duration-150 hover:bg-hover active:bg-hover disabled:pointer-events-none", FOCO, "focus-visible:-outline-offset-2")}>
        <span className={cn("flex min-w-0 flex-1 flex-col gap-1", producto.agotado && "opacity-50")}>
          <span className="text-16 font-semibold leading-snug text-ink">{producto.nombre}</span>
          {producto.descripcion && <span className="line-clamp-2 text-14 leading-snug text-ink-2">{producto.descripcion}</span>}
          <span className="mt-1 flex flex-wrap items-center gap-2">
            <span className="font-display text-15 font-semibold tabular-nums text-ink">{formatoMxn(producto.precio_final_mxn)}</span>
            {enPedido > 0 && <span className="rounded bg-accent-soft px-1.5 py-0.5 text-12 font-semibold text-ink">{enPedido} en tu pedido</span>}
          </span>
        </span>
        {producto.agotado && <span className="mt-0.5 flex-shrink-0 rounded border border-line-strong px-2 py-0.5 text-12 font-semibold text-ink-2">Agotado</span>}
        {foto && <Foto src={foto} alt={`Foto de ${producto.nombre}`} lado={[96, 96]} className={cn("h-24 w-24 flex-shrink-0 rounded-lg", producto.agotado && "opacity-50 grayscale")} />}
      </button>
    </li>
  );
}

export function MenuDeLaTienda({ menu, enPedido, alElegir }: {
  menu: Menu; /** Piezas de cada producto que ya están en el carrito. */ enPedido: Map<string, number>; alElegir: (p: Producto) => void;
}) {
  const categorias = menu.categorias.filter((c) => c.productos.length > 0);
  const [activa, setActiva] = useState<string | null>(categorias[0]?.id ?? null);
  const barra = useRef<HTMLElement>(null);
  const ids = categorias.map((c) => c.id).join(",");

  // El chip activo sigue al desplazamiento: se mide una vez por cuadro, no por evento.
  useEffect(() => {
    let cuadro = 0;
    const medir = () => {
      cuadro = 0;
      // La línea va un poco por debajo de la barra: el chip cambia cuando el título ya es lo que se lee.
      const linea = (barra.current?.getBoundingClientRect().bottom ?? 0) + 64;
      const secciones = ids.split(",").filter(Boolean).map((id) => ({ id, top: document.getElementById(`cat-${id}`)?.getBoundingClientRect().top ?? Infinity }));
      const alFinal = scrollY > 0 && innerHeight + scrollY >= document.documentElement.scrollHeight - 2;
      setActiva(categoriaActiva(secciones, linea, alFinal));
    };
    const alMover = () => { cuadro ||= requestAnimationFrame(medir); };
    medir();
    addEventListener("scroll", alMover, { passive: true });
    addEventListener("resize", alMover);
    return () => { removeEventListener("scroll", alMover); removeEventListener("resize", alMover); cancelAnimationFrame(cuadro); };
  }, [ids]);

  // Y la barra se desliza sola para que el chip activo quede a la vista.
  useEffect(() => {
    const lista = barra.current?.firstElementChild, chip = lista?.querySelector<HTMLElement>('[aria-current="true"]');
    if (lista && chip) lista.scrollTo({ left: chip.offsetLeft - (lista.clientWidth - chip.offsetWidth) / 2 });
  }, [activa]);

  if (categorias.length === 0) {
    return <p className="px-4 py-16 text-center text-16 text-ink-2">Este menú todavía no tiene productos.</p>;
  }

  return (
    <>
      {categorias.length > 1 && (
        <nav ref={barra} aria-label="Categorías del menú" className="sticky top-0 z-10 border-b border-line bg-surface">
          <ul className="flex overflow-x-auto scroll-smooth px-2 [scrollbar-width:none] motion-reduce:scroll-auto [&::-webkit-scrollbar]:hidden">
            {categorias.map((c) => (
              <li key={c.id} className="flex-shrink-0">
                {/* El botón mide 44 px para el dedo; la pastilla que se ve, 36. */}
                <button type="button" aria-current={activa === c.id ? "true" : undefined}
                  onClick={() => document.getElementById(`cat-${c.id}`)?.scrollIntoView({ block: "start" })}
                  className={cn("group flex h-12 items-center px-1", FOCO, "focus-visible:-outline-offset-4")}>
                  <span className="flex h-9 items-center whitespace-nowrap rounded-full bg-hover px-4 text-14 font-semibold text-ink-2 transition-colors duration-150 group-aria-[current=true]:bg-ink group-aria-[current=true]:text-white">
                    {c.nombre}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}
      {categorias.map((c) => (
        <section key={c.id} id={`cat-${c.id}`} aria-labelledby={`cat-t-${c.id}`} className="scroll-mt-12">
          <h2 id={`cat-t-${c.id}`} className="px-4 pb-1 pt-6 font-display text-20 font-semibold">{c.nombre}</h2>
          <ul className="divide-y divide-line">
            {c.productos.map((p) => <Tarjeta key={p.id} producto={p} enPedido={enPedido.get(p.id) ?? 0} alElegir={alElegir} />)}
          </ul>
        </section>
      ))}
    </>
  );
}
