"use client";
// La tienda de una sucursal: DUEÑA del carrito. Lo lee del teléfono después de hidratar (nunca en
// el render: el servidor no lo tiene y el HTML no coincidiría), lo guarda con cada cambio y lo
// reparte al menú, a la hoja de producto, a la barra y al carrito.
//
// El paso «Tus datos / enviar» (components/datos.tsx) se pinta dentro de la hoja del carrito cuando
// `paso === "datos"`; lo que necesita de aquí es `PropsDelPasoDeDatos`.
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, botonClases, cn } from "@vim/ui/styles";
import { leerCuenta } from "../lib/api";
import {
  aCuerpo, agregar, cambiarCantidad, contarPiezas, estimarTotal, guardarCarrito, leerCarrito, quitar, revalidar, vaciar,
  type Carrito, type Seleccion,
} from "../lib/carrito";
import type { Menu, MiCuenta, Negocio, Producto, Sucursal } from "../lib/contrato";
import { rutaDelMenu, textoDeDescartados, tomarPorRepetir } from "../lib/cuenta";
import { formato } from "../lib/dinero";
import { semanaLegible, type Momento } from "../lib/horario";
import { carritoPara, motivoDeCierre, renglonesDelError } from "../lib/pantalla";
import { enlaceTel, formatoTelefono } from "../lib/telefono";
import { textoCerrada } from "../lib/textos";
import { envioDeLaPagina } from "../lib/envio";
import { VistaDelCarrito, useCotizacion } from "./carrito";
import { PasoDeDatos, useEnviando } from "./datos";
import { Entrega } from "./entrega";
import { CUERPO, Hoja, PIE } from "./hoja";
import { MenuDeLaTienda } from "./menu";
import { FOCO, PARTE, PRINCIPAL } from "./piezas";
import { ProductoPorAgregar } from "./producto";

type ErrorDeTienda = { error: string; detalle: string | null };
/** Cada cuánto se le vuelve a preguntar al servidor si la tienda está abierta, con la pestaña a la vista. */
const REFRESCO_MS = 60_000;

function Encabezado({ negocio, sucursal, carrito, ahora, alCambiarSucursal, children }: {
  negocio: Negocio; sucursal: Sucursal; carrito: Carrito; ahora: Momento; alCambiarSucursal: (id: string) => void; children: React.ReactNode;
}) {
  const motivo = motivoDeCierre(sucursal, carrito.modo);
  const tel = enlaceTel(sucursal.telefono);
  return (
    <section aria-label="La tienda" className="flex flex-col gap-4 px-4 pb-5">
      <h1 className="sr-only">Menú de {negocio.nombre}</h1>
      {negocio.descripcion && <p className={cn("text-15 leading-relaxed text-ink-2", PARTE)}>{negocio.descripcion}</p>}
      {negocio.sucursales.length > 1 && (
        <label className="flex flex-col gap-1">
          <span className="text-14 font-medium text-ink-2">Sucursal</span>
          <select value={sucursal.id} onChange={(e) => alCambiarSucursal(e.target.value)}
            className="h-12 w-full rounded border border-line-strong bg-surface px-3 text-16 text-ink focus:border-ink focus:outline-none">
            {negocio.sucursales.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
          </select>
        </label>
      )}
      <div className="flex flex-col gap-1 text-15">
        {/* El estado no depende solo del color: lo dice el texto; el punto solo acompaña. */}
        <p aria-live="polite" className="flex items-start gap-2 font-semibold">
          <span aria-hidden="true" className={cn("mt-2 h-2 w-2 flex-shrink-0 rounded-full", motivo ? "border-2 border-ink-3" : "bg-success")} />
          {motivo ? textoCerrada(motivo, sucursal.horario, ahora) : "Abierto"}
        </p>
        {sucursal.direccion && <p className={cn("pl-4 text-ink-2", PARTE)}>{sucursal.direccion}</p>}
        {sucursal.telefono && (
          <p className="pl-4">
            {tel
              ? <a href={tel} className={cn("inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4", FOCO)}>Llamar al {formatoTelefono(sucursal.telefono)}</a>
              : <span className="text-ink-2">{sucursal.telefono}</span>}
          </p>
        )}
        <details className="pl-4">
          <summary className={cn("inline-flex min-h-11 cursor-pointer items-center font-medium text-ink underline underline-offset-4", FOCO)}>Horario de la semana</summary>
          <table className="mb-2 w-full max-w-xs text-14">
            <tbody>
              {semanaLegible(sucursal.horario).map((d) => (
                <tr key={d.dia} className={cn(d.dia === ahora.dia ? "font-semibold text-ink" : "text-ink-2")}>
                  <th scope="row" className="py-1 pr-4 text-left [font-weight:inherit]">{d.nombre}{d.dia === ahora.dia && " (hoy)"}</th>
                  <td className="py-1 tabular-nums">{d.texto}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      </div>
      {children}
    </section>
  );
}

export function Tienda({ negocio, sucursal, menu, ahora, conSesion }: {
  negocio: Negocio; sucursal: Sucursal; menu: Menu;
  /** El momento (hora de México) con el que el servidor pintó: el navegador usa el mismo para que el HTML coincida. */
  ahora: Momento;
  /** Hay cookie de cuenta de este negocio (lo vio el servidor). Si sigue viva lo dice la función al usarla. */
  conSesion: boolean;
}) {
  const router = useRouter();
  // La cuenta se pide al llegar, no al abrir «Tus datos»: cuando el cliente llega ahí ya está y el
  // formulario no cambia bajo sus dedos. Si no llega (sin red), «Tus datos» es el de siempre y el
  // pedido se liga igual a la cuenta; si la sesión ya no vale, desde aquí es un invitado.
  const [sesion, setSesion] = useState(conSesion);
  const [mi, setMi] = useState<MiCuenta | null>(null);
  useEffect(() => {
    if (!conSesion) return;
    const corte = new AbortController();
    void leerCuenta(negocio.slug, corte.signal).then((r) => {
      if (corte.signal.aborted) return;
      if (r.ok) setMi(r.datos);
      else if (r.error === "SESION_INVALIDA") setSesion(false);
    });
    return () => corte.abort();
  }, [conSesion, negocio.slug]);
  /** «Pedir de nuevo» desde «Mi cuenta»: lo que ya no entró, para decirlo en el carrito. */
  const [noEntro, setNoEntro] = useState<string | null>(null);
  // null = todavía no se lee el teléfono. Mientras, se pinta con un carrito vacío de esta sucursal:
  // es lo mismo que pintó el servidor, y la barra del carrito solo aparece cuando ya se sabe.
  const [guardado, setCarrito] = useState<Carrito | null>(null);
  const carrito = useMemo(() => guardado ?? carritoPara(sucursal, null), [guardado, sucursal]);
  /** Un pedido empezado en OTRA sucursal: hay que decidir antes de tocar lo guardado. */
  const [ajeno, setAjeno] = useState<Carrito | null>(null);
  const [paso, setPaso] = useState<"menu" | "carrito" | "datos">("menu");
  /** Cambiar de paso por un toque del cliente: con un pedido enviándose no se mueve nada. Se pregunta al candado en el acto, no al estado. */
  const pasar = (p: typeof paso) => { if (!envioDeLaPagina.ocupado()) setPaso(p); };
  const [producto, setProducto] = useState<{ p: Producto; turno: number } | null>(null);
  const [verProducto, setVerProducto] = useState(false);
  const [nota, setNota] = useState("");
  const [errorDeEnvio, setErrorDeEnvio] = useState<ErrorDeTienda | null>(null);
  const sinCambios = useRef<Carrito | null>(null);
  /** Hay un pedido enviándose: mientras, no se sale de la hoja (salir dejaba mandarlo dos veces). */
  const enviando = useEnviando();

  // «Abierto» / «Cerrado ahora» son del momento en que el servidor pintó. Quien espera con la pestaña
  // abierta a que abran lo vería cerrado para siempre: se vuelve a pedir la página cada minuto y al
  // volver a la pestaña. `router.refresh()` conserva esta tienda montada (carrito, hojas, lo escrito)
  // mientras el servidor responda bien; si falla, la página pasa a «No pudimos cargar…» y lo que no
  // está guardado se pierde. Por eso no se refresca a medio envío, ni llenando «Tus datos», ni
  // eligiendo un producto: ahí no hay nada que ganar y sí algo que perder.
  const quieta = useRef(true);
  quieta.current = paso !== "datos" && !verProducto;
  useEffect(() => {
    const refrescar = () => { if (!document.hidden && quieta.current && !envioDeLaPagina.ocupado()) router.refresh(); };
    const reloj = setInterval(refrescar, REFRESCO_MS);
    document.addEventListener("visibilitychange", refrescar);
    return () => { clearInterval(reloj); document.removeEventListener("visibilitychange", refrescar); };
  }, [router]);

  useEffect(() => {
    // «Pedir de nuevo»: «Mi cuenta» dejó un pedido para esta sucursal. Se arma contra el menú de ahora
    // y, si algo entró, reemplaza al carrito guardado (se guarda ya: en desarrollo este efecto corre
    // dos veces y lo dejado se toma una sola). Si nada entró, el carrito que hubiera no se toca.
    const repetido = tomarPorRepetir(negocio.slug, sucursal.id, menu);
    if (repetido) {
      const entro = repetido.carrito.renglones.length > 0, falto = textoDeDescartados(repetido.descartados);
      if (entro) guardarCarrito(negocio.slug, repetido.carrito);
      setNoEntro(entro ? falto : `No pudimos armar ese pedido. ${falto ?? ""}`.trim());
      setPaso("carrito");
    }
    const leido = leerCarrito(negocio.slug);
    const deOtra = leido && leido.sucursalId !== sucursal.id && leido.renglones.length > 0
      && negocio.sucursales.some((s) => s.id === leido.sucursalId);
    const inicial = carritoPara(sucursal, leido);
    sinCambios.current = inicial;
    setAjeno(deOtra ? leido : null);
    setCarrito(inicial);
    // Solo al llegar a esta sucursal. `negocio` y `sucursal` son objetos nuevos en cada refresco de la
    // página: releer ahí pisaría el carrito en memoria (y lo vaciaría si el teléfono no deja guardar).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [negocio.slug, sucursal.id]);

  // Se guarda con cada cambio. No al cargar (visitar no renueva las 24 h del carrito) ni mientras
  // no se decida qué hacer con el pedido de la otra sucursal.
  useEffect(() => {
    if (guardado && !ajeno && guardado !== sinCambios.current) guardarCarrito(negocio.slug, guardado);
  }, [guardado, ajeno, negocio.slug]);

  const cambiar = (f: (c: Carrito) => Carrito) => { setErrorDeEnvio(null); setCarrito((c) => c && f(c)); };

  const piezas = contarPiezas(carrito);
  const enPedido = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of carrito.renglones) m.set(r.productoId, (m.get(r.productoId) ?? 0) + r.cantidad);
    return m;
  }, [carrito]);
  const porQuitar = useMemo(() => revalidar(carrito, menu), [carrito, menu]);
  const zonaLista = carrito.modo !== "DOMICILIO" || sucursal.zonas.length === 0 || sucursal.zonas.some((z) => z.id === carrito.zonaId);
  const cotizable = paso !== "menu" && piezas > 0 && zonaLista && Object.keys(porQuitar).length === 0;
  const cotizado = useCotizacion(negocio.slug, cotizable ? aCuerpo(carrito) : null);
  const errorDeCotizar = cotizado.resultado && !cotizado.resultado.ok ? cotizado.resultado : null;
  const avisos = {
    ...porQuitar,
    ...(errorDeCotizar && renglonesDelError(carrito, errorDeCotizar)),
    ...(errorDeEnvio && renglonesDelError(carrito, errorDeEnvio)),
  };

  const abrir = (p: Producto) => { setProducto((a) => ({ p, turno: (a?.turno ?? 0) + 1 })); setVerProducto(true); };
  const alAgregar = (s: Seleccion, cantidad: number, notaDelRenglon: string): boolean => {
    if (!guardado) return false;
    const nuevo = agregar(guardado, producto!.p, s, cantidad, notaDelRenglon);
    if (nuevo === guardado) return false;
    setErrorDeEnvio(null);
    setCarrito(nuevo);
    setVerProducto(false);
    return true;
  };
  const irA = (id: string) => router.push(`/${negocio.slug}?s=${id}`);
  const otra = ajeno && negocio.sucursales.find((s) => s.id === ajeno.sucursalId);

  const entrega = (
    <Entrega sucursal={sucursal} modo={carrito.modo} zonaId={carrito.zonaId}
      alCambiarModo={(modo) => cambiar((c) => ({ ...c, modo }))} alCambiarZona={(zonaId) => cambiar((c) => ({ ...c, zonaId }))} />
  );

  return (
    <div className={cn(piezas > 0 && "pb-24")}>
      <Encabezado negocio={negocio} sucursal={sucursal} carrito={carrito} ahora={ahora} alCambiarSucursal={irA}>{entrega}</Encabezado>
      <MenuDeLaTienda menu={menu} enPedido={enPedido} alElegir={abrir} />

      {guardado && piezas > 0 && (
        <div className="aparece pointer-events-none fixed inset-x-0 bottom-0 z-20 px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button type="button" onClick={(e) => { e.currentTarget.focus(); pasar("carrito"); }}
            aria-label={`Ver pedido: ${piezas} ${piezas === 1 ? "producto" : "productos"}, ${formato(estimarTotal(carrito, menu))}`}
            className={cn(PRINCIPAL, "pointer-events-auto mx-auto flex h-14 w-full max-w-xl justify-between px-5 text-16 shadow-lg")}>
            <span className="flex items-center gap-3">
              Ver pedido
              <span className="flex h-6 min-w-6 items-center justify-center rounded-full bg-sobre-accent/15 px-2 text-13 tabular-nums">{piezas}</span>
            </span>
            <span className="tabular-nums">{formato(estimarTotal(carrito, menu))}</span>
          </button>
        </div>
      )}

      <Hoja abierta={verProducto} alCerrar={() => setVerProducto(false)} titulo={producto?.p.nombre ?? "Producto"}>
        {/* La llave reinicia la selección cada vez que se abre un producto, sin desmontar la hoja. */}
        {producto && <ProductoPorAgregar key={producto.turno} producto={producto.p} alAgregar={alAgregar} />}
      </Hoja>

      <Hoja abierta={paso !== "menu" && !ajeno} fija={enviando} alCerrar={() => pasar("menu")} titulo={paso === "datos" ? "Tus datos" : "Tu pedido"}>
        {paso === "datos" ? (
          <PasoDeDatos negocio={negocio} sucursal={sucursal} carrito={carrito} nota={nota.trim()}
            cotizacion={cotizado.resultado?.ok ? cotizado.resultado.datos : null}
            alVolver={() => pasar("carrito")}
            alCambiarElTotal={cotizado.reintentar}
            // Llega con el resultado del envío, antes de que el candado se suelte: por eso no pasa por `pasar`.
            alErrorDeCarrito={(e) => { setErrorDeEnvio(e); setPaso("carrito"); }}
            alPedidoHecho={() => { setNota(""); cambiar(vaciar); }}
            cuenta={sesion ? mi : null} conSesion={sesion} alTerminarLaSesion={() => { setSesion(false); setMi(null); }}
            deVuelta={rutaDelMenu(negocio, sucursal.id)} />
        ) : (
          <>
          {noEntro && (
            <div className="px-4 pt-3" aria-live="polite">
              <Aviso tono="warning" className="!text-14" onCerrar={() => setNoEntro(null)}>{noEntro}</Aviso>
            </div>
          )}
          <VistaDelCarrito sucursal={sucursal} carrito={carrito} menu={menu} ahora={ahora} avisos={avisos} cotizado={cotizado}
            nota={nota} alCambiarNota={setNota}
            alCambiarCantidad={(id, n) => cambiar((c) => cambiarCantidad(c, id, n))} alQuitar={(id) => cambiar((c) => quitar(c, id))}
            alCambiarModo={(modo) => cambiar((c) => ({ ...c, modo }))} alCambiarZona={(zonaId) => cambiar((c) => ({ ...c, zonaId }))}
            alContinuar={() => pasar("datos")} alCerrar={() => pasar("menu")} />
          </>
        )}
      </Hoja>

      {/* El carrito es de una sola sucursal: cambiar con cosas dentro se confirma. Cerrar sin elegir
          es lo que no pierde nada: volver a donde estaba el pedido. */}
      <Hoja abierta={!!otra} alCerrar={() => otra && irA(otra.id)} titulo="Tienes un pedido en otra sucursal">
        {otra && ajeno && (
          <>
            <div className={cn(CUERPO, "px-4 py-5")}>
              <p className={cn("text-16 leading-relaxed", PARTE)}>
                Empezaste un pedido en <strong>{otra.nombre}</strong> ({contarPiezas(ajeno)} {contarPiezas(ajeno) === 1 ? "producto" : "productos"}).
                Un pedido es de una sola sucursal: si empiezas uno en <strong>{sucursal.nombre}</strong>, el otro se borra.
              </p>
            </div>
            <div className={cn(PIE, "flex flex-col gap-2")}>
              <button type="button" onClick={() => irA(otra.id)} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>Seguir en {otra.nombre}</button>
              <button type="button" onClick={() => { guardarCarrito(negocio.slug, carrito); setAjeno(null); }}
                className={cn(botonClases({ variant: "ghost" }), "h-12 w-full")}>Empezar en {sucursal.nombre}</button>
            </div>
          </>
        )}
      </Hoja>
    </div>
  );
}
