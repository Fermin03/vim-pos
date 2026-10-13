"use client";
// «Tus datos», en pantallas: (1) quién recibe o recoge, a dónde y la nota; (2) cómo paga y, en línea,
// la propina; (3) la tarjeta. Viven dentro de la hoja del carrito. Aquí solo se pinta: qué pantallas
// hay y a cuál se va está en lib/pasos.ts, las reglas de los campos en lib/cliente.ts, la propina en
// lib/pago.ts y qué hacer con cada respuesta de la función en lib/envio.ts.
//
// Si el banco pide confirmar el pago (3D Secure), el reto se abre aquí mismo, en lugar de la pantalla
// de la tarjeta (components/reto.tsx): no se navega ni se manda otro pago hasta saber cómo acabó.
//
// Todo lo escrito vive en ESTE componente, no en cada pantalla: ir y venir entre ellas no pierde
// nada. La tarjeta (iframes de Mercado Pago) se monta al llegar a la tercera pantalla, no antes, y
// desde ahí se queda montada aunque se regrese: así tampoco se pierde lo escrito en ella.
//
// Con una cuenta abierta (entrega 6) los datos salen de ella —nombre, teléfono, correo y sus
// direcciones guardadas— y NADA se lee ni se escribe en el teléfono (`vim.tienda.cliente`): eso es
// del invitado. Lo prellenado se puede cambiar para este pedido sin tocar la cuenta.
//
// TEXTOS PROVISIONALES (James): «Continuar», «Ir a pagar», «Regresar», «Paso N de M», la pregunta de
// la propina y «Ahora no».
import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Aviso, Captcha, SITE_KEY_TURNSTILE, botonClases, cn } from "@vim/ui/styles";
import { cotizar, guardarDireccion, intento, pedir, verificacion } from "../lib/api";
import { TOPES, aCuerpo, type Carrito } from "../lib/carrito";
import {
  CAMPOS, DE_DIRECCION, FORMULARIO_VACIO, LIMITES, datosDelPedido, erroresDe, guardarCliente, leerCliente, olvidarCliente,
  type Campo, type Formulario,
} from "../lib/cliente";
import type { Cotizacion, DireccionGuardada, ErrorDeTienda, MiCuenta, Negocio, Pago, Sucursal } from "../lib/contrato";
import { LIMITES_DE_CUENTA, direccionEnUnaLinea, enlaceDeAcceso, formularioDeDireccion, paraTusDatos } from "../lib/cuenta";
import { formatoMxn } from "../lib/dinero";
import { enviarPedido, envioDeLaPagina, intentoDelNegocio, pruebaQueNoHuboCobro, resolverDuda, type Desenlace, type ResultadoDeEnvio } from "../lib/envio";
import { formasDePago, leerOtroMonto, propinaDe, totalAPagar, type Propina as Porcentaje, type PropinaElegida } from "../lib/pago";
import { accionDe, avanzar, pasoDelDesenlace, pasosDe, type Paso } from "../lib/pasos";
import { textoDeRechazo, type CampoDeTarjeta } from "../lib/tarjeta";
import { enlaceTel, formatoTelefono } from "../lib/telefono";
import { RETO, apoyoDePago, nombreDePago, textoDeError } from "../lib/textos";
import { esFinDelReto, retoQueSigue, seOfreceCancelar, vigilarReto, type PasoDelReto, type Reto } from "../lib/verificacion";
import { CampoDeTexto } from "./campo";
import { CamposDeTarjeta, type ManejoDeTarjeta } from "./tarjeta";
import { Linea } from "./carrito";
import { COLUMNA, CUERPO, PIE } from "./hoja";
import { FOCO, PARTE, PRINCIPAL } from "./piezas";
import { Propina } from "./propina";
import { MarcoDelReto } from "./reto";

export type PropsDelPasoDeDatos = {
  negocio: Negocio; sucursal: Sucursal; carrito: Carrito;
  /** La nota general para el restaurante, tal como va escrita (va en `nota` del pedido; vacía = sin nota). */
  nota: string;
  alCambiarNota: (n: string) => void;
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
  /** Hay una cuenta abierta: el pedido queda ligado a ella y el teléfono no recuerda nada. */
  conSesion: boolean;
  /** La cuenta y sus direcciones, cuando ya llegaron (la pide la tienda al cargar). null = sin sesión, o todavía no. */
  cuenta: MiCuenta | null;
  /** La función dijo que la sesión ya no vale (el servidor ya borró la cookie): desde ahora es un invitado. */
  alTerminarLaSesion: () => void;
  /** A dónde vuelve quien sale a entrar o a crear su cuenta: el menú de esta sucursal. El carrito lo espera en el teléfono. */
  deVuelta: string;
  /** El reto del banco está a la vista (o dejó de estarlo): mientras, la hoja no se cierra. */
  alRetener?: (retenida: boolean) => void;
};

type AvisoDeEnvio = Extract<Desenlace, { tipo: "aviso" }>;
/** Si el antirobot no entrega su comprobación en este tiempo, se deja de esperar y se dice. */
const ESPERA_DEL_ANTIROBOT_MS = 20_000;

const TITULO = "font-display text-16 font-semibold";
const GHOST = cn(botonClases({ variant: "ghost" }), "h-12 w-full");
const DE_TEXTO = cn("inline-flex min-h-11 items-center font-medium text-ink underline underline-offset-4", FOCO);

/** «Otra dirección»: la que se escribe a mano, en vez de una guardada en la cuenta. */
const OTRA = "otra";
const TOPE_DE_DIRECCIONES = 5;
const esDeDireccion = (c: string): boolean => (DE_DIRECCION as readonly string[]).includes(c);
/** Los campos de dirección de «Tus datos» con lo de una guardada (su etiqueta no es de este formulario). */
const camposDe = (d: DireccionGuardada): Partial<Formulario> => {
  const { etiqueta: _etiqueta, ...campos } = formularioDeDireccion(d);
  return campos;
};
const SIN_DIRECCION: Partial<Formulario> = Object.fromEntries(DE_DIRECCION.map((c) => [c, ""]));
/** De `nuevo`, solo lo que en `a` está vacío: lo prellenado nunca pisa lo que el cliente ya escribió. */
const soloVacios = (a: Formulario, nuevo: Partial<Formulario>): Partial<Formulario> =>
  Object.fromEntries(Object.entries(nuevo).filter(([c]) => !a[c as Campo].trim()));

/**
 * Lo que el cliente lleva escrito y elegido, mientras la página siga abierta: volver al carrito a
 * cambiar algo no debe costarle escribir su dirección ni elegir su propina otra vez (ni que se le
 * vuelva a preguntar por ella: `preguntada` es «una vez por pedido»). Solo en memoria; al teléfono
 * llega únicamente lo de un pedido de invitado que sí entró (`guardarCliente`).
 */
let borrador: { f: Formulario; direccion: string; pago: Pago | null; propina: PropinaElegida; otro: string; preguntada: boolean } | null = null;

/**
 * ¿Hay un pedido enviándose? Lo dice el candado de la página, no esta pantalla: así lo saben también
 * la tienda (que mientras no deja cerrar la hoja) y un «Tus datos» recién montado.
 */
export const useEnviando = (): boolean => useSyncExternalStore(envioDeLaPagina.suscribir, envioDeLaPagina.ocupado, () => false);

const IconoAtras = () => (
  <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
);

export function PasoDeDatos({
  negocio, sucursal, carrito, nota, alCambiarNota, cotizacion, alVolver, alCambiarElTotal, alErrorDeCarrito, alPedidoHecho,
  conSesion, cuenta, alTerminarLaSesion, deVuelta, alRetener,
}: PropsDelPasoDeDatos) {
  const router = useRouter();
  const id = useId();
  /** El intento de compra de ESTE negocio: el de otro restaurante no se mira ni se suelta desde aquí. */
  const intentoDeLaPagina = intentoDelNegocio(negocio.slug);
  const formas = formasDePago(negocio, sucursal);
  const aDomicilio = carrito.modo === "DOMICILIO";
  const zona = sucursal.zonas.find((z) => z.id === carrito.zonaId);
  const tel = enlaceTel(sucursal.telefono);

  const [f, setF] = useState<Formulario>(borrador?.f ?? FORMULARIO_VACIO);
  /** La dirección elegida: el id de una guardada, `OTRA`, o "" mientras no se sabe si hay guardadas. */
  const [direccion, setDireccion] = useState(borrador?.direccion ?? "");
  /** «Guardar esta dirección en mi cuenta», y con qué nombre. */
  const [guardar, setGuardar] = useState(false);
  const [etiqueta, setEtiqueta] = useState("Casa");
  /** El pedido entró: la pantalla se queda en «Enviando…» hasta que llega la página del pedido. */
  const [hecho, setHecho] = useState(false);
  /**
   * Se mandó un pago en línea y no se sabe qué pasó con él. Mientras sea así NO se manda otro (sería
   * otro pedido y otro cobro) ni se cambia de pantalla: se le pregunta al servidor por ese intento.
   * `sin-respuesta`: no contestó.
   */
  const [duda, setDuda] = useState<"comprobando" | "sin-respuesta" | null>(null);
  /**
   * El banco pide confirmar el pago (3D Secure): el reto está a la vista en lugar de la tarjeta. No se
   * ha cobrado nada y el intento sigue en duda. `url`: la página del reto (null mientras el servidor
   * la dice). `esperando`: el reto terminó, o el cliente lo canceló, y falta que el servidor diga cómo quedó.
   */
  const [reto, setReto] = useState<Reto | null>(null);
  const enviando = useEnviando();
  const guardadas = cuenta?.direcciones ?? [];
  const elegida = guardadas.find((d) => d.id === direccion);
  const [recordado, setRecordado] = useState(false);
  const [tocados, setTocados] = useState<ReadonlySet<Campo>>(new Set());
  const [pago, setPago] = useState<Pago | null>(borrador?.pago && formas.includes(borrador.pago) ? borrador.pago : formas[0] ?? null);
  const enLinea = pago === "EN_LINEA";
  /** La propina, solo al pagar en línea. Nace sin elegir: «Sin propina» también la decide el cliente. */
  const [propina, setPropina] = useState<PropinaElegida>(borrador?.propina ?? null);
  /** Lo escrito en «Otro monto», tal cual. */
  const [otro, setOtro] = useState(borrador?.otro ?? "");
  const [otroTocado, setOtroTocado] = useState(false);
  /** «¿Gustas dejar una propina?» ya salió en este pedido: no se repite. */
  const [preguntada, setPreguntada] = useState(borrador?.preguntada ?? false);
  /** La pregunta está a la vista (en lugar de la pantalla del pago). */
  const [preguntando, setPreguntando] = useState(false);
  useEffect(() => { borrador = hecho ? null : { f, direccion, pago, propina, otro, preguntada }; }, [f, direccion, pago, propina, otro, preguntada, hecho]);
  /** En qué pantalla va y a qué se le da el foco al llegar (null = a su título). Un objeto nuevo cada vez: el foco vuelve aunque la pantalla sea la misma. */
  const [vista, setVista] = useState<{ paso: Paso; foco: string | null }>({ paso: "datos", foco: null });
  /** Ya se llegó a la pantalla de la tarjeta: desde aquí sus campos se quedan montados. */
  const [conTarjeta, setConTarjeta] = useState(false);
  /** Los campos de la tarjeta (solo al pagar en línea): de ahí sale el token de cada intento. */
  const tarjeta = useRef<ManejoDeTarjeta>(null);
  /** Lo que el banco (o la librería de Mercado Pago) dijo de la tarjeta en el último intento. */
  const [rechazoDeTarjeta, setRechazoDeTarjeta] = useState<{ campo: CampoDeTarjeta | null; texto: string } | null>(null);
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
  const cuerpo = useRef<HTMLDivElement>(null);

  const pasos = pasosDe(formas, pago);
  const paso: Paso = pasos.includes(vista.paso) ? vista.paso : pasos[pasos.length - 1]!;
  const accion = accionDe(pasos, paso, pago);
  const enLaUltima = accion === "enviar" || accion === "pagar";
  const idDelTitulo = `${id}-titulo-${reto ? "reto" : preguntando ? "propina" : paso}`;

  const irA = (p: Paso, foco: string | null = null) => {
    if (p === "tarjeta") setConTarjeta(true);
    setPreguntando(false);
    setVista({ paso: p, foco });
  };

  // Al llegar a una pantalla el foco va a su título, no a un campo: el teclado no debe taparle la
  // pantalla a nadie, y un lector de pantalla oye dónde está. Si se llegó por un dato que corregir,
  // el foco va a ese dato. La pantalla nueva empieza arriba.
  useEffect(() => {
    const destino = vista.foco ? document.getElementById(vista.foco) : null;
    if (destino) { destino.focus(); return; }
    if (cuerpo.current) cuerpo.current.scrollTop = 0;
    document.getElementById(idDelTitulo)?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de pantalla (o al pedir el foco otra vez)
  // (También cuando el marco del reto se quita —terminó o se canceló—: el foco estaba dentro de él
  // o en «Cancelar», y sin esto se perdería fuera de la hoja.)
  }, [vista, preguntando, reto === null, reto?.esperando]);

  // Sin sesión: lo recordado en el teléfono (se lee después de hidratar: el servidor no lo tiene).
  // Con sesión no se toca. Si la sesión termina a medio pedido, desde ahí es un invitado más.
  useEffect(() => {
    if (conSesion) return;
    const leido = leerCliente();
    if (leido) { setF((a) => ({ ...a, ...soloVacios(a, leido) })); setRecordado(true); }
  }, [conSesion]);

  // Con sesión: nombre, teléfono y correo de la cuenta y, a domicilio, su primera dirección guardada.
  // Si ya había escrito una dirección (o ya eligió), se respeta.
  useEffect(() => {
    if (!cuenta) return;
    const primera = cuenta.direcciones[0];
    const usarPrimera = !!primera && direccion === "" && !f.calle.trim();
    if (direccion === "") setDireccion(usarPrimera ? primera.id : OTRA);
    setF((a) => ({ ...a, ...soloVacios(a, paraTusDatos(cuenta.cuenta)), ...(usarPrimera && camposDe(primera)) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando llega (o cambia) la cuenta
  }, [cuenta]);

  const elegirDireccion = (cual: string) => {
    const d = guardadas.find((x) => x.id === cual);
    setDireccion(d ? d.id : OTRA);
    // Una guardada llena los campos (que quedan ocultos); «Otra» los deja en blanco para escribir.
    setF((a) => ({ ...a, ...(d ? camposDe(d) : SIN_DIRECCION) }));
    setTocados((t) => new Set([...t].filter((c) => !esDeDireccion(c))));
    setRechazo((r) => ({ ...r, calle: undefined }));
  };

  const contexto = { modo: carrito.modo, enLinea };
  const errores = erroresDe(f, contexto);
  const errorDe = (campo: Campo) => rechazo[campo] ?? (tocados.has(campo) ? errores[campo] : undefined);
  /** A la primera pantalla, con el foco en ese campo. */
  const alCampo = (campo: Campo) => {
    // Un error en una dirección guardada no se puede señalar en campos ocultos: se abren, con lo que traía.
    if (esDeDireccion(campo)) setDireccion(OTRA);
    irA("datos", `${id}-${campo}`);
  };

  const campo = (c: Campo, etiqueta: string, extra: Partial<Parameters<typeof CampoDeTexto>[0]> = {}) => (
    <CampoDeTexto id={`${id}-${c}`} etiqueta={etiqueta} value={f[c]} error={errorDe(c)}
      maxLength={LIMITES[c]}
      alCambiar={(v) => { setF((a) => ({ ...a, [c]: v })); setRechazo((r) => ({ ...r, [c]: undefined })); }}
      alSalir={() => setTocados((t) => new Set(t).add(c))} {...extra} />
  );

  // La propina que se ENSEÑA sale del subtotal de productos de la última cotización; la que se cobra
  // la calcula (o la acota) el servidor con la misma cuenta. Mientras se cotiza otra vez se conserva
  // el último subtotal que se supo: el tope del «otro monto» no desaparece a media escritura.
  const ultimoSubtotal = useRef(cotizacion?.subtotal_mxn ?? null);
  if (cotizacion) ultimoSubtotal.current = cotizacion.subtotal_mxn;
  const subtotal = ultimoSubtotal.current;
  const montoDe = (pct: Porcentaje): string | null => (subtotal ? propinaDe(subtotal, pct) : null);
  const libre = propina === "otro" ? leerOtroMonto(otro, subtotal) : null;
  const montoDePropina = libre ? (libre.ok ? libre.monto : null) : montoDe(typeof propina === "number" ? propina : 0);

  /**
   * Arranca el envío. Corre en el candado de la página, no en esta pantalla: si otra ya está
   * enviando, este no sale; y lo que no puede perderse (el pedido entró) no depende de que esta
   * pantalla siga montada cuando llegue la respuesta.
   */
  const mandar = (total: string | null) => {
    if (!pago) return;
    const cuerpoDelCarrito = aCuerpo(carrito), datos = f, modo = carrito.modo;
    const delPedido = datosDelPedido(datos, { modo, pago, propina: typeof propina === "number" ? propina : 0, propinaMxn: libre?.ok ? libre.monto : undefined });
    // La dirección nueva que pidió guardar en su cuenta (solo con sesión, a domicilio y escrita a mano).
    const porGuardar = conSesion && guardar && !elegida && delPedido.direccion
      ? { ...delPedido.direccion, id: null, etiqueta: etiqueta.trim() || "Casa" } : null;
    const elPedido = { ...cuerpoDelCarrito, ...delPedido, nota: nota.trim() || null };
    // La misma clave mientras se reintente ESTE pedido; otra si algo de él cambió (también la forma
    // de pago o la propina —el porcentaje o el otro monto—, que van dentro de `delPedido`).
    const clave = intentoDeLaPagina.para({ negocio: negocio.slug, ...elPedido });
    const manejo = tarjeta.current;
    // Lo que se guarda cuando ESTE pedido entra, sea ahora o al terminar el reto del banco. Con sesión
    // el teléfono no recuerda nada: los datos viven en la cuenta. Guardar la dirección va aparte y sin
    // esperar: si falla, el pedido ya entró y no se le estorba (la agrega en «Mi cuenta»).
    alEntrar.current = () => {
      if (!conSesion) guardarCliente(datos, modo);
      else if (porGuardar) void guardarDireccion(negocio.slug, porGuardar);
    };
    envioDeLaPagina.lanzar(async () => {
      // La tarjeta se convierte en un token AQUÍ, en cada intento: es de un solo uso. Si un dato no
      // cuadra no se llama a nadie: no se creó ningún pedido.
      const t = pago === "EN_LINEA" ? await (manejo?.tokenizar() ?? Promise.resolve({ ok: false as const, campo: null, texto: textoDeError("PAGO_NO_DISPONIBLE").texto })) : null;
      if (t && !t.ok) return { desenlace: { tipo: "tarjeta" as const, campo: t.campo, texto: t.texto }, pidio: false, error: null };
      const r = await enviarPedido({
        cotizar: () => cotizar(negocio.slug, cuerpoDelCarrito),
        pedir: (totalEsperado) => {
          // Va a salir un cobro: desde AHORA (y aunque se recargue la página) la clave no cambia hasta saber qué pasó.
          if (pago === "EN_LINEA") intentoDeLaPagina.dudar();
          return pedir(negocio.slug, { ...elPedido, ...(t && { tarjeta: t.tarjeta }), clave, captcha: tokenAhora.current, total_esperado: totalEsperado });
        },
        totalVisto: total,
      }, { telefono: sucursal.telefono, horario: sucursal.horario, otrasFormas: formas.length > 1 });
      if (r.desenlace.tipo === "hecho") {
        intentoDeLaPagina.cerrar();
        alEntrar.current?.();
        alEntrar.current = null;
        borrador = null;
        alPedidoHecho();
        router.replace(`/${negocio.slug}/pedido/${r.desenlace.codigo}`);
      } else if (r.error && pruebaQueNoHuboCobro(r.error)) {
        // El servidor dijo que ese cobro no pasó y que el pedido se descartó: ya no hay nada en duda.
        intentoDeLaPagina.aclarar();
      }
      return r;
    });
  };

  /** Lo que hay que guardar cuando el pedido en curso entre (ver `mandar`). null = nada (se llegó recargando). */
  const alEntrar = useRef<(() => void) | null>(null);

  /** Lo que esta pantalla hace con el resultado de un envío (el suyo o uno que la alcanzó al montarse). */
  const alResultado = useRef<(r: ResultadoDeEnvio) => void>(() => {});
  alResultado.current = ({ desenlace, pidio }) => {
    // El token del antirobot sirve una vez: si se usó, se pide otro para el siguiente intento.
    if (pidio) { setToken(""); setReinicio((n) => n + 1); }
    // A dónde vive el dato que hay que corregir (lib/pasos.ts); null = el aviso sale aquí mismo.
    const destino = pasoDelDesenlace(desenlace, pasos);
    if (desenlace.tipo === "hecho") setHecho(true);
    // El banco pide confirmar: se abre el reto aquí mismo. No hay cobro todavía y la duda sigue.
    else if (desenlace.tipo === "verificar") setReto({ codigo: desenlace.codigo, url: desenlace.url, esperando: false, cancelado: false });
    // Salió un cobro y no se sabe qué pasó (sin respuesta, o un error que no lo aclara): no se ofrece
    // «reintentar». Se pregunta por ese intento, y hasta saberlo el formulario queda bloqueado.
    else if (intentoDeLaPagina.enDuda()) void comprobar.current();
    else if (desenlace.tipo === "tarjeta") {
      // No se creó ningún pedido ni se cobró nada: se dice junto a la tarjeta y el foco va ahí.
      setRechazoDeTarjeta({ campo: desenlace.campo, texto: desenlace.texto });
      if (destino && destino !== paso) irA(destino);
      setTimeout(() => tarjeta.current?.enfocar(desenlace.campo), 0);
    }
    else if (desenlace.tipo === "carrito") alErrorDeCarrito(desenlace.error);
    else if (desenlace.tipo === "total") { setTotalNuevo(desenlace.total); alCambiarElTotal(); }
    else if (desenlace.tipo === "campo") {
      setRechazo({ [desenlace.campo]: desenlace.texto });
      if (desenlace.campo === "pago") irA(destino ?? "datos", `${id}-pago`);
      else alCampo(desenlace.campo);
    } else {
      // La sesión terminó: desde aquí es un invitado (el servidor ya borró la cookie). Él decide si
      // entra otra vez o manda el pedido así; no se reenvía solo.
      if (desenlace.sigue === "sesion") alTerminarLaSesion();
      setAviso(desenlace);
    }
  };
  useEffect(() => envioDeLaPagina.recibir((r) => alResultado.current(r)), []);

  /** Pregunta por el intento en duda. Libera el formulario solo si el servidor dice que no hay pedido ni cobro. */
  const comprobar = useRef<() => Promise<void>>(async () => {});
  comprobar.current = async () => {
    setDuda("comprobando"); setAviso(null);
    const d = await resolverDuda(intentoDeLaPagina, (clave) => intento(negocio.slug, clave), (codigo) => verificacion(negocio.slug, codigo, false));
    if (d.tipo === "verificar") {
      // El pedido espera el reto del banco (se recargó la página a medias, o la respuesta se perdió): se continúa ese.
      setDuda(null);
      setReto({ codigo: d.codigo, url: d.url, esperando: false, cancelado: false });
    } else if (d.tipo === "libre" && d.rechazo !== undefined) {
      // Ese pago no pasó y el pedido se descartó: se dice, y se puede pagar otra vez.
      setDuda(null);
      decirRechazo.current(d.rechazo);
    } else if (d.tipo === "hecho") {
      // El pedido sí había entrado: a su página, que dice cómo va el pago.
      setHecho(true); setDuda(null);
      borrador = null;
      alPedidoHecho();
      router.replace(`/${negocio.slug}/pedido/${d.codigo}`);
    } else setDuda(d.tipo === "libre" ? null : "sin-respuesta");
  };
  // Al abrir (o recargar) la pantalla con un intento de pago en duda: lo primero es preguntar por él.
  useEffect(() => {
    if (intentoDeLaPagina.enDuda() && !envioDeLaPagina.ocupado()) void comprobar.current();
  }, []);

  /** Un pago que no pasó (y no se cobró): junto a la tarjeta, con el foco ahí; sin pantalla de tarjeta a la vista, encima del botón. */
  const decirRechazo = useRef<(detalle: string | null) => void>(() => {});
  decirRechazo.current = (detalle) => {
    const t = textoDeRechazo(detalle, formas.length > 1);
    if (!pasos.includes("tarjeta")) { setAviso({ tipo: "aviso", tono: "danger", texto: t.texto, sigue: "reintentar" }); return; }
    setRechazoDeTarjeta(t);
    irA("tarjeta");
    setTimeout(() => tarjeta.current?.enfocar(t.campo), 0);
  };

  /** Lo que el servidor dijo del reto (lib/verificacion.ts). Solo él dice cómo acabó. */
  const alPasoDelReto = useRef<(codigo: string, p: PasoDelReto) => void>(() => {});
  alPasoDelReto.current = (codigo, p) => {
    if (p.tipo === "sigue") {
      // Sigue: nada cambia, salvo que faltara la dirección o que el aviso de «terminó» hubiera llegado
      // antes de tiempo (entonces el marco vuelve). Lo decide `retoQueSigue` (lib/verificacion.ts).
      setReto((r) => (r && r.codigo === codigo ? retoQueSigue(r, p) : r));
    } else if (p.tipo === "pedido") {
      // Pagado, o ya no espera el reto: el pedido entró y su página dice cómo va.
      intentoDeLaPagina.cerrar();
      alEntrar.current?.();
      alEntrar.current = null;
      borrador = null;
      setHecho(true); setReto(null);
      alPedidoHecho();
      router.replace(`/${negocio.slug}/pedido/${codigo}`);
    } else if (p.tipo === "rechazado") {
      // El servidor confirmó que no hay cobro y descartó el pedido: ya no hay nada en duda.
      intentoDeLaPagina.aclarar();
      const cancelado = reto?.cancelado ?? false;
      setReto(null);
      decirRechazo.current(cancelado ? "CANCELADO" : p.detalle);
    }
  };
  const vigia = useRef<ReturnType<typeof vigilarReto> | null>(null);
  const codigoDelReto = reto?.codigo ?? null, sinDireccion = reto !== null && reto.url === null;
  useEffect(() => {
    if (!codigoDelReto) return;
    const v = vigilarReto({
      preguntar: (cancelar, signal) => verificacion(negocio.slug, codigoDelReto, cancelar, signal),
      alPaso: (p) => alPasoDelReto.current(codigoDelReto, p),
      yaMismo: sinDireccion,
    });
    vigia.current = v;
    // La página del reto avisa que terminó (no dice cómo): el marco se quita —se queda en blanco— y
    // se le pregunta ya al servidor. Solo se oye a Mercado Pago, y solo ese mensaje.
    const alMensaje = (e: MessageEvent) => {
      if (!esFinDelReto(e.origin, e.data)) return;
      setReto((r) => (r && r.codigo === codigoDelReto ? { ...r, esperando: true } : r));
      v.ahora();
    };
    window.addEventListener("message", alMensaje);
    return () => { v.detener(); vigia.current = null; window.removeEventListener("message", alMensaje); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un vigía por reto: la dirección que llega después no lo reinicia
  }, [codigoDelReto, negocio.slug]);
  /**
   * «Cancelar»: el marco se quita y se le dice al servidor que el cliente deja el reto. El servidor
   * cierra ese pedido sin pago en el acto (Mercado Pago no deja cancelar una orden que espera el
   * reto: la sigue vigilando él) y contesta que ya se puede pagar otra vez.
   */
  const cancelarReto = () => {
    setReto((r) => (r ? { ...r, esperando: true, cancelado: true } : r));
    vigia.current?.cancelar();
  };
  // Con el reto a la vista la hoja no se cierra: cerrarla dejaría el reto vivo y sin pantalla.
  const enReto = reto !== null;
  useEffect(() => {
    alRetener?.(enReto);
    return () => alRetener?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo cuando el reto aparece o se va
  }, [enReto]);

  // Con un intento en duda (o enviando, o con el reto del banco a la vista) no se navega: ni adelante ni atrás.
  const ocupado = robot || enviando || hecho || duda !== null || enReto;

  /** Manda el pedido con ese total (el del botón, o el nuevo que confirmó). */
  const intentar = (total: string | null) => {
    setAviso(null); setRechazo({}); setRechazoDeTarjeta(null); setTotalNuevo(null); setTotalVisto(total);
    // Si el antirobot aún no entrega su comprobación, el botón no se queda muerto: lo dice y espera.
    if (SITE_KEY_TURNSTILE && !token) setRobot(true);
    else mandar(total);
  };

  /** El toque en el botón principal: qué sigue lo decide `avanzar` (lib/pasos.ts). */
  const alBoton = (total: string | null) => {
    // El candado se pregunta en el acto: el estado de React llega un render tarde para un doble toque.
    if (ocupado || envioDeLaPagina.ocupado() || !pago) return;
    const a = avanzar({ pasos, paso, primerError: CAMPOS.find((c) => errores[c]), enLinea, propina, otroValido: libre?.ok ?? false, yaPreguntada: preguntada });
    if (a.tipo === "campo") { setTocados(new Set(CAMPOS)); alCampo(a.campo); }
    // Se queda en la pregunta si es ahí donde lo está escribiendo; si no, a la pantalla del pago.
    else if (a.tipo === "otro-monto") { setOtroTocado(true); setVista({ paso: "pago", foco: `${id}-otro` }); }
    else if (a.tipo === "preguntar") { setPreguntada(true); setPreguntando(true); }
    else if (a.tipo === "paso") irA(a.paso);
    else intentar(total);
  };

  /** La flecha: a la pantalla anterior (o al carrito desde la primera). Nada de lo escrito se pierde. */
  const regresar = () => {
    if (ocupado || envioDeLaPagina.ocupado()) return;
    if (preguntando) { setPreguntando(false); return; }
    const anterior = pasos[pasos.indexOf(paso) - 1];
    if (anterior) irA(anterior); else alVolver();
  };

  const elegirPropina = (p: Porcentaje | "otro") => {
    setPropina(p);
    // «Otro monto» abre su campo y le da el foco: aquí el teclado sí se pidió.
    if (p === "otro") setVista({ paso: "pago", foco: `${id}-otro` });
    // En la pregunta, un porcentaje contesta y sigue a la tarjeta.
    else if (preguntando) irA("tarjeta");
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

  // Enter en un campo hace lo del botón principal. En la última pantalla solo envía cuando lo que se
  // ofrece es enviar: con «llama al restaurante» o «vuelve a tu pedido» a la vista, Enter no manda nada.
  const seOfreceEnviar = !!totalNuevo || !aviso || aviso.sigue === "reintentar" || aviso.sigue === "reintentar-seguro" || aviso.sigue === "sesion";
  const total = totalNuevo ?? totalVisto;
  const aPagar = enLinea && total ? totalAPagar(total, montoDePropina) : total;
  const estado = reto ? (reto.cancelado ? RETO.cancelando : reto.esperando ? RETO.confirmando : "") : duda ? "Confirmando tu pago…" : (enviando || hecho) && enLinea ? "Procesando tu pago…"
    : enviando || hecho ? "Enviando tu pedido…" : robot ? "Comprobando que no eres un robot…" : "";
  // Con `key`: React no debe reciclar para este botón el nodo de otro que ocupaba su lugar. Sin ella,
  // el toque en «Ahora no» (que al pintarse de nuevo dejaba su sitio a «Pagar») terminaba, en el mismo
  // clic, enviando el formulario: el navegador activa el botón tal como quedó DESPUÉS del clic.
  const boton = (etiqueta: string, importe: string | null) => (
    <button key="principal" type="submit" disabled={ocupado || formas.length === 0} aria-busy={ocupado}
      className={cn(PRINCIPAL, "h-14 w-full px-5 text-16", ocupado ? "justify-center" : "justify-between")}>
      {ocupado ? estado : <><span>{etiqueta}</span><span className="tabular-nums">{importe ? formatoMxn(importe) : ""}</span></>}
    </button>
  );
  const titulo = (texto: string, cual: Paso | "propina" | "reto") => (
    <h3 id={`${id}-titulo-${cual}`} tabIndex={-1} aria-describedby={pasos.length > 1 && cual !== "reto" ? `${id}-paso` : undefined} className={cn(TITULO, "outline-none")}>{texto}</h3>
  );
  const propinaDeLaPantalla = (modo: "elegir" | "preguntar") => (
    <Propina id={id} modo={modo} propina={propina} alElegir={elegirPropina} montoDe={montoDe} tope={subtotal} montoDeOtro={libre?.ok ? libre.monto : null} deshabilitado={ocupado}
      otro={otro} alCambiarOtro={setOtro} alSalirDeOtro={() => setOtroTocado(true)}
      errorDeOtro={otroTocado && libre && !libre.ok ? libre.error : undefined} />
  );
  const apoyoDePropina = `Opcional. Se calcula sobre tus productos${aDomicilio ? ", sin el envío" : ""}.`;
  /** «¿Cómo pagas?» cuando no hay nada que elegir (una sola forma, o ninguna): se dice, no se pregunta. */
  const unaSolaForma = (
    <>
      <p className="text-14 text-ink-2">{apoyoDePago(pago)}</p>
      {formas.length === 0 && <Aviso tono="warning" role="status" className="!text-14">Este restaurante no está recibiendo pagos por aquí. Llama para hacer tu pedido.</Aviso>}
      {formas.length === 1 && pago && <p className="text-16 font-medium">{nombreDePago(pago, false)}</p>}
    </>
  );
  const notaDeTarjeta = pago === "TARJETA" && <p className="text-15 text-ink-2">{aDomicilio ? "Paga con tarjeta al recibir: el restaurante lleva la terminal." : "Paga con tarjeta al recoger tu pedido."}</p>;
  const errorDePago = rechazo.pago && <p id={`${id}-pago-error`} role="alert" className="text-14 font-medium text-danger">{rechazo.pago}</p>;

  return (
    <form noValidate className={COLUMNA} onSubmit={(e) => { e.preventDefault(); if (!enReto && (!enLaUltima || preguntando || seOfreceEnviar)) alBoton(total); }}>
      <div ref={cuerpo} className={CUERPO}>
        {/* Con el reto del banco a la vista no hay a dónde regresar (se sale con «Cancelar»): la franja se quita y el banco gana ese lugar. */}
        {!enReto && <div className="flex items-center justify-between gap-3 px-4 pt-1">
          <button type="button" onClick={regresar} disabled={ocupado} className={cn("-ml-2 inline-flex h-11 items-center gap-1 rounded px-2 text-15 font-medium text-ink-2 hover:bg-hover hover:text-ink disabled:pointer-events-none disabled:opacity-40", FOCO)}>
            <IconoAtras />{paso === "datos" ? "Tu pedido" : "Regresar"}
          </button>
          {pasos.length > 1 && <p id={`${id}-paso`} className="text-13 tabular-nums text-ink-2">Paso {pasos.indexOf(paso) + 1} de {pasos.length}</p>}
        </div>}

        {/* El reto del banco ocupa el lugar de la pantalla en la que se estaba; la tarjeta sigue montada, oculta. */}
        {reto && (
          <section className={cn("flex min-w-0 flex-col gap-3 pt-3", reto.esperando && "pb-5")}>
            <div className="flex flex-col gap-1 px-4">
              {/* Terminó o se canceló: el marco se quita (se queda en blanco) y lo que sigue es esperar; el aviso del pie dice qué hacer. */}
              {titulo(reto.cancelado ? RETO.cancelando : reto.esperando ? RETO.confirmando : RETO.titulo, "reto")}
              {!reto.esperando && <p className="text-14 text-ink-2">{RETO.apoyo}</p>}
            </div>
            {!reto.esperando && <MarcoDelReto url={reto.url} />}
          </section>
        )}

        {paso === "datos" && !enReto && (
          <>
            {/* Para quien ya tiene cuenta (o la quiere): una franja que no estorba al invitado. El carrito
                vive en el teléfono, así que lo espera a la vuelta. Mientras se envía no se sale de aquí. */}
            {!conSesion && (
              <p className={cn("mx-4 mt-1 flex flex-wrap items-center gap-x-4 rounded bg-hover px-3 text-14 text-ink-2", ocupado && "pointer-events-none opacity-40")}>
                ¿Ya tienes cuenta?
                <Link href={enlaceDeAcceso(negocio.slug, "entrar", deVuelta)} className={DE_TEXTO}>Iniciar sesión</Link>
                <Link href={enlaceDeAcceso(negocio.slug, "registro", deVuelta)} className={DE_TEXTO}>Crear cuenta</Link>
              </p>
            )}

            <section className="flex flex-col gap-4 px-4 pb-5 pt-2">
              {titulo(aDomicilio ? "¿Quién recibe?" : "¿Quién recoge?", "datos")}
              {campo("nombre", "Nombre", { autoComplete: "name", autoCapitalize: "words" })}
              {campo("telefono", "Teléfono", { type: "tel", inputMode: "tel", autoComplete: "tel-national", ayuda: "10 dígitos. El restaurante te llama si hay alguna duda con tu pedido." })}
              {campo("email", "Correo", { type: "email", inputMode: "email", autoComplete: "email", autoCapitalize: "none", spellCheck: false, opcional: !enLinea, ayuda: enLinea ? "Ahí te llega la confirmación de tu pago y el enlace de tu pedido." : "Para mandarte el enlace de tu pedido." })}
            </section>

            <section className="flex flex-col gap-4 border-t border-line px-4 py-5">
              {aDomicilio ? (
                <>
                  <div>
                    <h3 className={TITULO}>¿A dónde lo llevamos?</h3>
                    {zona && <p className={cn("mt-1 text-14 text-ink-2", PARTE)}>Zona de entrega: {zona.nombre}</p>}
                  </div>
                  {/* Con direcciones guardadas se elige una; los campos solo aparecen para «Otra dirección». */}
                  {guardadas.length > 0 && (
                    <ul role="radiogroup" aria-label="Tus direcciones guardadas" className="flex flex-col">
                      {[...guardadas, null].map((d) => (
                        <li key={d?.id ?? OTRA}>
                          <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-16">
                            <input type="radio" name={`${id}-direccion`} checked={d ? elegida?.id === d.id : !elegida} onChange={() => elegirDireccion(d?.id ?? OTRA)} className="h-6 w-6 flex-shrink-0 accent-ink" />
                            {d ? (
                              <span className={cn("min-w-0", PARTE)}>
                                <span className="block font-medium">{d.etiqueta}</span>
                                <span className="block text-14 text-ink-2">{direccionEnUnaLinea(d)}</span>
                              </span>
                            ) : "Otra dirección"}
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                  {!elegida && (
                    <>
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
                      {/* Solo con la cuenta ya leída y con lugar: son hasta 5. Se guarda cuando el pedido entra. */}
                      {cuenta && guardadas.length < TOPE_DE_DIRECCIONES && (
                        <div className="flex flex-col gap-3">
                          <label className="flex min-h-12 cursor-pointer items-center gap-3 text-16">
                            <input type="checkbox" checked={guardar} onChange={(e) => setGuardar(e.target.checked)} className="h-6 w-6 flex-shrink-0 accent-ink" />
                            Guardar esta dirección en mi cuenta
                          </label>
                          {guardar && (
                            <CampoDeTexto id={`${id}-etiqueta`} etiqueta="Nombre para guardarla" value={etiqueta} maxLength={LIMITES_DE_CUENTA.etiqueta} autoComplete="off"
                              ayuda="Para reconocerla la próxima vez: Casa, Oficina…" alCambiar={setEtiqueta} alSalir={() => {}} />
                          )}
                        </div>
                      )}
                    </>
                  )}
                </>
              ) : (
                <div className={PARTE}>
                  <h3 className={TITULO}>Recoges en {sucursal.nombre}</h3>
                  {sucursal.direccion && <p className="mt-1 text-15 text-ink-2">{sucursal.direccion}</p>}
                </div>
              )}
              <CampoDeTexto id={`${id}-nota`} etiqueta="Nota para el restaurante" opcional multilinea value={nota} maxLength={TOPES.nota}
                alCambiar={alCambiarNota} alSalir={() => {}} />
            </section>

            {/* Sin pantalla de pago (una sola forma, al recibir, o ninguna): cómo se paga se dice aquí. */}
            {pasos.length === 1 && (
              <section id={`${id}-pago`} role="group" tabIndex={-1} aria-labelledby={`${id}-pago-titulo`} aria-describedby={rechazo.pago ? `${id}-pago-error` : undefined}
                className="flex min-w-0 flex-col gap-3 border-t border-line px-4 py-5 outline-none">
                <h3 id={`${id}-pago-titulo`} className={TITULO}>¿Cómo pagas?</h3>
                {unaSolaForma}
                {notaDeTarjeta}
                {errorDePago}
              </section>
            )}

            <div className="flex flex-col gap-2 border-t border-line px-4 py-5 text-13 leading-relaxed text-ink-2">
              <p>
                Al enviar aceptas que el restaurante use estos datos para tu pedido.{" "}
                <Link href={`/${negocio.slug}/privacidad`} target="_blank" rel="noopener" className={cn("font-medium text-ink underline underline-offset-4", FOCO)}>Aviso de privacidad</Link>.
              </p>
              {conSesion && (
                <p className={PARTE}>
                  Este pedido queda en tu cuenta{cuenta ? ` (${cuenta.cuenta.email})` : ""}. Lo que cambies aquí vale solo para este pedido.
                </p>
              )}
              {recordado && !conSesion && (
                <p>
                  Llenamos tus datos con los de tu último pedido, guardados en este teléfono.{" "}
                  <button type="button" className={cn("font-medium text-ink underline underline-offset-4", FOCO)}
                    onClick={() => { olvidarCliente(); setF(FORMULARIO_VACIO); setTocados(new Set()); setRecordado(false); }}>
                    Olvidar mis datos
                  </button>
                </p>
              )}
            </div>
          </>
        )}

        {paso === "pago" && !preguntando && !enReto && (
          <section id={`${id}-pago`} role="group" tabIndex={-1} aria-labelledby={`${id}-titulo-pago`} aria-describedby={rechazo.pago ? `${id}-pago-error` : undefined}
            className="flex min-w-0 flex-col gap-3 px-4 pb-3 pt-2 outline-none">
            {titulo("¿Cómo pagas?", "pago")}
            {formas.length > 1 ? (
              <>
                <p className="text-14 text-ink-2">{apoyoDePago(pago)}</p>
                <ul role="radiogroup" aria-labelledby={`${id}-titulo-pago`} className="flex flex-col">
                  {formas.map((p) => (
                    <li key={p}>
                      <label className="flex min-h-12 cursor-pointer items-center gap-3 py-2 text-16">
                        <input type="radio" name={`${id}-forma`} checked={pago === p} disabled={ocupado} className="h-6 w-6 flex-shrink-0 accent-ink"
                          onChange={() => {
                            setPago(p); setRechazo((r) => ({ ...r, pago: undefined }));
                            // Si ya no paga en línea, la tarjeta se desmonta: volver a elegirlo no la carga hasta llegar a su pantalla.
                            if (p !== "EN_LINEA") setConTarjeta(false);
                          }} />
                        {nombreDePago(p, formas.includes("EN_LINEA"))}
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : unaSolaForma}
            {notaDeTarjeta}
            {errorDePago}
            {/* La propina: solo al pagar en línea. El mismo selector de «Para recoger / A domicilio». */}
            {enLinea && (
              <fieldset role="radiogroup" aria-describedby={`${id}-propina-apoyo`} className="min-w-0">
                <legend className="text-15 font-semibold">Propina</legend>
                <p id={`${id}-propina-apoyo`} className="mb-2 mt-1 text-14 text-ink-2">{apoyoDePropina}</p>
                {propinaDeLaPantalla("elegir")}
              </fieldset>
            )}
          </section>
        )}

        {/* La pregunta, una vez por pedido, a quien va a pagar en línea sin haber elegido propina. */}
        {preguntando && !enReto && (
          <section className="flex min-w-0 flex-col gap-3 px-4 pb-5 pt-2">
            {titulo("¿Gustas dejar una propina?", "propina")}
            <p className="text-14 text-ink-2">{apoyoDePropina}</p>
            {propinaDeLaPantalla("preguntar")}
          </section>
        )}

        {/* La tarjeta se monta al llegar aquí por primera vez (la librería de Mercado Pago no se carga
            antes) y se queda montada, oculta, si se regresa: lo escrito en ella no se pierde. La
            envoltura no lleva clases de `display`: le ganarían al atributo `hidden`. */}
        {enLinea && conTarjeta && sucursal.public_key && (
          <div hidden={paso !== "tarjeta" || enReto}>
            <section className="flex min-w-0 flex-col gap-4 px-4 pb-5 pt-2">
              {titulo("Tu tarjeta", "tarjeta")}
              {/* La cuenta de lo que se va a cobrar, en la tarjeta de resumen de la casa. */}
              {total && aPagar && (
                <dl aria-live="polite" className="flex flex-col gap-2 rounded-lg border border-line bg-sel px-4 py-3">
                  <Linea concepto="Tu pedido" importe={formatoMxn(total)} estimado={false} />
                  <Linea concepto="Propina" importe={formatoMxn(montoDePropina ?? "0.00")} estimado={false} />
                  <Linea concepto="Total a pagar" importe={formatoMxn(aPagar)} estimado={false} fuerte />
                </dl>
              )}
              <CamposDeTarjeta ref={tarjeta} id={id} clavePublica={sucursal.public_key} otrasFormas={formas.length > 1} tituloId={`${id}-titulo-tarjeta`}
                rechazo={rechazoDeTarjeta} alCambiar={() => setRechazoDeTarjeta(null)} deshabilitado={ocupado} />
            </section>
          </div>
        )}
      </div>

      <div className={cn(PIE, "flex flex-col gap-2")}>
        <p aria-live="polite" className="sr-only">{estado}</p>
        <Captcha onToken={setToken} accion="tienda_pedido" reinicio={reinicio} />
        {/* TEXTO PROVISIONAL (James). Un pago en línea del que no se sabe el resultado: no se deja pagar otra vez. */}
        {duda && (
          <Aviso tono="warning" role="status" className="!text-14">
            Estamos confirmando tu pago. No vuelvas a pagar todavía: en un momento te decimos qué pasó.
            {duda === "sin-respuesta" && " No pudimos comprobarlo; revisa tu conexión."}
          </Aviso>
        )}
        {duda === "sin-respuesta" && <button type="button" onClick={() => void comprobar.current()} className={GHOST}>Volver a comprobar</button>}
        {reto ? (
          // La acción de esta pantalla está dentro del marco (la del banco). Aquí, solo salir de él; y
          // una vez que terminó o se canceló, esperar: no se ofrece pagar otra vez hasta saber cómo quedó.
          <>
            {reto.esperando && !reto.cancelado && <Aviso tono="warning" role="status" className="!text-14">{RETO.noPagues}</Aviso>}
            {/* «Cancelar» solo con el marco a la vista: tras el aviso de que el reto terminó, el pago puede estar aprobándose. */}
            {seOfreceCancelar(reto) && <button key="cancelar-reto" type="button" onClick={cancelarReto} className={GHOST}>{RETO.cancelar}</button>}
          </>
        ) : preguntando ? (
          <>
            {propina === "otro" && boton("Ir a pagar", aPagar)}
            <button key="ahora-no" type="button" onClick={() => elegirPropina(0)} disabled={ocupado} className={GHOST}>Ahora no</button>
          </>
        ) : totalNuevo ? (
          <>
            <Aviso tono="warning" role="alert" className="!text-14">{textoDeError("TOTAL_CAMBIO", { detalle: totalNuevo }).texto} {enLaUltima ? "Confirma para enviar tu pedido con ese total." : ""}</Aviso>
            {!enLaUltima ? boton(accion === "ir-a-pagar" ? "Ir a pagar" : "Continuar", aPagar)
              : boton(enLinea ? "Confirmar y pagar" : "Confirmar y enviar", aPagar)}
            {enLaUltima && !ocupado && <button type="button" onClick={alVolver} className={GHOST}>Volver a tu pedido</button>}
          </>
        ) : (
          <>
            {aviso && <Aviso tono={aviso.tono} role="alert" className="!text-14">{aviso.texto}</Aviso>}
            {/* Lo que ofrece un aviso (llamar, reintentar, enviar como invitado) va en la pantalla que envía; en las anteriores, el botón de seguir. */}
            {!enLaUltima ? boton(accion === "ir-a-pagar" ? "Ir a pagar" : "Continuar", aPagar)
            : aviso?.sigue === "llamar" ? (
              <>
                {tel
                  ? <a href={tel} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>Llamar al {formatoTelefono(sucursal.telefono ?? "")}</a>
                  : sucursal.telefono && <p className="text-16 font-semibold">{sucursal.telefono}</p>}
                <button type="button" onClick={alVolver} className={GHOST}>Volver a tu pedido</button>
              </>
            ) : aviso?.sigue === "reintentar-seguro" ? (
              // No se supo si entró. Reintentar va con la misma clave (y un antirobot nuevo): si ya
              // había entrado, el servidor devuelve ese pedido y lo lleva a su seguimiento.
              <>
                {boton("Reintentar", aPagar)}
                {!ocupado && (tel
                  ? <a href={tel} className={GHOST}>Llamar al restaurante</a>
                  : sucursal.telefono && <p className="text-center text-14 text-ink-2">Restaurante: {sucursal.telefono}</p>)}
              </>
            ) : aviso?.sigue === "volver" ? (
              <button type="button" onClick={alVolver} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>Volver a tu pedido</button>
            ) : aviso?.sigue === "sesion" ? (
              // Dos salidas, y ninguna se toma sola: mandarlo ya como invitado (con un antirobot nuevo;
              // el anterior se gastó) o entrar otra vez. El carrito y lo escrito siguen aquí.
              <>
                {boton(enLinea ? "Pagar como invitado" : "Enviar como invitado", aPagar)}
                {!ocupado && <Link href={enlaceDeAcceso(negocio.slug, "entrar", deVuelta)} className={GHOST}>Entrar otra vez</Link>}
              </>
            ) : boton(enLinea ? "Pagar" : "Enviar pedido", aPagar)}
          </>
        )}
      </div>
    </form>
  );
}
