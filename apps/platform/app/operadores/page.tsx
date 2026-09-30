"use client";
import { useCallback, useEffect, useState } from "react";
import { Aviso, Modal, StatusChip, type TonoEstado } from "@vim/ui/styles";
import { useSesion } from "../lib/sesion";
import { hace } from "../lib/tipos";
import { input, label } from "../lib/formato";
import { DialogoConfirmar } from "../components/dialogo-confirmar";
import type { EstadoOperador } from "../lib/operadores";

type Operador = {
  id: string;
  nombre: string;
  email: string | null;
  estado: EstadoOperador;
  activadoEl: string | null;
  invitadoPor: string;
  creadoEl: string;
};

const TONO: Record<EstadoOperador, TonoEstado> = { ACTIVO: "success", PENDIENTE: "warning", DESACTIVADO: "neutral" };
const TEXTO: Record<EstadoOperador, string> = { ACTIVO: "Activo", PENDIENTE: "Pendiente", DESACTIVADO: "Desactivado" };

type Pendiente = { tipo: "desactivar" | "reactivar" | "restablecer"; op: Operador };

/**
 * Operadores del panel (A8): quién de VIM entra aquí, con su propia cuenta.
 *
 * Invitar genera un enlace de un solo uso que se le pasa a la persona (WhatsApp, en mano): con él
 * elige su contraseña y da de alta su app autenticadora. Mientras nadie lo haya hecho, el panel
 * sigue abriendo con la clave compartida; en cuanto el primero termina, la clave deja de servir.
 */
export default function OperadoresPage() {
  const { api, operador: yo } = useSesion();
  const [lista, setLista] = useState<Operador[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [invitando, setInvitando] = useState(false);
  const [enlace, setEnlace] = useState<{ para: string; url: string } | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setLista(((await api("/api/operadores")).operadores ?? []) as Operador[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }, [api]);
  useEffect(() => { void cargar(); }, [cargar]);

  async function aplicar({ motivo }: { motivo: string }) {
    if (!pendiente) return;
    setOcupado(true);
    try {
      const r = await api(`/api/operadores/${pendiente.op.id}`, { method: "PATCH", body: JSON.stringify({ accion: pendiente.tipo, motivo }) });
      if (pendiente.tipo === "restablecer" && typeof r.enlace === "string") setEnlace({ para: pendiente.op.nombre, url: r.enlace });
      setPendiente(null);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  const activados = (lista ?? []).filter((o) => o.estado === "ACTIVO").length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="mb-1 font-display text-18 font-semibold tracking-tight">Operadores</h2>
          <p className="max-w-[640px] text-13 text-ink-3">
            Cada persona de VIM entra con su correo, su contraseña y el código de su app autenticadora. La bitácora dice quién hizo cada cosa.
          </p>
        </div>
        <button onClick={() => setInvitando(true)} className="btn h-10 rounded bg-ink px-4 text-13 font-semibold text-white hover:opacity-90">
          Invitar operador
        </button>
      </div>

      {yo.via === "clave" && (
        <Aviso tono={activados > 0 ? "danger" : "warning"} className="mb-4">
          Entraste con la clave compartida. Sirve solo mientras nadie haya activado su cuenta: invítate a ti mismo, abre el enlace, y
          desde ese momento el panel se abre únicamente con cuentas.
        </Aviso>
      )}

      {error && <Aviso tono="danger" role="alert" className="mb-4">{error}</Aviso>}
      {!lista && !error && <p className="text-13 text-ink-3">Cargando…</p>}
      {lista && lista.length === 0 && <p className="text-13 text-ink-3">Todavía no hay operadores. Invita al primero.</p>}

      {lista && lista.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="w-full text-13">
            <thead className="bg-sel text-ink-3">
              <tr>
                <th className="p-2.5 text-left font-semibold">Nombre</th>
                <th className="p-2.5 text-left font-semibold">Correo</th>
                <th className="p-2.5 text-left font-semibold">Estado</th>
                <th className="p-2.5 text-left font-semibold">Invitado por</th>
                <th className="p-2.5 text-right font-semibold"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody>
              {lista.map((o) => (
                <tr key={o.id} className="border-t border-line">
                  <td className="p-2.5 font-semibold">
                    {o.nombre}
                    {o.id === yo.id && <span className="ml-2 text-12 font-medium text-ink-3">(tú)</span>}
                  </td>
                  <td className="p-2.5 text-ink-2">{o.email ?? "—"}</td>
                  <td className="whitespace-nowrap p-2.5">
                    <StatusChip tone={TONO[o.estado]}>{TEXTO[o.estado]}</StatusChip>
                    {o.activadoEl && <span className="ml-2 text-12 text-ink-3">desde {hace(o.activadoEl)}</span>}
                  </td>
                  <td className="p-2.5 text-ink-2">{o.invitadoPor}</td>
                  <td className="whitespace-nowrap p-2.5 text-right">
                    {/* Nadie se desactiva ni se restablece a sí mismo. */}
                    {o.id !== yo.id && (
                      <div className="flex justify-end gap-2">
                        <button onClick={() => setPendiente({ tipo: "restablecer", op: o })} className="btn h-9 rounded border border-line-strong px-3 text-12 font-semibold text-ink-2 hover:border-ink hover:text-ink">
                          Restablecer acceso
                        </button>
                        {o.estado === "DESACTIVADO" ? (
                          <button onClick={() => setPendiente({ tipo: "reactivar", op: o })} className="btn h-9 rounded border border-line-strong px-3 text-12 font-semibold text-ink-2 hover:border-ink hover:text-ink">
                            Reactivar
                          </button>
                        ) : (
                          <button onClick={() => setPendiente({ tipo: "desactivar", op: o })} className="btn h-9 rounded border border-danger-line px-3 text-12 font-semibold text-danger hover:bg-danger-soft">
                            Desactivar
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invitando && (
        <Invitar
          onCerrar={() => setInvitando(false)}
          onInvitado={async (para, url) => { setInvitando(false); setEnlace({ para, url }); await cargar(); }}
        />
      )}
      {enlace && <EnlaceUnaVez para={enlace.para} url={enlace.url} onCerrar={() => setEnlace(null)} />}

      <DialogoConfirmar
        abierto={pendiente !== null}
        onCerrar={() => setPendiente(null)}
        titulo={
          pendiente?.tipo === "desactivar" ? `¿Desactivar a ${pendiente.op.nombre}?`
            : pendiente?.tipo === "reactivar" ? `¿Reactivar a ${pendiente?.op.nombre}?`
              : `¿Restablecer el acceso de ${pendiente?.op.nombre ?? ""}?`
        }
        descripcion={
          pendiente?.tipo === "desactivar" ? "Deja de entrar al panel en su siguiente clic, aunque tenga la sesión abierta. Se puede reactivar."
            : pendiente?.tipo === "reactivar" ? "Vuelve a entrar con su misma contraseña y su misma app autenticadora."
              : "Se le borra la app autenticadora y se genera un enlace para que elija contraseña y la dé de alta otra vez. Úsalo si perdió el teléfono o la contraseña."
        }
        nombreEsperado={pendiente?.op.nombre ?? ""}
        sinNombre
        etiquetaBoton={pendiente?.tipo === "desactivar" ? "Desactivar" : pendiente?.tipo === "reactivar" ? "Reactivar" : "Generar enlace"}
        peligroso={pendiente?.tipo === "desactivar"}
        ocupado={ocupado}
        onConfirmar={aplicar}
      />
    </div>
  );
}

function Invitar({ onCerrar, onInvitado }: { onCerrar: () => void; onInvitado: (para: string, url: string) => void }) {
  const { api } = useSesion();
  const [nombre, setNombre] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function invitar() {
    setError(null);
    setOcupado(true);
    try {
      const r = await api("/api/operadores", { method: "POST", body: JSON.stringify({ nombre, email }) });
      onInvitado(nombre.trim(), String(r.enlace));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo invitar");
    } finally {
      setOcupado(false);
    }
  }

  return (
    <Modal open onClose={onCerrar} title="Invitar operador" hideTitle className="w-[min(440px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <h2 className="font-display text-20 font-semibold tracking-tight">Invitar operador</h2>
      <p className="mt-2 text-13 leading-snug text-ink-2">
        Usa un correo que sea solo para el panel. Si esa persona también es dueña de un negocio en VIM, usa otro (por ejemplo nombre+panel@…).
      </p>
      <label className={`${label} mt-4`} htmlFor="inv-nombre">Nombre</label>
      <input id="inv-nombre" className={input} value={nombre} onChange={(e) => setNombre(e.target.value)} autoFocus />
      <label className={`${label} mt-3`} htmlFor="inv-email">Correo</label>
      <input id="inv-email" type="email" className={input} value={email} onChange={(e) => setEmail(e.target.value)} onKeyDown={(e) => e.key === "Enter" && void invitar()} />
      {error && <Aviso tono="danger" role="alert" className="mt-3">{error}</Aviso>}
      <div className="mt-5 flex gap-2">
        <button onClick={onCerrar} disabled={ocupado} className="btn h-11 flex-1 rounded border border-line-strong text-14 font-semibold text-ink-2 hover:bg-hover">Volver</button>
        <button onClick={() => void invitar()} disabled={ocupado} className="btn h-11 flex-1 rounded bg-ink text-14 font-semibold text-white hover:opacity-90 disabled:opacity-60">
          {ocupado ? "Generando…" : "Generar enlace"}
        </button>
      </div>
    </Modal>
  );
}

/** El enlace se muestra UNA vez: no se guarda en ningún lado, y quien lo tenga puede activar la cuenta. */
function EnlaceUnaVez({ para, url, onCerrar }: { para: string; url: string; onCerrar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Modal open onClose={onCerrar} title="Enlace de acceso" hideTitle className="w-[min(520px,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-6 shadow-xl">
      <h2 className="font-display text-20 font-semibold tracking-tight">Enlace para {para}</h2>
      <p className="mt-2 text-13 leading-snug text-ink-2">
        Pásaselo por un canal privado. Sirve una sola vez y vence en una hora. Con él elige su contraseña y da de alta su app autenticadora.
      </p>
      <textarea readOnly value={url} className={`${input} mt-4 h-24 resize-none py-2 font-mono text-12`} onFocus={(e) => e.currentTarget.select()} />
      <Aviso tono="warning" className="mt-3">No se vuelve a mostrar. Si se pierde, genera otro con «Restablecer acceso».</Aviso>
      <div className="mt-5 flex gap-2">
        <button onClick={onCerrar} className="btn h-11 flex-1 rounded border border-line-strong text-14 font-semibold text-ink-2 hover:bg-hover">Cerrar</button>
        <button
          onClick={() => void navigator.clipboard.writeText(url).then(() => setCopiado(true))}
          className="btn h-11 flex-1 rounded bg-ink text-14 font-semibold text-white hover:opacity-90"
        >
          {copiado ? "Copiado" : "Copiar enlace"}
        </button>
      </div>
    </Modal>
  );
}
