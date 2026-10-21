"use client";
import { Icono } from "@vim/ui/styles";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { buscarEnMenu, caminoDe, rutaActiva, type Grupo, type MenuAdmin, type Nodo } from "../lib/menu-admin";

/**
 * El menú lateral en árbol (estilo Square). Tocar un grupo lo despliega o lo pliega, sin navegar;
 * abrir uno cierra a su hermano abierto. Al cambiar de página se despliega el camino de la página
 * actual. Con texto en el buscador, el árbol se cambia por la lista de coincidencias.
 *
 * Sin animación de altura a propósito: es un menú que se abre decenas de veces al día.
 */
export function MenuLateral({ menu, pathname, marcaPlan, alNavegar }: {
  menu: MenuAdmin;
  pathname: string;
  marcaPlan: (href: string) => boolean;
  /** Se llama al tocar cualquier opción, también un ancla de la misma página (Informes), donde la
   *  ruta no cambia y quien escucha la ruta (el cajón del celular) no se entera. */
  alNavegar?: () => void;
}) {
  const router = useRouter();
  const activa = rutaActiva(menu, pathname);
  const camino = caminoDe(menu, activa).join(" ");
  const [abiertos, setAbiertos] = useState<string[]>(() => caminoDe(menu, activa));
  const [texto, setTexto] = useState("");

  // Navegar despliega el camino de la página actual. Depende del camino y no del menú: una lectura
  // que llega tarde (reportes, módulos) recalcula el menú y no debe plegar lo que el usuario abrió.
  useEffect(() => {
    setAbiertos(camino ? camino.split(" ") : []);
    setTexto("");
  }, [camino, activa]);

  const navegado = () => { setTexto(""); alNavegar?.(); };

  // Con la ventana baja el menú hace scroll: al llegar a una página, su opción se trae a la vista.
  // Solo al navegar; abrir otro grupo no debe mover el menú.
  const navRef = useRef<HTMLElement>(null);
  useEffect(() => {
    navRef.current?.querySelector("[aria-current=page]")?.scrollIntoView({ block: "nearest" });
  }, [activa]);

  const alternar = (grupo: Grupo, hermanos: Nodo[]) => {
    setAbiertos((prev) => {
      if (prev.includes(grupo.id)) {
        // Plegar un grupo pliega también lo que tenía abierto adentro.
        const dentro = new Set(idsDentro(grupo));
        return prev.filter((id) => id !== grupo.id && !dentro.has(id));
      }
      const fuera = new Set(hermanos.filter((n): n is Grupo => n.tipo === "grupo").flatMap((n) => [n.id, ...idsDentro(n)]));
      return [...prev.filter((id) => !fuera.has(id)), grupo.id];
    });
  };

  const resultados = buscarEnMenu(menu, texto);
  // Arriba, los canales son hermanos de los grupos principales: abrir Tienda cierra Ajustes.
  const raiz = [...menu.principal, ...menu.canales];

  return (
    <>
      <div className="relative mx-3 mb-1 mt-3">
        <Icono nombre="buscar" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#76767E]" />
        <input
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape" && texto) { e.stopPropagation(); setTexto(""); }
            if (e.key === "Enter" && resultados[0]) { router.push(resultados[0].href); navegado(); }
          }}
          placeholder="Buscar en el menú"
          aria-label="Buscar en el menú"
          className="h-11 w-full rounded border border-[#2C2C32] bg-[#1E1E23] pl-9 pr-3 text-16 text-white lg:text-14 placeholder:text-[#76767E] focus:border-[#4A4A52] focus:outline-none lg:h-9"
        />
      </div>

      <nav
        ref={navRef}
        aria-label="Menú del panel"
        onClick={(e) => { if ((e.target as Element).closest("a")) navegado(); }}
        // Hace scroll, pero sin barra visible (decisión de Fermín, 21 oct).
        className="scroll-x-limpio flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-3 pb-4 pt-2"
      >
        {texto.trim() ? (
          resultados.length === 0 ? (
            <p className="px-3 py-2 text-13 text-[#76767E]">Nada en el menú con «{texto.trim()}».</p>
          ) : (
            resultados.map((r) => (
              <Link key={r.href} href={r.href} className={claseHoja(false, 0)}>
                <span className="min-w-0">
                  <span className="block">{r.label}</span>
                  {r.ruta.length > 0 && <span className="block text-12 font-normal text-[#76767E]">{r.ruta.join(" › ")}</span>}
                </span>
              </Link>
            ))
          )
        ) : (
          <>
            <Rama nodos={menu.principal} hermanos={raiz} nivel={0} abiertos={abiertos} activa={activa} alternar={alternar} marcaPlan={marcaPlan} />
            {menu.canales.length > 0 && <div role="separator" className="mx-3 my-2 flex-shrink-0 border-t border-[#2C2C32]" />}
            <Rama nodos={menu.canales} hermanos={raiz} nivel={0} abiertos={abiertos} activa={activa} alternar={alternar} marcaPlan={marcaPlan} />
          </>
        )}
      </nav>
    </>
  );
}

function idsDentro(g: Grupo): string[] {
  return g.hijos.flatMap((n) => (n.tipo === "grupo" ? [n.id, ...idsDentro(n)] : []));
}

const sangria = ["px-3", "pl-[42px] pr-3", "pl-[54px] pr-3"];

function claseHoja(activa: boolean, nivel: number) {
  return [
    // flex-shrink-0: con el menú desplegado, las opciones no se aplastan; el menú hace scroll.
    "flex min-h-[44px] flex-shrink-0 items-center gap-[11px] rounded py-[9px] text-sm font-medium transition-colors lg:min-h-0",
    "[&_svg]:h-[18px] [&_svg]:w-[18px] [&_svg]:flex-shrink-0 [&_svg]:stroke-current",
    sangria[nivel] ?? sangria[2],
    nivel > 0 && "lg:py-[7px]",
    activa ? "bg-white font-semibold text-ink" : "text-[#C8C8CC] hover:bg-[#1E1E23] hover:text-white",
  ].filter(Boolean).join(" ");
}

function EtiquetaPlan({ activa }: { activa: boolean }) {
  return (
    <span className={["ml-auto rounded-full border px-1.5 py-px text-11 font-semibold", activa ? "border-line-strong text-ink-2" : "border-[#3A3A42] text-[#9A9AA2]"].join(" ")}>
      Plan Negocio
    </span>
  );
}

function Rama({ nodos, hermanos = nodos, nivel, abiertos, activa, alternar, marcaPlan }: {
  nodos: Nodo[];
  hermanos?: Nodo[];
  nivel: number;
  abiertos: string[];
  activa: string | null;
  alternar: (g: Grupo, hermanos: Nodo[]) => void;
  marcaPlan: (href: string) => boolean;
}) {
  return nodos.map((n) =>
    n.tipo === "hoja" ? (
      <Link key={n.href} href={n.href} aria-current={n.href === activa ? "page" : undefined} className={claseHoja(n.href === activa, nivel)}>
        {n.icon && <Icono nombre={n.icon} />}
        {n.label}
        {marcaPlan(n.href) && <EtiquetaPlan activa={n.href === activa} />}
      </Link>
    ) : (
      <GrupoMenu key={n.id} grupo={n} hermanos={hermanos} nivel={nivel} abiertos={abiertos} activa={activa} alternar={alternar} marcaPlan={marcaPlan} />
    ),
  );
}

function GrupoMenu({ grupo, hermanos, nivel, abiertos, activa, alternar, marcaPlan }: {
  grupo: Grupo;
  hermanos: Nodo[];
  nivel: number;
  abiertos: string[];
  activa: string | null;
  alternar: (g: Grupo, hermanos: Nodo[]) => void;
  marcaPlan: (href: string) => boolean;
}) {
  const id = useId();
  const abierto = abiertos.includes(grupo.id);
  // "Plan Negocio" en el grupo si TODAS sus opciones lo llevan (Inventario).
  const hojas = hojasDe(grupo);
  const plan = hojas.length > 0 && hojas.every(marcaPlan);
  return (
    <div className="contents">
      <button
        type="button"
        aria-expanded={abierto}
        aria-controls={id}
        onClick={() => alternar(grupo, hermanos)}
        className={[
          claseHoja(false, nivel),
          "w-full text-left",
          abierto && nivel === 0 && "text-white",
        ].filter(Boolean).join(" ")}
      >
        {grupo.icon && <Icono nombre={grupo.icon} />}
        <span className="min-w-0 flex-1 truncate">{grupo.label}</span>
        {plan && <EtiquetaPlan activa={false} />}
        <Icono
          nombre="chevron-abajo"
          className={["!h-4 !w-4 text-[#76767E] transition-transform duration-150 ease-out motion-reduce:transition-none", abierto && "rotate-180"].filter(Boolean).join(" ")}
        />
      </button>
      <div id={id} className="contents">
        {abierto && <Rama nodos={grupo.hijos} nivel={nivel + 1} abiertos={abiertos} activa={activa} alternar={alternar} marcaPlan={marcaPlan} />}
      </div>
    </div>
  );
}

function hojasDe(g: Grupo): string[] {
  return g.hijos.flatMap((n) => (n.tipo === "hoja" ? [n.href] : hojasDe(n)));
}
