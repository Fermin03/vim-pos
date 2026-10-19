"use client";
// «Tus datos», el anticipo y la confirmación. El recorrido (reservar → POR_PAGAR → tarjeta → reto del
// banco → hecho) es el reductor `flujo` de lib/reservas.ts; aquí solo se pinta y se llama.
// Cada `reservar` lleva un token NUEVO del antirobot (sirve una vez) y la MISMA clave mientras no
// cambie lo que se aparta: reintentar o pagar devuelve la misma cita.
//
// TEXTOS PROVISIONALES: los revisa James.
import { useEffect, useReducer, useRef, useState } from "react";
import Link from "next/link";
import { Aviso, Captcha, Icono, SITE_KEY_TURNSTILE, cn } from "@vim/ui/styles";
import { reservar, verificacionDeCita, type ServicioDeCadena } from "../../lib/api";
import { FORMULARIO_VACIO, guardarCliente, leerCliente } from "../../lib/cliente";
import type { Reservas, SucursalDeReservas } from "../../lib/contrato";
import { aCentavos, formatoMxn } from "../../lib/dinero";
import { aLaHora, momentoMx } from "../../lib/horario";
import type { TarjetaDePedido } from "../../lib/tarjeta";
import {
  CAMPOS_DE_DATOS, FLUJO_INICIAL, LIMITES_DE_DATOS, cuerpoDeReserva, diaDe, duracionLegible, erroresDeDatos, fechaLarga, flujo, horaDe, resumenDe,
  type CampoDeDatos, type DatosDeClienta, type intentoDeReserva,
} from "../../lib/reservas";
import { MODO_DE_PRUEBA, RETO } from "../../lib/textos";
import { esFinDelReto, vigilarReto } from "../../lib/verificacion";
import { CampoDeTexto } from "../campo";
import { FOCO, PARTE, PRINCIPAL } from "../piezas";
import { MarcoDelReto } from "../reto";
import { CamposDeTarjeta, type ManejoDeTarjeta } from "../tarjeta";

const ESPERA_DEL_ANTIROBOT_MS = 20_000;
const TITULO = "font-display text-20 font-semibold outline-none";

/**
 * El antirobot de reservar: `pedir()` da el token vigente o espera a que llegue (20 s como mucho;
 * sin llave local no hay widget y va vacío: la función con CAPTCHA_OPCIONAL lo deja pasar).
 * `gastado()` tras cada llamada: pide otro.
 */
function useAntirobot() {
  const [reinicio, setReinicio] = useState(0);
  const token = useRef("");
  const espera = useRef<((t: string) => void) | null>(null);
  const alToken = (t: string) => {
    token.current = t;
    if (t && espera.current) { espera.current(t); espera.current = null; }
  };
  return {
    widget: <Captcha onToken={alToken} accion="tienda_reserva" reinicio={reinicio} />,
    pedir: (): Promise<string> => {
      if (!SITE_KEY_TURNSTILE || token.current) return Promise.resolve(token.current);
      return new Promise((ok) => {
        espera.current = ok;
        setTimeout(() => { if (espera.current === ok) { espera.current = null; ok(""); } }, ESPERA_DEL_ANTIROBOT_MS);
      });
    },
    gastado: () => { token.current = ""; setReinicio((n) => n + 1); },
  };
}

/** Día, hora, servicios con quién los hace, total y anticipo. Lo comparten «Tus datos», la tarjeta y la confirmación. */
export function Resumen({ reservas, sucursal, cadena, inicia, hoy, anticipo }: {
  reservas: Reservas; sucursal: SucursalDeReservas; cadena: ServicioDeCadena[]; inicia: string; hoy: string; anticipo: string;
}) {
  const r = resumenDe(reservas.servicios, cadena);
  const conAnticipo = (aCentavos(anticipo) ?? 0) > 0;
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface p-4">
      <div>
        <p className="font-display text-18 font-semibold first-letter:uppercase">{fechaLarga(diaDe(inicia), hoy)}</p>
        <p className="text-15 text-ink-2">{horaDe(inicia)} · {duracionLegible(r.duracion)} · {sucursal.nombre}</p>
      </div>
      <ul className="flex flex-col gap-2 border-t border-line pt-3">
        {cadena.map((e, i) => {
          const s = reservas.servicios.find((x) => x.producto_id === e.producto_id);
          const quien = e.usuario_id ? reservas.colaboradores.find((c) => c.id === e.usuario_id)?.nombre_corto : null;
          return (
            <li key={`${e.producto_id}-${i}`} className={cn("flex items-start justify-between gap-3 text-15", PARTE)}>
              <span>
                <span className="font-medium text-ink">{s?.nombre}</span>
                <span className="block text-14 text-ink-2">{quien ?? "Quien esté libre"}</span>
              </span>
              <span className="tabular-nums text-ink">{s ? formatoMxn(s.precio) : ""}</span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-1 border-t border-line pt-3 text-15">
        <p className="flex justify-between font-semibold"><span>Total</span><span className="tabular-nums">{formatoMxn(r.total)}</span></p>
        {conAnticipo && (
          <>
            <p className="flex justify-between"><span>Anticipo en línea</span><span className="tabular-nums">{formatoMxn(anticipo)}</span></p>
            <p className="text-14 text-ink-2">Pagas el resto en el negocio.</p>
          </>
        )}
      </div>
    </div>
  );
}

export function Reservar({ reservas, sucursal, cadena, inicia, hoy, intento, alVolver, alPerderHorario }: {
  reservas: Reservas; sucursal: SucursalDeReservas; cadena: ServicioDeCadena[]; inicia: string; hoy: string;
  /** Vive en la página: sobrevive a ir y volver de esta pantalla. */
  intento: ReturnType<typeof intentoDeReserva>;
  alVolver: () => void;
  /** Ese horario ya no se puede: a elegir otro, con este aviso. */
  alPerderHorario: (aviso: string) => void;
}) {
  const [f, setF] = useState<DatosDeClienta>({ nombre: "", celular: "", correo: "", nota: "" });
  const [tocados, setTocados] = useState<ReadonlySet<CampoDeDatos>>(new Set());
  const [s, despachar] = useReducer(flujo, FLUJO_INICIAL);
  const antirobot = useAntirobot();
  const tarjeta = useRef<ManejoDeTarjeta>(null);
  const enVuelo = useRef(false);
  const cancelado = useRef(false);
  const errores = erroresDeDatos(f);
  const anticipo = resumenDe(reservas.servicios, cadena).anticipo;
  const conAnticipo = (aCentavos(anticipo) ?? 0) > 0;
  // El anticipo se cobra en línea: sin Mercado Pago en esta sucursal no se puede reservar aquí.
  const sinCobro = conAnticipo && (!sucursal.pago_en_linea || !sucursal.public_key);

  // Lo recordado de un pedido o una reserva anterior en este teléfono.
  useEffect(() => {
    const c = leerCliente();
    if (c) setF((a) => ({ ...a, nombre: c.nombre ?? a.nombre, celular: c.telefono ?? a.celular, correo: c.email ?? a.correo }));
  }, []);

  // El foco va al título de cada pantalla nueva (la tarjeta, el reto, la confirmación).
  useEffect(() => {
    if (s.fase === "tarjeta" || s.fase === "reto" || s.fase === "hecho") document.getElementById(`reserva-${s.fase}`)?.focus();
    if (s.fase === "horario" && s.aviso) { intento.olvidar(); alPerderHorario(s.aviso); }
    if (s.fase === "hecho") guardarCliente({ ...FORMULARIO_VACIO, nombre: f.nombre.trim(), telefono: f.celular.trim(), email: f.correo.trim() }, "RECOGER");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al cambiar de fase
  }, [s.fase]);

  // El reto del banco: se pregunta al servidor hasta que termina (lib/verificacion.ts).
  const codigoDelReto = s.fase === "reto" ? s.codigo : null;
  const vigia = useRef<ReturnType<typeof vigilarReto> | null>(null);
  useEffect(() => {
    if (!codigoDelReto) return;
    cancelado.current = false;
    const v = vigilarReto({
      preguntar: (cancelar, signal) => verificacionDeCita(reservas.slug, codigoDelReto, cancelar, signal),
      alPaso: (paso) => despachar({ tipo: "reto", paso: paso.tipo === "rechazado" && cancelado.current ? { ...paso, detalle: "CANCELADO" } : paso }),
      yaMismo: s.url === null,
    });
    vigia.current = v;
    const alMensaje = (e: MessageEvent) => { if (esFinDelReto(e.origin, e.data)) v.ahora(); };
    window.addEventListener("message", alMensaje);
    return () => { v.detener(); vigia.current = null; window.removeEventListener("message", alMensaje); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- un vigía por reto
  }, [codigoDelReto, reservas.slug]);

  const de = (c: CampoDeDatos) => ({
    id: `reserva-${c}`, value: f[c], error: tocados.has(c) ? errores[c] : undefined, maxLength: LIMITES_DE_DATOS[c],
    alCambiar: (v: string) => setF((a) => ({ ...a, [c]: v })), alSalir: () => setTocados((t) => new Set(t).add(c)),
  });

  /** Una llamada a `reservar`, con o sin tarjeta. Un segundo toque mientras va no hace nada. */
  const enviar = async (conTarjeta: boolean) => {
    if (enVuelo.current) return;
    enVuelo.current = true;
    try {
      let t: TarjetaDePedido | undefined;
      if (conTarjeta) {
        const r = await (tarjeta.current?.tokenizar() ?? Promise.resolve(null));
        // Un campo con error ya lo dice junto a él; lo demás (no cargó, no se leyó) va arriba.
        if (!r || !r.ok) { if (!r?.campo) despachar({ tipo: "tarjeta-mal", texto: r?.texto ?? "No pudimos leer tu tarjeta." }); return; }
        t = r.tarjeta;
      }
      despachar({ tipo: "enviar", conTarjeta });
      const captcha = await antirobot.pedir();
      const r = await reservar(reservas.slug, cuerpoDeReserva({
        sucursalId: sucursal.id, inicia, cadena, datos: f, clave: intento.para(sucursal.id, cadena, inicia), captcha, ...(t && { tarjeta: t }),
      }));
      antirobot.gastado();
      despachar({ tipo: "respuesta", r });
    } finally {
      enVuelo.current = false;
    }
  };

  const alEnviarDatos = (e: React.FormEvent) => {
    e.preventDefault();
    const primero = CAMPOS_DE_DATOS.find((c) => errores[c]);
    if (primero) { setTocados(new Set(CAMPOS_DE_DATOS)); document.getElementById(`reserva-${primero}`)?.focus(); return; }
    void enviar(false);
  };

  const ocupado = s.fase === "enviando";
  const resumen = <Resumen reservas={reservas} sucursal={sucursal} cadena={cadena} inicia={inicia} hoy={hoy} anticipo={anticipo} />;
  const aviso = s.aviso && s.fase !== "horario" && <Aviso tono="danger" role="alert" className="!text-14">{s.aviso}</Aviso>;
  const pruebas = reservas.pago_de_prueba && <Aviso tono="info" role="status" className="!text-14"><strong className="font-semibold">{MODO_DE_PRUEBA.titulo}</strong> {MODO_DE_PRUEBA.ayuda}</Aviso>;

  if (s.fase === "hecho") {
    return (
      <section aria-labelledby="reserva-hecho" className="flex flex-col gap-4 px-4 pb-8">
        <h2 id="reserva-hecho" tabIndex={-1} className={cn(TITULO, "text-24")}>Tu cita quedó apartada</h2>
        {s.porConfirmar && <Aviso tono="info" role="status" className="!text-14">Estamos confirmando tu pago. Te avisamos por correo.</Aviso>}
        {resumen}
        {s.codigo ? (
          <>
            <p className="text-15 text-ink-2">Te mandamos el enlace a tu correo.</p>
            <Link href={`/${reservas.slug}/cita/${s.codigo}`} className={cn(PRINCIPAL, "h-14 w-full text-16")}>Ver mi cita</Link>
          </>
        ) : <p className="text-15 text-ink-2">Revisa tu correo para ver tu cita.</p>}
      </section>
    );
  }

  if (s.fase === "reto") {
    return (
      <section aria-labelledby="reserva-reto" className="flex flex-col gap-3 pb-8">
        <div className="px-4">
          <h2 id="reserva-reto" tabIndex={-1} className={TITULO}>{RETO.titulo}</h2>
          <p className="mt-1 text-15 text-ink-2">{RETO.apoyo}</p>
        </div>
        <MarcoDelReto url={s.url} />
        <div className="px-4">
          <button type="button" onClick={() => { cancelado.current = true; vigia.current?.cancelar(); }}
            className={cn("h-12 w-full rounded border border-line-strong font-display text-15 font-semibold hover:bg-hover", FOCO)}>{RETO.cancelar}</button>
        </div>
      </section>
    );
  }

  const enTarjeta = s.fase === "tarjeta" || (s.fase === "enviando" && s.conTarjeta);
  const hasta = s.cita?.pago_hasta ? aLaHora(momentoMx(new Date(s.cita.pago_hasta)).hora).replace(/^a /, "") : null;

  return (
    <form onSubmit={enTarjeta ? (e) => { e.preventDefault(); void enviar(true); } : alEnviarDatos} noValidate className="flex flex-col gap-5 px-4 pb-8">
      <div className="flex items-center gap-2">
        {!enTarjeta && (
          <button type="button" onClick={alVolver} disabled={ocupado} aria-label="Volver a elegir horario"
            className={cn("-ml-2 flex h-11 w-11 items-center justify-center rounded hover:bg-hover", FOCO)}>
            <Icono nombre="chevron-izquierda" className="h-5 w-5" />
          </button>
        )}
        <h2 id={enTarjeta ? "reserva-tarjeta" : "titulo-datos"} tabIndex={-1} className={TITULO}>{enTarjeta ? "Paga tu anticipo" : "Tus datos"}</h2>
      </div>

      {enTarjeta ? (
        <>
          {hasta && <p className="-mt-3 text-15 text-ink-2">Apartamos tu lugar hasta {hasta}.</p>}
          {pruebas}
          {aviso}
          {sucursal.public_key && (
            <CamposDeTarjeta ref={tarjeta} id="reserva-tarjeta-campos" tituloId="reserva-tarjeta" clavePublica={sucursal.public_key}
              otrasFormas={false} rechazo={null} alCambiar={() => {}} deshabilitado={ocupado} />
          )}
          {resumen}
          <button type="submit" disabled={ocupado} aria-busy={ocupado} className={cn(PRINCIPAL, "h-14 w-full justify-between px-5 text-16")}>
            {ocupado ? <span className="w-full text-center">Procesando tu pago…</span> : <><span>Pagar anticipo</span><span className="tabular-nums">{formatoMxn(anticipo)}</span></>}
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-col gap-4">
            <CampoDeTexto etiqueta="Nombre" autoComplete="name" {...de("nombre")} />
            <CampoDeTexto etiqueta="Celular" type="tel" inputMode="tel" autoComplete="tel-national" ayuda="10 dígitos." {...de("celular")} />
            <CampoDeTexto etiqueta="Correo" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false}
              ayuda="Ahí te llega el enlace de tu cita." {...de("correo")} />
            <CampoDeTexto etiqueta="Nota" opcional multilinea {...de("nota")} />
          </div>
          {resumen}
          {sinCobro && <Aviso tono="warning" role="status" className="!text-14">Por ahora no podemos cobrar el anticipo en línea. Comunícate con el negocio para agendar.</Aviso>}
          {aviso}
          <button type="submit" disabled={ocupado || sinCobro} aria-busy={ocupado} className={cn(PRINCIPAL, "h-14 w-full px-5 text-16")}>
            {ocupado ? "Apartando tu cita…" : conAnticipo ? "Continuar al pago" : "Confirmar cita"}
          </button>
        </>
      )}
      {antirobot.widget}
    </form>
  );
}
