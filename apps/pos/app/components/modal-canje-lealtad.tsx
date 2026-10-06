"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Aviso, Button, Modal } from "@vim/ui/styles";
import { leerTotales } from "../lib/cobro";
import { leerEnvioDelTicket } from "../lib/descuento";
import { fmtMxn } from "../lib/turno";
import {
  consultarSaldo, leerCanjeDelTicket, leerClienteLealtad, leerPremios, leerPrograma, quitarCanje,
  type CanjeVivo, type ClienteLealtad,
} from "../lib/lealtad";
import {
  cantidad, fechaCorta, maximoCanjeDinero, mensajeErrorLealtad, premiosConFaltante,
  type Premio, type Programa,
} from "../lib/lealtad-reglas";
import {
  almacenLocal, avanzarCanje, borrarPendiente, leerPendiente, nuevoCanjeDinero, nuevoCanjePremio, opsReales,
  type Pendiente,
} from "../lib/lealtad-canje";

type Datos = {
  programa: Programa;
  premios: Premio[];
  cliente: ClienteLealtad;
  canje: CanjeVivo | null;
  total: number;
  envio: number;
};

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const encabezado = "mb-2 text-12 font-bold uppercase tracking-wide text-ink-3";

/**
 * Lealtad de la cuenta (ADR 0030): saldo del cliente, canjear y quitar el canje. Autocontenido: lee
 * programa, premios, cliente, canje y total por su cuenta, para montarse igual desde la captura que
 * desde la lista de cuentas. La cuenta YA debe estar guardada: el canje nace atado a su ticket.
 */
export function ModalCanjeLealtad({
  token,
  ticketId,
  clienteId,
  sucursalId,
  onCambio,
  onCerrar,
}: {
  token: string;
  ticketId: string;
  clienteId: string;
  sucursalId: string;
  /** La cuenta cambió: hay que releerla. `premioAplicado` = entró un producto gratis que cocina debe recibir. */
  onCambio: (r: { premioAplicado: boolean }) => void | Promise<void>;
  onCerrar: () => void;
}) {
  const [datos, setDatos] = useState<Datos | null>(null);
  /** Saldo de la NUBE: el único contra el que se canjea. null = todavía no llega o no se pudo leer. */
  const [saldo, setSaldo] = useState<{ saldo: number; venceEl: string | null } | null>(null);
  const [sinSaldo, setSinSaldo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [puntos, setPuntos] = useState("");
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [confirmandoQuitar, setConfirmandoQuitar] = useState(false);
  const [confirmandoDescartar, setConfirmandoDescartar] = useState(false);
  const almacen = useMemo(() => almacenLocal(), []);
  const vivo = useRef(true);
  // Se vuelve a marcar vivo al montar: en modo estricto React monta, desmonta y remonta, y sin esto
  // `vivo` se quedaba en false para siempre y el modal nunca salía de «Cargando…».
  useEffect(() => { vivo.current = true; return () => { vivo.current = false; }; }, []);

  const cargar = useCallback(async () => {
    try {
      const [programa, premios, cliente, canje, tot, envio] = await Promise.all([
        leerPrograma(token),
        leerPremios(token),
        leerClienteLealtad(token, clienteId),
        leerCanjeDelTicket(token, ticketId),
        leerTotales(token, ticketId),
        leerEnvioDelTicket(token, ticketId).catch(() => 0),
      ]);
      if (!vivo.current) return;
      if (!programa) { setError(mensajeErrorLealtad("SIN_PROGRAMA")); return; }
      if (!cliente) { setError("La cuenta ya no tiene a ese cliente."); return; }
      setDatos({ programa, premios, cliente, canje, total: tot.total, envio });
      setPendiente(leerPendiente(almacen, ticketId));
      setConfirmandoDescartar(false);
      // El saldo de la nube es también la prueba de conexión: en la caja, `online` solo dice que el
      // gateway local responde, no que haya internet.
      const s = await consultarSaldo(token, { clienteId, telefono: cliente.telefono });
      if (!vivo.current) return;
      if (s.ok) {
        setSaldo({ saldo: s.saldo, venceEl: s.vence_el });
        setSinSaldo(null);
        setPuntos(String(maximoCanjeDinero(s.saldo, tot.total, envio) || ""));
      } else {
        setSaldo(null);
        setSinSaldo(mensajeErrorLealtad(s.error));
      }
    } catch (e) {
      if (vivo.current) setError(e instanceof Error ? e.message : "No se pudo cargar la lealtad");
    }
  }, [token, ticketId, clienteId, almacen]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** La operación ya ocurrió: que falle el refresco de la pantalla de atrás no se reporta como canje fallido. */
  async function avisarCambio(r: { premioAplicado: boolean }) {
    try { await onCambio(r); } catch { /* ya pasó; el padre se releerá en su próximo ciclo */ }
  }

  async function ejecutar(p: Pendiente) {
    setOcupado(true);
    setConfirmandoDescartar(false);
    setError(null);
    setAviso(null);
    try {
      const r = await avanzarCanje(opsReales(token), almacen, p);
      if (r.estado === "APLICADO") {
        await avisarCambio({ premioAplicado: p.premio !== null });
        onCerrar();
        return;
      }
      if (r.estado === "RECHAZADO") setError(r.mensaje);
      else setAviso(r.mensaje);
      // El renglón del premio pudo quedarse en la cuenta aunque el canje no entrara: la cuenta cambió.
      if (p.premio) await avisarCambio({ premioAplicado: false });
      await cargar();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar el canje");
    } finally {
      if (vivo.current) setOcupado(false);
    }
  }

  async function quitar() {
    setOcupado(true);
    setError(null);
    try {
      await quitarCanje(token, ticketId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo quitar el canje");
      setOcupado(false);
      return;
    }
    await avisarCambio({ premioAplicado: false });
    onCerrar();
  }

  function descartarPendiente() {
    borrarPendiente(almacen, ticketId);
    setPendiente(null);
    setConfirmandoDescartar(false);
    setAviso("Canje descartado.");
  }

  const m = datos?.programa.mecanica ?? "PUNTOS_DINERO";
  const esDinero = m === "PUNTOS_DINERO";
  const maximo = datos && saldo ? maximoCanjeDinero(saldo.saldo, datos.total, datos.envio) : 0;
  const puntosNum = Number(puntos || 0);
  const puntosValidos = Number.isInteger(puntosNum) && puntosNum >= 1 && puntosNum <= maximo;
  const nombrePremio = datos?.canje?.premioId ? datos.premios.find((p) => p.id === datos.canje?.premioId)?.nombre ?? "Producto de premio" : null;

  return (
    <Modal
      open
      onClose={ocupado ? () => {} : onCerrar}
      title="Lealtad"
      hideTitle
      className="w-[440px] rounded-lg border border-line bg-surface p-6 shadow-[0_18px_44px_rgba(22,22,26,.18)]"
    >
      <div className="mb-5">
        <h2 className="font-display text-xl font-semibold tracking-tight">Lealtad{datos ? ` de ${datos.cliente.nombre}` : ""}</h2>
        <p className="mt-0.5 text-13 text-ink-3">
          {!datos && !error && "Cargando…"}
          {datos && saldo && (
            <>Saldo: <span className="font-semibold tabular-nums text-ink">{cantidad(m, saldo.saldo)}</span>{saldo.venceEl ? ` · vence el ${fechaCorta(saldo.venceEl)}` : ""}</>
          )}
          {datos && !saldo && !sinSaldo && "Consultando el saldo…"}
        </p>
      </div>

      {/* Canje a medias: lo primero, porque hay puntos del cliente en el aire. */}
      {datos && pendiente && (
        <Aviso tono="warning" role="alert" className="mb-4">
          <div>
            Hay un canje a medias de {cantidad(pendiente.mecanica, pendiente.puntos)}
            {pendiente.premio ? ` (${pendiente.premio.nombre})` : ""} en esta cuenta.
          </div>
          {confirmandoDescartar ? (
            <>
              <p className="mt-2">
                {pendiente.paso === "ASENTAR"
                  ? `La nube ya descontó ${cantidad(pendiente.mecanica, pendiente.puntos)}. Si descartas, vuelven solos al cliente en un máximo de 48 horas; desde la caja no se pueden devolver antes.`
                  : `Si la nube alcanzó a descontar ${cantidad(pendiente.mecanica, pendiente.puntos)}, vuelven solos al cliente en un máximo de 48 horas.`}
                {pendiente.premio?.ticketItemId
                  ? ` ${pendiente.premio.nombre} se queda en la cuenta a su precio: cancélalo desde la cuenta si el cliente no lo quiere.`
                  : ""}
              </p>
              <div className="mt-2 flex gap-2">
                <Button variant="ghost" onClick={() => setConfirmandoDescartar(false)} disabled={ocupado}>Volver</Button>
                <Button variant="danger" onClick={descartarPendiente} disabled={ocupado}>Descartar canje</Button>
              </div>
            </>
          ) : (
            <div className="mt-2 flex gap-2">
              <Button onClick={() => void ejecutar(pendiente)} disabled={ocupado}>{ocupado ? "Reintentando…" : "Reintentar"}</Button>
              <Button variant="ghost" onClick={() => setConfirmandoDescartar(true)} disabled={ocupado}>Descartar</Button>
            </div>
          )}
        </Aviso>
      )}

      {/* Canje ya aplicado a la cuenta. */}
      {datos?.canje && !pendiente && (
        <div className="mb-4">
          <div className={encabezado}>Canje en esta cuenta</div>
          <div className="flex items-center justify-between gap-3 rounded border border-success-line bg-success-soft px-3 py-2">
            <div className="min-w-0">
              <div className="truncate text-13 font-semibold text-success">
                {nombrePremio ? `Premio: ${nombrePremio}` : "Puntos por dinero"}
              </div>
              <div className="text-12 tabular-nums text-ink-2">
                {cantidad(m, datos.canje.puntos)} · −{fmtMxn(datos.canje.monto)}
              </div>
            </div>
            {!confirmandoQuitar && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => setConfirmandoQuitar(true)}
                className="h-11 flex-shrink-0 rounded border border-line-strong bg-surface px-3 text-14 font-semibold text-ink-2 transition hover:border-ink hover:text-ink active:scale-[.97] disabled:opacity-40"
              >
                Quitar
              </button>
            )}
          </div>
          {confirmandoQuitar && (
            <div className="mt-2 rounded border border-line bg-hover p-3">
              <p className="text-13 text-ink-2">
                {cantidad(m, datos.canje.puntos)} vuelven a {datos.cliente.nombre} y la cuenta sube {fmtMxn(datos.canje.monto)}.
                {nombrePremio ? ` ${nombrePremio} se queda en la cuenta a su precio: cancélalo desde la cuenta si ya no lo quiere.` : ""}
              </p>
              <div className="mt-3 flex justify-end gap-2">
                <Button variant="ghost" onClick={() => setConfirmandoQuitar(false)} disabled={ocupado}>Volver</Button>
                <Button variant="danger" onClick={() => void quitar()} disabled={ocupado}>{ocupado ? "Quitando…" : "Quitar canje"}</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Sin saldo de la nube no se canjea: se dice por qué. Quitar un canje sí se puede sin internet. */}
      {datos && sinSaldo && !pendiente && (
        <Aviso tono="warning" className="mb-4">{sinSaldo}</Aviso>
      )}

      {/* Canjear puntos por dinero. */}
      {datos && saldo && !datos.canje && !pendiente && esDinero && (
        maximo < 1 ? (
          <Aviso tono="info" className="mb-4">
            {saldo.saldo < 1 ? "Este cliente todavía no tiene puntos para canjear." : "En esta cuenta no hay nada que cubrir con puntos."}
          </Aviso>
        ) : (
          <div className="mb-4">
            <label className="mb-1.5 block text-13 font-medium text-ink-2" htmlFor="lea-puntos">
              Puntos a usar (1 punto = $1, hasta {maximo})
            </label>
            <div className="relative mb-4">
              <input
                id="lea-puntos"
                className={input}
                value={puntos}
                inputMode="numeric"
                autoFocus
                onChange={(e) => setPuntos(e.target.value.replace(/\D/g, ""))}
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-ink-3">puntos</span>
            </div>
            <div className="rounded-lg border border-line bg-hover p-3 text-14">
              <div className="flex justify-between text-ink-2">
                <span>Total actual</span><span className="tabular-nums">{fmtMxn(datos.total)}</span>
              </div>
              <div className="mt-1 flex justify-between text-ink-2">
                <span>Canje</span><span className="tabular-nums text-success">−{fmtMxn(puntosValidos ? puntosNum : 0)}</span>
              </div>
              {datos.envio > 0 && (
                <div className="mt-1 text-12 text-ink-3">El envío ({fmtMxn(datos.envio)}) no se cubre con puntos.</div>
              )}
              <div className="mt-2 flex justify-between border-t border-line pt-2 font-display text-16 font-bold">
                <span>Nuevo total</span><span className="tabular-nums">{fmtMxn(Math.max(0, datos.total - (puntosValidos ? puntosNum : 0)))}</span>
              </div>
            </div>
          </div>
        )
      )}

      {/* Premios (sellos o puntos por premios). */}
      {datos && saldo && !datos.canje && !pendiente && !esDinero && (
        <div className="mb-4">
          <div className={encabezado}>Premios</div>
          {datos.premios.length > 0 && (
            <p className="mb-2 text-12 text-ink-3">El producto entra a la cuenta en $0.00. Una cuenta con premio no se factura de forma individual.</p>
          )}
          {datos.premios.length === 0 && <p className="py-2 text-13 text-ink-3">El negocio todavía no tiene premios.</p>}
          <div className="flex max-h-[300px] flex-col gap-1.5 overflow-y-auto">
            {premiosConFaltante(datos.premios, saldo.saldo).map((p) => (
              <button
                key={p.id}
                type="button"
                disabled={ocupado || !p.alcanza}
                onClick={() => void ejecutar(nuevoCanjePremio({ ticketId, sucursalId, cliente: datos.cliente, mecanica: m, premio: p }))}
                className="flex min-h-[48px] w-full items-center justify-between gap-3 rounded border border-line-strong bg-surface px-3 py-2.5 text-left transition hover:border-ink active:scale-[.98] disabled:cursor-default disabled:opacity-40 disabled:hover:border-line-strong disabled:active:scale-100"
              >
                <span className="min-w-0 truncate text-14 font-semibold">{p.nombre}</span>
                <span className="flex-shrink-0 text-13 font-semibold tabular-nums text-ink-2">
                  {p.alcanza ? cantidad(m, p.costo) : `Faltan ${cantidad(m, p.falta)}`}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {aviso && <Aviso tono="warning" role="alert" className="mb-3">{aviso}</Aviso>}
      {error && <p className="mb-3 text-sm font-medium text-danger" role="alert">{error}</p>}

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" onClick={onCerrar} disabled={ocupado}>Cerrar</Button>
        {datos && saldo && !datos.canje && !pendiente && esDinero && maximo >= 1 && (
          <Button
            onClick={() => void ejecutar(nuevoCanjeDinero({ ticketId, sucursalId, cliente: datos.cliente, mecanica: m, puntos: puntosNum }))}
            disabled={ocupado || !puntosValidos}
          >
            {ocupado ? "Canjeando…" : `Canjear ${puntosValidos ? cantidad(m, puntosNum) : "puntos"}`}
          </Button>
        )}
      </div>
    </Modal>
  );
}
