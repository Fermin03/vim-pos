"use client";
import { useEffect, useState } from "react";
import { Aviso, Button, botonClases, cn } from "@vim/ui/styles";
import { BotonCopiar } from "./boton-copiar";
import { label } from "./campos";
import { Interruptor } from "./interruptor";
import { Tarjeta } from "./tarjeta";
import { LineaMensaje, type MensajeTienda } from "./tienda-mensaje";
import { listarServicios, servicioEnLinea, type Servicio } from "../lib/agenda";
import { precioMxn } from "../lib/catalogo";
import { mensajeError } from "../lib/errores";
import { fechaHoraMx } from "../lib/reportes-inventario";
import {
  INTERVALOS, RESERVAS_POR_OMISION, encenderReservas, enlaceReservas, guardarReglasReservas, leerConfigReservas, leerReembolsosPorResolver,
  reglasReservasSchema, whatsappCompartir, type ConfigReservas, type ReembolsoPorResolver,
} from "../lib/reservas";

const campoCorto = "h-11 w-28 rounded border border-line-strong px-3 text-sm tabular-nums outline-none focus:border-ink disabled:opacity-50";
const ayuda = "mt-1 text-12 text-ink-3";

type Bloque = "estado" | "reglas" | `servicio:${string}`;
type Campos = { dias: string; intervalo: string; avisoHoras: string };
const camposDe = (c: ConfigReservas): Campos => ({ dias: String(c.dias), intervalo: String(c.intervalo), avisoHoras: String(c.avisoHoras) });

/**
 * Pestaña Reservas (belleza, entrega 3): el interruptor, las reglas de los horarios que se ofrecen,
 * qué servicios se reservan en línea, el enlace para compartir y los reembolsos que Mercado Pago no
 * pudo hacer. TEXTOS PROVISIONALES (los revisa James).
 */
export function ReservasEnLinea({ direccion, soloLectura }: {
  /** La dirección guardada de la tienda; null = todavía no hay página. */
  direccion: string | null;
  soloLectura: boolean;
}) {
  const [config, setConfig] = useState<ConfigReservas | null>(null);
  const [campos, setCampos] = useState<Campos>(camposDe(RESERVAS_POR_OMISION));
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [reembolsos, setReembolsos] = useState<ReembolsoPorResolver[]>([]);
  const [falloLectura, setFalloLectura] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Bloque | null>(null);
  const [mensaje, setMensaje] = useState<{ bloque: Bloque; m: MensajeTienda } | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([leerConfigReservas(), listarServicios(), leerReembolsosPorResolver()]).then(
      ([c, s, r]) => { if (!vivo) return; setConfig(c); setCampos(camposDe(c)); setServicios(s.filter((x) => x.activo)); setReembolsos(r); },
      (e) => { if (vivo) setFalloLectura(mensajeError(e, "No se pudieron leer tus reservas.")); },
    );
    return () => { vivo = false; };
  }, []);

  /** Una escritura a la vez; true = la base la aceptó. */
  async function escribir(bloque: Bloque, accion: () => Promise<void>, exito: string | null): Promise<boolean> {
    if (ocupado) return false;
    setOcupado(bloque);
    setMensaje(null);
    try {
      await accion();
      if (exito) setMensaje({ bloque, m: { tipo: "ok", texto: exito } });
      return true;
    } catch (e) {
      setMensaje({ bloque, m: { tipo: "error", texto: mensajeError(e, "No se pudo guardar") } });
      return false;
    } finally {
      setOcupado(null);
    }
  }
  const mensajeDe = (b: Bloque) => (mensaje?.bloque === b ? mensaje.m : null);

  if (falloLectura) return <p className="text-sm font-medium text-danger" role="alert">{falloLectura}</p>;
  if (!config) return <p className="text-sm text-ink-3">Cargando…</p>;

  async function cambiarEncendido(activo: boolean) {
    if (await escribir("estado", () => encenderReservas(activo), null)) setConfig((c) => c && { ...c, activo });
  }

  async function guardarReglas() {
    const p = reglasReservasSchema.safeParse({
      dias: campos.dias === "" ? NaN : Number(campos.dias), intervalo: Number(campos.intervalo), avisoHoras: campos.avisoHoras === "" ? NaN : Number(campos.avisoHoras),
    });
    if (!p.success) return setMensaje({ bloque: "reglas", m: { tipo: "error", texto: p.error.issues[0]?.message ?? "Revisa los datos" } });
    if (await escribir("reglas", () => guardarReglasReservas(p.data), "Cambios guardados.")) setConfig((c) => c && { ...c, ...p.data });
  }

  async function cambiarServicio(s: Servicio, enLinea: boolean) {
    if (await escribir(`servicio:${s.id}`, () => servicioEnLinea(s.id, enLinea), null)) {
      setServicios((l) => l.map((x) => (x.id === s.id ? { ...x, enLinea } : x)));
    }
  }

  const enlace = direccion ? enlaceReservas(direccion) : null;
  const sinServicios = !servicios.some((s) => s.enLinea);
  const quieto = soloLectura || ocupado !== null;

  return (
    <>
      {reembolsos.length > 0 && (
        <Tarjeta titulo="Reembolsos por resolver">
          <Aviso tono="warning" role="alert">Mercado Pago no pudo devolver este anticipo. Devuélvelo a mano desde tu cuenta de Mercado Pago.</Aviso>
          <ul className="mt-3 divide-y divide-line">
            {reembolsos.map((r) => (
              <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2.5">
                <div className="min-w-0">
                  <div className="text-14 font-semibold">{r.clienta}</div>
                  <div className="text-12 text-ink-3">
                    {r.cita ? `Cita del ${fechaHoraMx(r.cita)}` : "Cita"} · pagado el {fechaHoraMx(r.fecha)}
                  </div>
                </div>
                <div className="text-14 font-semibold tabular-nums">{precioMxn(r.monto)}</div>
              </li>
            ))}
          </ul>
          {/* ponytail: aún no hay cómo marcarlo resuelto (la tienda tampoco lo tiene); por ahora solo se lista. */}
        </Tarjeta>
      )}

      <Tarjeta titulo="Estado">
        <Interruptor
          etiqueta="Reservas en línea"
          encendido={config.activo}
          ocupado={ocupado === "estado"}
          // Apagar siempre se puede; encender, con la página creada.
          deshabilitado={soloLectura || (!config.activo && !direccion)}
          onCambiar={(v) => void cambiarEncendido(v)}
          descripcion={
            <>
              <span role="status">{config.activo ? "Encendidas: tus clientas ya pueden apartar." : "Apagadas: nadie puede reservar en línea."}</span>
              {!direccion && <span className="mt-0.5 block text-ink-3">Primero guarda la dirección de tu página en General.</span>}
              {direccion && config.activo && sinServicios && <span className="mt-0.5 block text-warning">Marca abajo al menos un servicio para que se pueda reservar.</span>}
            </>
          }
        />
        <LineaMensaje mensaje={mensajeDe("estado")} className="mt-3" />
      </Tarjeta>

      <Tarjeta titulo="Horarios que se ofrecen">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div>
            <label className={label} htmlFor="res-dias">Días hacia adelante</label>
            <input id="res-dias" className={campoCorto} inputMode="numeric" maxLength={3} value={campos.dias} disabled={soloLectura}
              aria-describedby="res-dias-ayuda" onChange={(e) => setCampos({ ...campos, dias: e.target.value.replace(/\D/g, "") })} />
            <p id="res-dias-ayuda" className={ayuda}>De 1 a 120.</p>
          </div>
          <div>
            <label className={label} htmlFor="res-intervalo">Cada cuántos minutos</label>
            <select id="res-intervalo" className={cn(campoCorto, "w-32")} value={campos.intervalo} disabled={soloLectura}
              aria-describedby="res-intervalo-ayuda" onChange={(e) => setCampos({ ...campos, intervalo: e.target.value })}>
              {INTERVALOS.map((n) => <option key={n} value={n}>{n} min</option>)}
            </select>
            <p id="res-intervalo-ayuda" className={ayuda}>Cada cuánto empieza un horario.</p>
          </div>
          <div>
            <label className={label} htmlFor="res-aviso">Anticipación mínima (horas)</label>
            <input id="res-aviso" className={campoCorto} inputMode="numeric" maxLength={2} value={campos.avisoHoras} disabled={soloLectura}
              aria-describedby="res-aviso-ayuda" onChange={(e) => setCampos({ ...campos, avisoHoras: e.target.value.replace(/\D/g, "") })} />
            <p id="res-aviso-ayuda" className={ayuda}>De 0 a 72.</p>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 border-t border-line pt-4">
          <LineaMensaje mensaje={mensajeDe("reglas")} />
          <Button onClick={() => void guardarReglas()} disabled={quieto}>{ocupado === "reglas" ? "Guardando…" : "Guardar"}</Button>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Servicios" descripcion="Los que tus clientas pueden apartar desde tu página. Los demás se agendan en la caja.">
        {servicios.length === 0 ? (
          <p className="text-13 text-ink-3">Aún no tienes servicios activos. Dalos de alta en Agenda › Servicios.</p>
        ) : (
          <ul className="flex flex-col divide-y divide-line">
            {servicios.map((s) => (
              <li key={s.id} className="py-3 first:pt-0 last:pb-0">
                <Interruptor
                  etiqueta={s.nombre}
                  nombreAccesible={`${s.nombre}: se reserva en línea`}
                  encendido={s.enLinea}
                  ocupado={ocupado === `servicio:${s.id}`}
                  deshabilitado={soloLectura}
                  onCambiar={(v) => void cambiarServicio(s, v)}
                  descripcion={`${s.enLinea ? "Se reserva en línea" : "Solo en la caja"} · ${s.duracionMin} min · ${precioMxn(s.precio)}`}
                />
                <LineaMensaje mensaje={mensajeDe(`servicio:${s.id}`)} className="mt-2 pl-14" />
              </li>
            ))}
          </ul>
        )}
      </Tarjeta>

      {enlace && (
        <Tarjeta titulo="Compartir">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 break-all text-14 font-medium text-ink">{enlace}</p>
            <BotonCopiar valor={enlace} etiqueta="el enlace de tus reservas" alto="h-11" />
          </div>
          {!config.activo && <p className="mt-2 text-13 text-ink-2">El enlace funciona cuando enciendas las reservas.</p>}
          <div className="mt-4">
            <a href={whatsappCompartir(enlace)} target="_blank" rel="noopener noreferrer" className={botonClases({ variant: "ghost" })}>
              Compartir por WhatsApp
            </a>
          </div>
        </Tarjeta>
      )}
    </>
  );
}
