"use client";
// Los datos de la tarjeta al pagar en línea. El número, el vencimiento y el código son iframes de
// Mercado Pago (Secure Fields): se pintan dentro de cajas nuestras, con el borde, el radio y el foco
// de los demás campos de «Tus datos», y esta página nunca ve lo que se escribe en ellos. El nombre
// del titular sí es un campo nuestro. La maqueta, las etiquetas y los errores son de la tienda.
// Es la tercera pantalla de «Tus datos» (datos.tsx), que pone el título «Tu tarjeta» y la monta al
// llegar a ella: la librería de Mercado Pago no se carga antes.
//
// TEXTOS PROVISIONALES: los revisa James.
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { Aviso, botonClases, cn } from "@vim/ui/styles";
import { CampoDeTexto } from "./campo";
import {
  CAMPOS_SIN_TOCAR, cargarHuellaDeDispositivo, cargarMercadoPago, dispositivoDe, errorDeToken, erroresDeTarjeta, marcaDe, primerError, textoSinFormulario, tipoAceptado, tokenDe,
  type CampoDeTarjeta, type CampoSeguro, type EstadoDeCampos, type MarcaDeTarjeta, type MercadoPagoJs, type TarjetaDePedido,
} from "../lib/tarjeta";

export type ResultadoDeTarjeta = { ok: true; tarjeta: TarjetaDePedido } | { ok: false; campo: CampoDeTarjeta | null; texto: string };
/** Lo que «Tus datos» le pide a este bloque al tocar «Pagar». */
export type ManejoDeTarjeta = {
  /** Valida y convierte la tarjeta en un token de un solo uso. Cada intento de pago pide uno nuevo. */
  tokenizar(): Promise<ResultadoDeTarjeta>;
  /** Lleva el foco a un campo (o al bloque): tras un rechazo del banco. */
  enfocar(campo: CampoDeTarjeta | null): void;
};

const GHOST = cn(botonClases({ variant: "ghost" }), "h-12 w-full");
type Seguro = Exclude<CampoDeTarjeta, "titular">;
const SEGUROS: { campo: Seguro; tipo: string; etiqueta: string; placeholder: string }[] = [
  { campo: "numero", tipo: "cardNumber", etiqueta: "Número de tarjeta", placeholder: "1234 1234 1234 1234" },
  { campo: "vence", tipo: "expirationDate", etiqueta: "Vencimiento", placeholder: "MM/AA" },
  { campo: "codigo", tipo: "securityCode", etiqueta: "Código de seguridad", placeholder: "123" },
];
const obj = (v: unknown): Record<string, unknown> => (typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {});

export const CamposDeTarjeta = forwardRef<ManejoDeTarjeta, {
  id: string;
  /** El título de la pantalla («Tu tarjeta»), que nombra a este bloque. */
  tituloId: string;
  /** La public key de la cuenta del restaurante: con ella Mercado Pago crea el token. No es secreta. */
  clavePublica: string;
  /** Hay otra forma de pago: si esto no carga, se ofrece. */
  otrasFormas: boolean;
  /** Lo que dijo el banco (o la librería) del último intento; se quita al cambiar algo. */
  rechazo: { campo: CampoDeTarjeta | null; texto: string } | null;
  alCambiar: () => void;
  deshabilitado: boolean;
}>(function CamposDeTarjeta({ id, tituloId, clavePublica, otrasFormas, rechazo, alCambiar, deshabilitado }, ref) {
  const [fase, setFase] = useState<"cargando" | "lista" | "fallo">("cargando");
  const [intento, setIntento] = useState(0);
  const [campos, setCampos] = useState<EstadoDeCampos>(CAMPOS_SIN_TOCAR);
  const [foco, setFoco] = useState<Seguro | null>(null);
  const [titular, setTitular] = useState("");
  const [titularTocado, setTitularTocado] = useState(false);
  const [marca, setMarca] = useState<MarcaDeTarjeta | null>(null);
  /** Ya se intentó pagar: desde aquí un campo vacío también es un error. */
  const [enviado, setEnviado] = useState(false);
  const mp = useRef<MercadoPagoJs | null>(null);
  const seguros = useRef<Partial<Record<Seguro, CampoSeguro>>>({});
  const bloque = useRef<HTMLDivElement>(null);
  const cambio = useRef(alCambiar);
  cambio.current = alCambiar;

  useEffect(() => {
    let vivo = true;
    const montados: CampoSeguro[] = [];
    // Si los campos no terminan de montar, no se deja un formulario muerto: se dice y se ofrece reintentar.
    const reloj = setTimeout(() => { if (vivo) setFase((f) => (f === "cargando" ? "fallo" : f)); }, 20_000);
    cargarMercadoPago(clavePublica).then((lib) => {
      if (!vivo) return;
      mp.current = lib;
      // La huella del dispositivo para el antifraude de Mercado Pago: aparte y sin esperar.
      cargarHuellaDeDispositivo();
      // El texto de dentro del iframe copia el de un campo de la casa: mismo color, tamaño y letra.
      const muestra = document.getElementById(`${id}-titular`);
      const cs = muestra ? getComputedStyle(muestra) : null;
      // El ejemplo de cada campo va en la tinta atenuada de los demás campos (`placeholder:text-ink-3`),
      // leída del token: `getComputedStyle(campo, "::placeholder")` no sirve, devuelve el color del
      // texto y el ejemplo salía tan oscuro como un valor escrito.
      const tinta3 = getComputedStyle(document.documentElement).getPropertyValue("--ink-3").trim().split(/s+/).join(", ");
      const style = {
        "font-size": cs?.fontSize ?? "16px", color: cs?.color ?? "#16161A", "font-family": cs?.fontFamily ?? "system-ui, sans-serif",
        "font-weight": cs?.fontWeight ?? "400", "placeholder-color": tinta3 ? `rgb(${tinta3})` : "#6E6E74",
      };
      let listos = 0;
      for (const { campo, tipo, placeholder } of SEGUROS) {
        const el = lib.fields.create(tipo, { placeholder, style }).mount(`${id}-${campo}`);
        el.on("ready", () => { listos += 1; if (vivo && listos === SEGUROS.length) { clearTimeout(reloj); setFase("lista"); } });
        el.on("focus", () => setFoco(campo));
        el.on("blur", () => { setFoco((f) => (f === campo ? null : f)); setCampos((c) => ({ ...c, [campo]: { ...c[campo], tocado: true } })); });
        el.on("validityChange", (d) => {
          const errores = obj(d).errorMessages;
          const mal = Array.isArray(errores) && errores.length > 0;
          setCampos((c) => ({ ...c, [campo]: { ...c[campo], error: mal, listo: !mal } }));
        });
        // Lo que dijo el banco del intento anterior se quita cuando el cliente ESCRIBE, no al mover el foco.
        el.on("change", () => cambio.current());
        el.on("error", () => { if (vivo) setFase("fallo"); });
        seguros.current[campo] = el;
        montados.push(el);
      }
      // Con los primeros dígitos se sabe la marca y si es de crédito o de débito: hacen falta para cobrar.
      seguros.current.numero?.on("binChange", (d) => {
        const bin = obj(d).bin;
        if (typeof bin !== "string" || bin.length < 6) { setMarca(null); return; }
        void (async () => {
          try {
            const m = marcaDe(await lib.getPaymentMethods({ bin }));
            if (vivo) setMarca(m);
          } catch { if (vivo) setMarca(null); }
        })();
      });
    }).catch(() => { if (vivo) { clearTimeout(reloj); setFase("fallo"); } });
    return () => {
      vivo = false;
      clearTimeout(reloj);
      seguros.current = {};
      for (const el of montados) { try { el.unmount(); } catch { /* ya no estaba */ } }
    };
  }, [clavePublica, id, intento]);

  const errores = erroresDeTarjeta({ campos, titular, marca, alEnviar: enviado, titularTocado });
  const enfocar = (campo: CampoDeTarjeta | null) => {
    if (campo === "titular") document.getElementById(`${id}-titular`)?.focus();
    else if (campo) {
      // El foco se le da al iframe de ESE campo (el `focus()` de la librería no siempre cae en el que se le pide).
      const caja = document.getElementById(`${id}-${campo}`);
      caja?.scrollIntoView({ block: "center" });
      (caja?.querySelector("iframe") ?? bloque.current)?.focus();
    } else bloque.current?.focus();
  };

  useImperativeHandle(ref, () => ({
    enfocar,
    async tokenizar() {
      if (fase !== "lista" || !mp.current) return { ok: false, campo: null, texto: textoSinFormulario(otrasFormas) };
      setEnviado(true);
      const e = erroresDeTarjeta({ campos, titular, marca, alEnviar: true });
      const primero = primerError(e);
      if (primero) { enfocar(primero); return { ok: false, campo: primero, texto: e[primero]! }; }
      // (Un tipo que no es crédito ni débito ya salió arriba como error del número.)
      if (!marca || !tipoAceptado(marca.tipo)) { enfocar("numero"); return { ok: false, campo: "numero", texto: "Revisa el número de tu tarjeta." }; }
      try {
        const token = tokenDe(await mp.current.fields.createCardToken({ cardholderName: titular.trim() }));
        if (!token) return { ok: false, ...errorDeToken(null) };
        const dispositivo = dispositivoDe(window);
        return { ok: true, tarjeta: { token, payment_method_id: marca.payment_method_id, type: marca.tipo, ...(dispositivo && { dispositivo }) } };
      } catch (err) {
        const t = errorDeToken(err);
        enfocar(t.campo);
        return { ok: false, ...t };
      }
    },
  }));

  const errorDe = (c: CampoDeTarjeta) => (rechazo?.campo === c ? rechazo.texto : errores[c]);
  const general = rechazo && !rechazo.campo ? rechazo.texto : null;

  if (fase === "fallo") {
    return (
      <div className="flex flex-col gap-2">
        <Aviso tono="warning" role="alert" className="!text-14">{textoSinFormulario(otrasFormas)}</Aviso>
        <button type="button" onClick={() => { setFase("cargando"); setCampos(CAMPOS_SIN_TOCAR); setMarca(null); setIntento((n) => n + 1); }} className={GHOST}>Volver a intentar</button>
      </div>
    );
  }

  const caja = (s: (typeof SEGUROS)[number]) => {
    const error = errorDe(s.campo);
    return (
      <div key={s.campo} className={cn("flex min-w-0 flex-col gap-1", s.campo === "numero" && "col-span-2")}>
        {/* Un iframe no admite <label for>: la etiqueta nombra a la caja y un toque en ella lleva el foco. */}
        <span id={`${id}-${s.campo}-etiqueta`} onClick={() => enfocar(s.campo)} className="flex items-center justify-between gap-2 text-14 font-medium text-ink">
          {s.etiqueta}
          {s.campo === "numero" && marca?.nombre && <span className="truncate text-13 font-normal text-ink-2">{marca.nombre}</span>}
        </span>
        <div id={`${id}-${s.campo}`} role="group" aria-labelledby={`${id}-${s.campo}-etiqueta`} aria-describedby={error ? `${id}-${s.campo}-error` : undefined}
          className={cn(
            // La misma caja que CampoDeTexto; el foco lo avisa el iframe, así que se pinta desde el estado.
            "h-12 w-full overflow-hidden rounded border bg-surface px-3 [&>iframe]:h-full [&>iframe]:w-full",
            error ? "border-danger" : "border-line-strong", foco === s.campo && "border-ink ring-1 ring-ink",
            (fase === "cargando" || deshabilitado) && "pointer-events-none opacity-60",
          )} />
        {error && <p id={`${id}-${s.campo}-error`} className="text-14 font-medium text-danger">{error}</p>}
      </div>
    );
  };

  return (
    <div ref={bloque} id={`${id}-tarjeta`} role="group" tabIndex={-1} aria-labelledby={tituloId} aria-busy={fase === "cargando"} className="flex min-w-0 flex-col gap-3 outline-none">
      {general && <Aviso tono="danger" role="alert" className="!text-14">{general}</Aviso>}
      <div className="grid grid-cols-2 gap-3">
        {SEGUROS.map(caja)}
        <CampoDeTexto id={`${id}-titular`} etiqueta="Nombre del titular" value={titular} error={errorDe("titular")} maxLength={100}
          autoComplete="cc-name" autoCapitalize="characters" spellCheck={false} disabled={deshabilitado} className="col-span-2"
          ayuda="Como aparece en la tarjeta."
          alCambiar={(v) => { setTitular(v); cambio.current(); }} alSalir={() => setTitularTocado(true)} />
      </div>
      {/* Lo que cambia mientras escribe (un campo que deja de estar mal) no se anuncia a cada tecla: solo el estado de carga y el primer error al intentar pagar. */}
      <p aria-live="polite" className="sr-only">{fase === "cargando" ? "Cargando el formulario de tarjeta…" : enviado ? (errores[primerError(errores) ?? "numero"] ?? "") : ""}</p>
    </div>
  );
});
