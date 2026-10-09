"use client";
// «Tus datos»: quién recibe, a dónde, cómo paga, y enviar. Vive dentro de la hoja del carrito.
// Aquí solo se pinta: las reglas de los campos están en lib/cliente.ts y qué hacer con cada respuesta
// de la función, en lib/envio.ts.
import { useEffect, useId, useRef, useState, useSyncExternalStore, type InputHTMLAttributes } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Captcha, SITE_KEY_TURNSTILE, botonClases, cn } from "@vim/ui/styles";
import { cotizar, pedir } from "../lib/api";
import { aCuerpo, type Carrito } from "../lib/carrito";
import {
  CAMPOS, FORMULARIO_VACIO, LIMITES, datosDelPedido, erroresDe, formasDePago, guardarCliente, leerCliente, olvidarCliente,
  type Campo, type Formulario,
} from "../lib/cliente";
import type { Cotizacion, ErrorDeTienda, Negocio, Pago, Sucursal } from "../lib/contrato";
import { aCentavos, formatoMxn } from "../lib/dinero";
import { enviarPedido, envioDeLaPagina, type Desenlace, type ResultadoDeEnvio } from "../lib/envio";
import { enlaceTel, formatoTelefono } from "../lib/telefono";
import { textoDeError } from "../lib/textos";
import { CUERPO, PIE } from "./hoja";
import { FOCO, PARTE, PRINCIPAL } from "./piezas";

export type PropsDelPasoDeDatos = {
  negocio: Negocio; sucursal: Sucursal; carrito: Carrito;
  /** La nota general para el restaurante (va en `nota` del pedido; vacía = sin nota). */
  nota: string;
  /** La última cotización del carrito tal como está: su total es el que el cliente vio. Antes de enviar se cotiza otra vez. */
  cotizacion: Cotizacion | null;
  /** De vuelta al carrito. */
  alVolver: () => void;
  /** El total ya no es el que traía el carrito: que lo cotice otra vez, para no enseñar el viejo al volver. */
  alCambiarElTotal: () => void;
  /** Un rechazo que señala un renglón: lo marca y regresa al carrito. */
  alErrorDeCarrito: (e: ErrorDeTienda) => void;
  /** El pedido entró: vacía el carrito (y lo guarda vacío). Después se navega al seguimiento. */
  alPedidoHecho: () => void;
};

type AvisoDeEnvio = Extract<Desenlace, { tipo: "aviso" }>;
/** Si el antirobot no entrega su comprobación en este tiempo, se deja de esperar y se dice. */
const ESPERA_DEL_ANTIROBOT_MS = 20_000;

const CAJA = "block w-full rounded border bg-surface px-3 text-16 text-ink placeholder:text-ink-3 focus:border-ink focus:outline-none focus:ring-1 focus:ring-ink";
const TITULO = "font-display text-16 font-semibold";
const GHOST = cn(botonClases({ variant: "ghost" }), "h-12 w-full");

/** Un campo: etiqueta visible, ayuda, y el error junto a él (enlazado para quien no ve la pantalla). */
function CampoDeTexto({ id, etiqueta, opcional, ayuda, error, multilinea, alCambiar, alSalir, className, ...resto }: {
  id: string; etiqueta: string; opcional?: boolean; ayuda?: string; error?: string; multilinea?: boolean;
  alCambiar: (v: string) => void; alSalir: () => void;
} & Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "onChange" | "onBlur">) {
  const describe = [ayuda && `${id}-ayuda`, error && `${id}-error`].filter(Boolean).join(" ") || undefined;
  const borde = error ? "border-danger" : "border-line-strong";
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-2 text-14 font-medium text-ink">
        {etiqueta}
        {opcional && <span className="flex-shrink-0 whitespace-nowrap text-13 font-normal text-ink-2">Opcional</span>}
      </label>
      {multilinea ? (
        <textarea id={id} rows={2} value={resto.value} maxLength={resto.maxLength} autoComplete={resto.autoComplete}
          aria-invalid={!!error} aria-describedby={describe}
          onChange={(e) => alCambiar(e.target.value)} onBlur={alSalir} className={cn(CAJA, borde, "resize-none py-2")} />
      ) : (
        <input id={id} type="text" {...resto} aria-invalid={!!error} aria-describedby={describe}
          onChange={(e) => alCambiar(e.target.value)} onBlur={alSalir} className={cn(CAJA, borde, "h-12")} />
      )}
      {ayuda && !error && <p id={`${id}-ayuda`} className="text-13 text-ink-2">{ayuda}</p>}
      {error && <p id={`${id}-error`} className="text-14 font-medium text-danger">{error}</p>}
    </div>
  );
}

/**
 * Lo que el cliente lleva escrito, mientras la página siga abierta: volver al carrito a cambiar algo
 * no debe costarle escribir su dirección otra vez. Solo en memoria; al teléfono llega únicamente lo
 * de un pedido que sí entró (`guardarCliente`).
 */
let borrador: Formulario | null = null;

/**
 * ¿Hay un pedido enviándose? Lo dice el candado de la página, no esta pantalla: así lo saben también
 * la tienda (que mientras no deja cerrar la hoja) y un «Tus datos» recién montado.
 */
export const useEnviando = (): boolean => useSyncExternalStore(envioDeLaPagina.suscribir, envioDeLaPagina.ocupado, () => false);

const IconoAtras = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
);

export function PasoDeDatos({ negocio, sucursal, carrito, nota, cotizacion, alVolver, alCambiarElTotal, alErrorDeCarrito, alPedidoHecho }: PropsDelPasoDeDatos) {
  const router = useRouter();
  const id = useId();
  const formas = formasDePago(negocio);
  const aDomicilio = carrito.modo === "DOMICILIO";
  const zona = sucursal.zonas.find((z) => z.id === carrito.zonaId);
  const tel = enlaceTel(sucursal.telefono);

  const [f, setF] = useState<Formulario>(borrador ?? FORMULARIO_VACIO);
  /** El pedido entró: la pantalla se queda en «Enviando…» hasta que llega la página del pedido. */
  const [hecho, setHecho] = useState(false);
  useEffect(() => { borrador = hecho ? null : f; }, [f, hecho]);
  const enviando = useEnviando();
  const [recordado, setRecordado] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<Campo>>(new Set());
  const [pago, setPago] = useState<Pago | null>(formas[0] ?? null);
  /** Lo que la función rechazó de un campo; se quita en cuanto el cliente lo cambia. */
  const [rechazo, setRechazo] = useState<Partial<Record<Campo | "pago", string>>>({});
  const [aviso, setAviso] = useState<AvisoDeEnvio | null>(null);
  /** El total que el cliente ya vio (el del botón). */
  const [totalVisto, setTotalVisto] = useState(cotizacion?.total_mxn ?? null);
  /** Un total distinto, a la espera de que lo confirme. */
  const [totalNuevo, setTotalNuevo] = useState<string | null>(null);
  /** Esperando la comprobación del antirobot para enviar. */
  const [robot, setRobot] = useState(false);
  const [token, setToken] = useState("");
  const [reinicio, setReinicio] = useState(0);
  const tokenAhora = useRef(token);
  tokenAhora.current = token;
  const titulo = useRef<HTMLHeadingElement>(null);

  // Lo recordado se lee después de hidratar: el servidor no lo tiene.
  useEffect(() => {
    const leido = leerCliente();
    // Lo recordado rellena solo lo que está vacío: nunca pisa lo que ya escribió en esta visita.
    if (leido) { setF((a) => ({ ...a, ...Object.fromEntries(Object.entries(leido).filter(([c]) => !a[c as Campo].trim())) })); setRecordado(true); }
    // El foco va al título, no a un campo: el teclado no debe taparle la pantalla a nadie.
    titulo.current?.focus();
  }, []);

  const contexto = { modo: carrito.modo, pago, total: aCentavos(totalNuevo ?? totalVisto ?? "") };
  const errores = erroresDe(f, contexto);
  const errorDe = (campo: Campo) => rechazo[campo] ?? (tocados.has(campo) ? errores[campo] : undefined);
  const enfocar = (campo: Campo | "pago") => setTimeout(() => document.getElementById(`${id}-${campo}`)?.focus(), 0);

  const campo = (c: Campo, etiqueta: string, extra: Partial<Parameters<typeof CampoDeTexto>[0]> = {}) => (
    <CampoDeTexto id={`${id}-${c}`} etiqueta={etiqueta} value={f[c]} error={errorDe(c)}
      maxLength={c === "pagaCon" ? 12 : LIMITES[c]}
      alCambiar={(v) => { setF((a) => ({ ...a, [c]: v })); setRechazo((r) => ({ ...r, [c]: undefined, ...(c === "pagaCon" && { pago: undefined }) })); }}
      alSalir={() => setTocados((t) => new Set(t).add(c))} {...extra} />
  );

  /**
   * Arranca el envío. Corre en el candado de la página, no en esta pantalla: si otra ya está
   * enviando, este no sale; y lo que no puede perderse (el pedido entró) no depende de que esta
   * pantalla siga montada cuando llegue la respuesta.
   */
  const mandar = (total: string | null) => {
    if (!pago) return;
    const cuerpo = aCuerpo(carrito), datos = f, modo = carrito.modo;
    envioDeLaPagina.lanzar(async () => {
      const r = await enviarPedido({
        cotizar: () => cotizar(negocio.slug, cuerpo),
        pedir: (totalEsperado) => pedir(negocio.slug, {
          ...cuerpo, ...datosDelPedido(datos, { modo, pago }), nota: nota || null,
          captcha: tokenAhora.current, total_esperado: totalEsperado,
        }),
        totalVisto: total,
      }, { telefono: sucursal.telefono, horario: sucursal.horario });
      if (r.desenlace.tipo === "hecho") {
        guardarCliente(datos, modo);
        borrador = null;
        alPedidoHecho();
        router.replace(`/${negocio.slug}/pedido/${r.desenlace.codigo}`);
      }
      return r;
    });
  };

  /** Lo que esta pantalla hace con el resultado de un envío (el suyo o uno que la alcanzó al montarse). */
  const alResultado = useRef<(r: ResultadoDeEnvio) => void>(() => {});
  alResultado.current = ({ desenlace, pidio }) => {
    // El token del antirobot sirve una vez: si se usó, se pide otro para el siguiente intento.
    if (pidio) { setToken(""); setReinicio((n) => n + 1); }
    if (desenlace.tipo === "hecho") setHecho(true);
    else if (desenlace.tipo === "carrito") alErrorDeCarrito(desenlace.error);
    else if (desenlace.tipo === "total") { setTotalNuevo(desenlace.total); alCambiarElTotal(); }
    else if (desenlace.tipo === "campo") {
      setRechazo({ [desenlace.campo]: desenlace.texto });
      enfocar(desenlace.campo === "pago" && pago === "EFECTIVO" && f.pagaCon.trim() ? "pagaCon" : desenlace.campo);
    } else setAviso(desenlace);
  };
  useEffect(() => envioDeLaPagina.recibir((r) => alResultado.current(r)), []);

  const ocupado = robot || enviando || hecho;

  /** El toque en «Enviar» (o en «Confirmar», con el total nuevo). */
  const intentar = (total: string | null) => {
    // El candado se pregunta en el acto: el estado de React llega un render tarde para un doble toque.
    if (ocupado || envioDeLaPagina.ocupado() || !pago) return;
    const conError = CAMPOS.find((c) => erroresDe(f, { ...contexto, total: aCentavos(total ?? "") })[c]);
    if (conError) { setTocados(new Set(CAMPOS)); enfocar(conError); return; }
    setAviso(null); setRechazo({}); setTotalNuevo(null); setTotalVisto(total);
    // Si el antirobot aún no entrega su comprobación, el botón no se queda muerto: lo dice y espera.
    if (SITE_KEY_TURNSTILE && !token) setRobot(true);
    else mandar(total);
  };

  useEffect(() => {
    if (!robot) return;
    if (token) { setRobot(false); mandar(totalVisto); return; }
    const reloj = setTimeout(() => {
      setRobot(false);
      const t = textoDeError("CAPTCHA_INVALIDO");
      setAviso({ tipo: "aviso", tono: "danger", texto: `${t.texto} ${t.hacer}`, sigue: "reintentar" });
    }, ESPERA_DEL_ANTIROBOT_MS);
    return () => clearTimeout(reloj);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo reacciona a la espera y a la llegada del token
  }, [robot, token]);

  // Enter en un campo solo envía cuando lo que se ofrece es enviar. Con «llama antes» o «vuelve a tu
  // pedido» en pantalla, Enter no manda nada: el reintento es un botón aparte, a propósito.
  const seOfreceEnviar = !!totalNuevo || !aviso || aviso.sigue === "reintentar";
  const total = totalNuevo ?? totalVisto;
  const estado = enviando || hecho ? "Enviando tu pedido…" : robot ? "Comprobando que no eres un robot…" : "";
  const botonDeEnviar = (etiqueta: string, importe: string | null) => (
    <button type="submit" disabled={ocupado || formas.length === 0} aria-busy={ocupado}
      className={cn(PRINCIPAL, "h-14 w-full px-5 text-16", ocupado ? "justify-center" : "justify-between")}>
      {ocupado ? estado : <><span>{etiqueta}</span><span className="tabular-nums">{importe ? formatoMxn(importe) : ""}</span></>}
    </button>
  );

  return (
    <form noValidate className="flex min-h-0 flex-1 flex-col" onSubmit={(e) => { e.preventDefault(); if (seOfreceEnviar) intentar(total); }}>
      <div className={CUERPO}>
        <div className="px-4 pt-1">
          <button type="button" onClick={alVolver} disabled={enviando || hecho} className={cn("-ml-2 inline-flex h-11 items-center gap-1 rounded px-2 text-15 font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40", FOCO)}>
            <IconoAtras />Tu pedido
          </button>
        </div>

        <section className="flex flex-col gap-4 px-4 pb-5 pt-2">
          <h3 ref={titulo} tabIndex={-1} className={cn(TITULO, "outline-none")}>¿Quién recibe?</h3>
          {campo("nombre", "Nombre", { autoComplete: "name", autoCapitalize: "words" })}
          {campo("telefono", "Teléfono", { type: "tel", inputMode: "tel", autoComplete: "tel-national", ayuda: "10 dígitos. El restaurante te llama si hay alguna duda con tu pedido." })}
          {campo("email", "Correo", { type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "none", spellCheck: false, opcional: true, ayuda: "Para mandarte el enlace de tu pedido." })}
        </section>

        <section className="flex flex-col gap-4 border-t border-line px-4 py-5">
          {aDomicilio ? (
            <>
              <div>
                <h3 className={TITULO}>¿A dónde lo llevamos?</h3>
                {zona && <p className={cn("mt-1 text-14 text-ink-2", PARTE)}>Zona de entrega: {zona.nombre}</p>}
              </div>
              {campo("calle", "Calle", { autoComplete: "address-line1" })}
              <div className="grid grid-cols-2 gap-3">
                {campo("numeroExterior", "Núm. exterior")}
                {campo("numeroInterior", "Núm. interior", { opcional: true })}
              </div>
              {campo("colonia", "Colonia", { autoComplete: "address-level3" })}
              <div className="grid grid-cols-[8rem_1fr] gap-3">
                {campo("codigoPostal", "Código postal", { inputMode: "numeric", autoComplete: "postal-code" })}
                {campo("ciudad", "Ciudad", { autoComplete: "address-level2" })}
              </div>
              {campo("estado", "Estado", { autoComplete: "address-level1" })}
              {campo("referencias", "Referencias", { multilinea: true, opcional: true, ayuda: "Entre qué calles, color de la casa, con quién dejarlo." })}
            </>
          ) : (
            <div className={PARTE}>
              <h3 className={TITULO}>Recoges en {sucursal.nombre}</h3>
              {sucursal.direccion && <p className="mt-1 text-15 text-ink-2">{sucursal.direccion}</p>}
            </div>
          )}
        </section>

        <section id={`${id}-pago`} role="group" tabIndex={-1} aria-labelledby={`${id}-pago-titulo`} aria-describedby={rechazo.pago ? `${id}-pago-error` : undefined}
          className="flex min-w-0 flex-col gap-3 border-t border-line px-4 py-5 outline-none">
          <h3 id={`${id}-pago-titulo`} className={TITULO}>¿Cómo pagas?</h3>
          <p className="text-14 text-ink-2">Pagas al recibir tu pedido.</p>
          {formas.length === 0 && <Aviso tono="warning" role="status" className="!text-14">Este restaurante no está recibiendo pagos por aquí. Llama para hacer tu pedido.</Aviso>}
          {formas.length === 1 && <p className="text-16 font-medium">{pago === "EFECTIVO" ? "En efectivo" : "Con tarjeta"}</p>}
          {formas.length > 1 && (
            <ul role="radiogroup" aria-labelledby={`${id}-pago-titulo`} className="divide-y divide-line border-y border-line">
              {formas.map((p) => (
                <li key={p}>
                  <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-16">
                    <input type="radio" name={`${id}-forma`} checked={pago === p} onChange={() => { setPago(p); setRechazo((r) => ({ ...r, pago: undefined })); }} className="h-5 w-5 flex-shrink-0 accent-ink" />
                    {p === "EFECTIVO" ? "En efectivo" : "Con tarjeta"}
                  </label>
                </li>
              ))}
            </ul>
          )}
          {pago === "TARJETA" && <p className="text-15 text-ink-2">{aDomicilio ? "Paga con tarjeta al recibir: el restaurante lleva la terminal." : "Paga con tarjeta al recoger tu pedido."}</p>}
          {pago === "EFECTIVO" && campo("pagaCon", "¿Con cuánto pagas?", { inputMode: "decimal", autoComplete: "off", opcional: true, ayuda: "Para llevar tu cambio listo." })}
          {rechazo.pago && <p id={`${id}-pago-error`} role="alert" className="text-14 font-medium text-danger">{rechazo.pago}</p>}
        </section>

        <div className="flex flex-col gap-2 border-t border-line px-4 py-5 text-13 leading-relaxed text-ink-2">
          <p>
            Al enviar aceptas que el restaurante use estos datos para tu pedido.{" "}
            <Link href={`/${negocio.slug}/privacidad`} target="_blank" rel="noopener" className={cn("font-medium text-ink underline underline-offset-4", FOCO)}>Aviso de privacidad</Link>.
          </p>
          {recordado && (
            <p>
              Llenamos tus datos con los de tu último pedido, guardados en este teléfono.{" "}
              <button type="button" className={cn("font-medium text-ink underline underline-offset-4", FOCO)}
                onClick={() => { olvidarCliente(); setF((a) => ({ ...FORMULARIO_VACIO, pagaCon: a.pagaCon })); setTocados(new Set()); setRecordado(false); }}>
                Olvidar mis datos
              </button>
            </p>
          )}
        </div>
      </div>

      <div className={cn(PIE, "flex flex-col gap-2")}>
        <p aria-live="polite" className="sr-only">{estado}</p>
        <Captcha onToken={setToken} accion="tienda_pedido" reinicio={reinicio} />
        {totalNuevo ? (
          <>
            <Aviso tono="warning" role="alert" className="!text-14">{textoDeError("TOTAL_CAMBIO", { detalle: totalNuevo }).texto} Confirma para enviar tu pedido con ese total.</Aviso>
            {botonDeEnviar("Confirmar y enviar", totalNuevo)}
            {!ocupado && <button type="button" onClick={alVolver} className={GHOST}>Volver a tu pedido</button>}
          </>
        ) : (
          <>
            {aviso && <Aviso tono={aviso.tono} role="alert" className="!text-14">{aviso.texto}</Aviso>}
            {aviso && (aviso.sigue === "llamar" || aviso.sigue === "llamar-antes") ? (
              <>
                {tel
                  ? <a href={tel} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>Llamar al {formatoTelefono(sucursal.telefono ?? "")}</a>
                  : sucursal.telefono && <p className="text-16 font-semibold">{sucursal.telefono}</p>}
                {aviso.sigue === "llamar-antes"
                  // Reintentar aquí es a propósito y con el riesgo dicho: el pedido pudo haber entrado.
                  ? <button type="button" onClick={() => intentar(total)} disabled={ocupado} className={GHOST}>Ya llamé y no les llegó: enviar otra vez</button>
                  : <button type="button" onClick={alVolver} className={GHOST}>Volver a tu pedido</button>}
              </>
            ) : aviso?.sigue === "volver" ? (
              <button type="button" onClick={alVolver} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>Volver a tu pedido</button>
            ) : botonDeEnviar("Enviar pedido", total)}
          </>
        )}
      </div>
    </form>
  );
}
