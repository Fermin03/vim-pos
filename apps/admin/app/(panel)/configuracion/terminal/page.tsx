"use client";
import { useEffect, useRef, useState } from "react";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { Interruptor } from "../../../components/interruptor";
import { AccionFila } from "../../../components/controles";
import { input, label } from "../../../components/campos";
import { listarCajas, listarSucursales, type Caja, type Sucursal } from "../../../lib/configuracion";
import { mensajeError } from "../../../lib/errores";
import {
  accionTerminal, coordenadasDe, iniciarConexionMp, leerTerminal, mensajeErrorTerminal,
  type ConexionTerminal, type ConfigSucursal, type EstadoTerminal,
} from "../../../lib/terminal";

const ESPERAS = [[60, "1 minuto"], [180, "3 minutos"], [300, "5 minutos"], [600, "10 minutos"]] as const;

/**
 * Terminal de tarjetas (ADR 0033). El dueño conecta su cuenta de Mercado Pago, dice qué cuenta usa
 * cada sucursal y liga cada caja a su terminal. Va incluido en todos los paquetes: no hay módulo
 * que lo esconda. Una escritura a la vez en toda la página.
 */
export default function TerminalPage() {
  const [datos, setDatos] = useState<{ sucursales: Sucursal[]; cajas: Caja[]; t: EstadoTerminal } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [desconectar, setDesconectar] = useState<ConexionTerminal | null>(null);
  // Los botones están más abajo que los mensajes: al salir uno, se trae a la vista.
  const mensajes = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || aviso) mensajes.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [error, aviso]);

  async function recargar() {
    try {
      const [sucursales, cajas, t] = await Promise.all([listarSucursales(), listarCajas(), leerTerminal()]);
      setDatos({ sucursales: sucursales.filter((s) => s.activa), cajas: cajas.filter((c) => c.activa), t });
    } catch (e) {
      setError(mensajeError(e, "No se pudo cargar"));
    }
  }
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("conectada")) setAviso("Cuenta de Mercado Pago conectada. Ahora elige qué sucursal la usa.");
    recargar();
  }, []);

  /** Corre una acción contra Mercado Pago, avisa y vuelve a leer. */
  async function correr(cuerpo: Parameters<typeof accionTerminal>[0], hecho: string) {
    setOcupado(true); setError(null); setAviso(null);
    try {
      await accionTerminal(cuerpo);
      setAviso(hecho);
      await recargar();
    } catch (e) {
      setError(mensajeErrorTerminal(e));
    } finally {
      setOcupado(false);
      setDesconectar(null);
    }
  }

  const conectar = () => { window.location.href = iniciarConexionMp(); };
  const t = datos?.t;

  return (
    <>
      <PageHeader
        titulo="Terminal de tarjetas"
        subtitulo="Cobra con tarjeta desde la caja: el monto llega solo a tu terminal de Mercado Pago y el pago regresa al ticket."
        migas={[{ label: "Configuración" }, { label: "Terminal de tarjetas" }]}
        right={<Button onClick={conectar} disabled={ocupado}>Conectar Mercado Pago</Button>}
      />
      <PageBody>
        <div ref={mensajes}>
          {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
          {aviso && <p className="mb-4 text-sm font-medium text-success" role="status">{aviso}</p>}
        </div>
        {!datos && !error && <p className="text-sm text-ink-3">Cargando…</p>}

        {datos && t && (
          <div className="flex flex-col gap-5">
            <Tarjeta
              titulo="Cuentas de Mercado Pago"
              descripcion="El dinero de cada cobro cae directo en tu cuenta. VIM no lo toca ni ve los datos de las tarjetas."
            >
              {t.conexiones.length === 0 && (
                <p className="text-sm text-ink-2">
                  Todavía no hay ninguna. Pulsa «Conectar Mercado Pago», entra con la cuenta del restaurante y autoriza a VIM POS.
                </p>
              )}
              <ul className="flex flex-col divide-y divide-line">
                {t.conexiones.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span className="text-15 font-semibold">{c.cuenta_nombre ?? "Cuenta de Mercado Pago"}</span>
                    {c.de_prueba && <span className="rounded-full bg-info-soft px-2.5 py-0.5 text-12 font-semibold text-info">De prueba</span>}
                    {c.estado === "ERROR" && (
                      <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-12 font-semibold text-danger">
                        Hay que volver a conectarla
                      </span>
                    )}
                    <AccionFila peligro className="ml-auto" disabled={ocupado} onClick={() => setDesconectar(c)}>Desconectar</AccionFila>
                  </li>
                ))}
              </ul>
            </Tarjeta>

            {t.conexiones.length > 0 && datos.sucursales.map((s) => (
              <SucursalTerminal
                key={s.id} sucursal={s} cajas={datos.cajas.filter((c) => c.sucursal_id === s.id)} t={t}
                ocupado={ocupado} correr={correr} setError={setError}
              />
            ))}
          </div>
        )}
      </PageBody>

      {desconectar && (
        <DialogoPeligro
          titulo="¿Desconectar Mercado Pago?"
          consecuencia={
            <>
              Las cajas que usan <b className="text-ink">{desconectar.cuenta_nombre ?? "esta cuenta"}</b> dejarán de mandar el
              cobro a la terminal. Podrás seguir cobrando tecleando el monto en la terminal y registrando el pago a mano.
            </>
          }
          boton="Desconectar"
          ocupado={ocupado}
          textoOcupado="Desconectando…"
          ancho="sm"
          onConfirmar={() => correr({ accion: "desconectar", conexion_id: desconectar.id }, "Cuenta desconectada.")}
          onCerrar={() => setDesconectar(null)}
        />
      )}
    </>
  );
}

function SucursalTerminal({ sucursal, cajas, t, ocupado, correr, setError }: {
  sucursal: Sucursal; cajas: Caja[]; t: EstadoTerminal; ocupado: boolean;
  correr: (cuerpo: Parameters<typeof accionTerminal>[0], hecho: string) => Promise<void>;
  setError: (e: string | null) => void;
}) {
  const cfg: ConfigSucursal | undefined = t.config.find((c) => c.sucursal_id === sucursal.id);
  const [conexionId, setConexionId] = useState(t.conexiones[0]?.id ?? "");
  const [mapa, setMapa] = useState("");

  function ligar() {
    const coords = coordenadasDe(mapa);
    if (!coords) {
      setError("No pude leer la ubicación. En Google Maps, haz clic derecho sobre tu local, copia los números que aparecen arriba (algo como 21.12345, -101.67890) y pégalos aquí.");
      return;
    }
    void correr({ accion: "sucursal", conexion_id: conexionId, sucursal_id: sucursal.id, ...coords }, `${sucursal.nombre} ya usa esa cuenta. Sigue con sus cajas.`);
  }
  const configurar = (cambios: Partial<Pick<ConfigSucursal, "imprime_terminal" | "espera_segundos">>) => cfg && correr({
    accion: "configurar", sucursal_id: sucursal.id, imprime_terminal: cfg.imprime_terminal,
    espera_segundos: cfg.espera_segundos, propina_en_terminal: cfg.propina_en_terminal, ...cambios,
  }, "Guardado.");

  if (!cfg) {
    return (
      <Tarjeta titulo={sucursal.nombre} descripcion="Esta sucursal todavía no cobra con terminal desde la caja.">
        <div className="flex flex-col gap-4">
          {t.conexiones.length > 1 && (
            <div>
              <label className={label} htmlFor={`cuenta-${sucursal.id}`}>Cuenta de Mercado Pago</label>
              <select id={`cuenta-${sucursal.id}`} className={input} value={conexionId} onChange={(e) => setConexionId(e.target.value)}>
                {t.conexiones.map((c) => <option key={c.id} value={c.id}>{c.cuenta_nombre ?? "Cuenta de Mercado Pago"}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={label} htmlFor={`mapa-${sucursal.id}`}>Ubicación del local</label>
            <input
              id={`mapa-${sucursal.id}`} className={input} value={mapa} onChange={(e) => setMapa(e.target.value)}
              placeholder="21.12345, -101.67890 o el enlace de Google Maps"
            />
            <p className="mt-1.5 text-13 text-ink-3">Mercado Pago la pide para registrar la sucursal. En Google Maps: clic derecho sobre tu local y copia los números.</p>
          </div>
          <div><Button disabled={ocupado || !conexionId || mapa.trim() === ""} onClick={ligar}>Usar terminal en esta sucursal</Button></div>
        </div>
      </Tarjeta>
    );
  }

  const cuenta = t.conexiones.find((c) => c.id === cfg.conexion_id);
  return (
    <Tarjeta titulo={sucursal.nombre} descripcion={<>Cobra en <b className="text-ink">{cuenta?.cuenta_nombre ?? "tu cuenta de Mercado Pago"}</b>.</>}>
      <div className="flex flex-col gap-4">
        <Interruptor
          etiqueta="La terminal imprime su comprobante"
          descripcion={cfg.imprime_terminal ? "Imprime su comprobante después de cada cobro." : "No imprime nada; el ticket lo da la caja."}
          encendido={cfg.imprime_terminal} ocupado={ocupado}
          onCambiar={(v) => void configurar({ imprime_terminal: v })}
        />
        <div className="max-w-[260px]">
          <label className={label} htmlFor={`espera-${sucursal.id}`}>Tiempo para pagar en la terminal</label>
          <select
            id={`espera-${sucursal.id}`} className={input} value={cfg.espera_segundos} disabled={ocupado}
            onChange={(e) => void configurar({ espera_segundos: Number(e.target.value) })}
          >
            {ESPERAS.map(([seg, texto]) => <option key={seg} value={seg}>{texto}</option>)}
            {!ESPERAS.some(([seg]) => seg === cfg.espera_segundos) && <option value={cfg.espera_segundos}>{cfg.espera_segundos} segundos</option>}
          </select>
          <p className="mt-1.5 text-13 text-ink-3">Si el cliente no paga en ese tiempo, el cobro se cancela solo.</p>
        </div>

        <div>
          <h3 className="mb-1 text-13 font-bold uppercase tracking-wide text-ink-3">Cajas</h3>
          {cajas.length === 0 && <p className="text-sm text-ink-2">Esta sucursal no tiene cajas activas.</p>}
          <ul className="flex flex-col divide-y divide-line">
            {cajas.map((c) => {
              const d = t.dispositivos.find((x) => x.caja_id === c.id);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-15 font-semibold">{c.nombre}</div>
                    {!d && <div className="text-13 text-ink-3">Sin terminal.</div>}
                    {d && !d.terminal_id_externo && (
                      <div className="text-13 text-ink-2">
                        Enciende la terminal, escanea su código QR con la app de Mercado Pago y elige en ella esta sucursal y esta caja.
                      </div>
                    )}
                    {d?.terminal_id_externo && (
                      <div className="text-13 text-ink-2">
                        Terminal {d.terminal_id_externo.split("__").pop()} ·{" "}
                        {d.activa ? <span className="font-semibold text-success">La caja le manda el cobro</span> : "El monto se teclea en la terminal"}
                      </div>
                    )}
                  </div>
                  {!d && (
                    <Button variant="ghost" disabled={ocupado} onClick={() => void correr({ accion: "caja", caja_id: c.id }, `${c.nombre} quedó registrada en Mercado Pago. Ahora liga su terminal.`)}>
                      Agregar terminal
                    </Button>
                  )}
                  {d && !d.terminal_id_externo && (
                    <Button variant="ghost" disabled={ocupado} onClick={() => void correr({ accion: "terminales", conexion_id: cfg.conexion_id }, "Listo: revisa abajo qué terminal quedó en cada caja.")}>
                      Ya la ligué, buscarla
                    </Button>
                  )}
                  {d?.terminal_id_externo && !d.activa && (
                    <Button disabled={ocupado} onClick={() => void correr({ accion: "modo", caja_id: c.id, modo: "PDV" }, "Listo. Apaga y enciende la terminal para que tome el cambio.")}>
                      Cobrar desde la caja
                    </Button>
                  )}
                  {d?.terminal_id_externo && d.activa && (
                    <AccionFila disabled={ocupado} onClick={() => void correr({ accion: "modo", caja_id: c.id, modo: "STANDALONE" }, "Listo. Apaga y enciende la terminal; el monto se vuelve a teclear en ella.")}>
                      Volver a teclear el monto
                    </AccionFila>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Tarjeta>
  );
}
