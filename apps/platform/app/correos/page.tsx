"use client";
import { useState } from "react";
import { Aviso, StatusChip } from "@vim/ui/styles";
import { useSesion } from "../lib/sesion";
import { input, label, NOMBRE_ESTADO } from "../lib/formato";
import { DialogoConfirmar } from "../components/dialogo-confirmar";
import type { CuentaPorCorreo } from "../lib/liberar-correo";

const ROL: Record<string, string> = {
  DUENO: "Dueño", ADMIN: "Administrador", SUPERVISOR: "Supervisor", CAJERO: "Cajero",
  REPARTIDOR: "Repartidor", PERSONAL: "Personal", PERSONALIZADO: "Personalizado", DISPOSITIVO: "Caja",
};

/**
 * Liberar un correo (0154, ADR 0028).
 *
 * Llega por soporte: "quiero registrar mi negocio y dice que mi correo ya tiene cuenta". Casi
 * siempre es alguien que fue empleado de otro negocio; su cuenta de empleado sigue ahí, desactivada,
 * ocupando el correo. Aquí se busca por correo y se elimina esa cuenta. El negocio donde trabajó
 * conserva su historial con el nombre de la persona.
 */
export default function CorreosPage() {
  const { api } = useSesion();
  const [email, setEmail] = useState("");
  const [buscado, setBuscado] = useState("");
  const [cuenta, setCuenta] = useState<CuentaPorCorreo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [liberado, setLiberado] = useState<string | null>(null);

  async function buscar(e: React.FormEvent) {
    e.preventDefault();
    const correo = email.trim();
    if (!correo) return;
    setBuscando(true); setError(null); setCuenta(null); setLiberado(null);
    try {
      const r = await api("/api/correos", { method: "POST", body: JSON.stringify({ accion: "buscar", email: correo }) });
      setCuenta(r as unknown as CuentaPorCorreo);
      setBuscado(correo);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo buscar");
    } finally {
      setBuscando(false);
    }
  }

  async function liberar({ motivo }: { motivo: string }) {
    if (!cuenta?.encontrado) return;
    setOcupado(true);
    try {
      await api("/api/correos", {
        method: "POST",
        body: JSON.stringify({ accion: "liberar", email: buscado, usuario_id: cuenta.usuario_id, motivo }),
      });
      setConfirmando(false);
      setCuenta(null);
      setLiberado(buscado);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight">Liberar un correo</h1>
        <p className="mt-1 text-14 text-ink-2">
          Para quien fue empleado de un negocio y ahora quiere registrarse con el mismo correo. Se elimina su cuenta de
          empleado; el negocio donde trabajó conserva sus cortes y ventas con su nombre.
        </p>
      </div>

      <form onSubmit={buscar} className="flex flex-wrap items-end gap-3 rounded-lg border border-line bg-surface p-5">
        <div className="min-w-[240px] flex-1">
          <label className={label} htmlFor="lc-email">Correo</label>
          <input
            id="lc-email"
            type="email"
            className={input}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="persona@correo.com"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        <button
          type="submit"
          disabled={!email.trim() || buscando}
          className="btn h-11 rounded bg-ink px-4 text-13 font-semibold text-white hover:opacity-90 disabled:opacity-50"
        >
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {error && <Aviso tono="danger" role="alert">{error}</Aviso>}

      {liberado && (
        <Aviso tono="success" role="status">
          Listo: <b>{liberado}</b> quedó libre. Esa persona ya puede registrarse.
        </Aviso>
      )}

      {cuenta && !cuenta.encontrado && (
        <Aviso tono="info">
          <b>{buscado}</b> no pertenece a ninguna cuenta: ya está libre. Si aun así el registro lo rechaza, revisa que esté bien escrito.
        </Aviso>
      )}

      {cuenta?.encontrado && (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
          <div>
            <div className="text-12 font-bold uppercase tracking-wide text-ink-3">Cuenta</div>
            <div className="mt-1 font-display text-lg font-semibold">{cuenta.nombre}</div>
            <div className="text-13 text-ink-3">{buscado}</div>
          </div>

          {cuenta.accesos.length > 0 && (
            <ul className="flex flex-col divide-y divide-line rounded border border-line">
              {cuenta.accesos.map((a) => (
                <li key={`${a.tenant_id}-${a.rol}`} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                  <div>
                    <div className="text-14 font-semibold">{a.negocio}</div>
                    <div className="text-13 text-ink-3">{ROL[a.rol] ?? a.rol} · negocio {NOMBRE_ESTADO[a.estado_negocio] ?? a.estado_negocio}</div>
                  </div>
                  <StatusChip tone={a.activo ? "success" : "neutral"}>{a.activo ? "Activo" : "Desactivado"}</StatusChip>
                </li>
              ))}
            </ul>
          )}

          {cuenta.puede_eliminar ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setConfirmando(true)}
                className="btn h-10 rounded bg-danger px-4 text-13 font-semibold text-white hover:opacity-90"
              >
                Liberar correo…
              </button>
              <span className="text-13 text-ink-3">Elimina la cuenta de empleado. No se puede deshacer.</span>
            </div>
          ) : (
            <Aviso tono="warning">
              <b>No se puede liberar desde aquí.</b>
              <ul className="mt-1 list-disc pl-5">
                {cuenta.bloqueos.map((b) => <li key={b.codigo}>{b.mensaje}</li>)}
              </ul>
            </Aviso>
          )}
        </div>
      )}

      <DialogoConfirmar
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo="Liberar este correo"
        descripcion={
          <>
            Se elimina la cuenta de <b>{cuenta?.encontrado ? cuenta.nombre : ""}</b> ({buscado}): pierde su PIN y sus datos de
            contacto, y no podrá volver a entrar a ese negocio. Su historial ahí se conserva con su nombre.
          </>
        }
        nombreEsperado=""
        sinNombre
        conEntiendo="Entiendo que no se puede deshacer."
        etiquetaBoton="Liberar correo"
        textoOcupado="Liberando…"
        peligroso
        ocupado={ocupado}
        onConfirmar={liberar}
      />
    </div>
  );
}
