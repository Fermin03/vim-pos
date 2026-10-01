"use client";
import { useState } from "react";
import type { Api } from "../lib/tipos";
import { hace } from "../lib/tipos";
import { fechaHoraMx } from "../lib/formato";
import type { AccesoDueno as Acceso } from "../lib/acceso-dueno";

/**
 * El acceso del dueño a su panel, dentro del bloque "Alta" de la ficha (roadmap A5).
 *
 * Confirmado: se dice cuándo, y no hay botón — a quien ya entra no se le reenvía nada desde aquí.
 * Sin confirmar: se dice qué correo se le mandó y hace cuánto, y un botón lo reenvía (la
 * invitación si lo dio de alta VIM; la confirmación de registro si se registró solo).
 *
 * Sin diálogo de motivo: no cambia nada del contrato ni de la operación, y el servidor ya limita a
 * un envío por minuto y cinco por hora por negocio. El resultado se dice aquí mismo y se queda
 * hasta el siguiente intento — el refresco de cada minuto de la ficha no lo borra.
 */
export function AccesoDueno({ api, tenantId, dueno, onCambio }: { api: Api; tenantId: string; dueno: Acceso | null | undefined; onCambio: () => Promise<void> }) {
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string } | null>(null);

  if (!dueno) return <p className="mb-2 text-13 text-ink-2">Este negocio no tiene cuenta de dueño.</p>;

  async function reenviar() {
    setEnviando(true); setResultado(null);
    try {
      const r = await api(`/api/tenants/${tenantId}/reenviar-acceso`, { method: "POST" });
      setResultado({ ok: true, texto: String(r.mensaje ?? "Correo reenviado.") });
      await onCambio();
    } catch (e) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : "No se pudo reenviar" });
    } finally {
      setEnviando(false);
    }
  }

  const queCorreo = dueno.tipo === "invitacion" ? "la invitación" : "la confirmación de registro";

  return (
    <div className="mb-3 text-13">
      <div className="break-all font-semibold text-ink">{dueno.email ?? "Sin correo"}</div>
      {dueno.confirmadoEl ? (
        <p className="text-ink-2">
          Correo confirmado el {fechaHoraMx(dueno.confirmadoEl, "corto")}
          {dueno.ultimoAcceso ? ` · entró por última vez ${hace(dueno.ultimoAcceso)}` : " · todavía no ha entrado"}.
        </p>
      ) : (
        <>
          <p className="text-warning">
            <b>No ha confirmado su correo</b>: todavía no puede entrar a su panel.
            {dueno.ultimoEnvio ? ` Se le mandó ${queCorreo} ${hace(dueno.ultimoEnvio)}.` : ""}
          </p>
          <button
            type="button"
            onClick={() => void reenviar()}
            disabled={enviando || !dueno.email}
            className="btn mt-2 h-9 rounded border border-line-strong px-3 text-13 font-semibold hover:bg-hover disabled:opacity-50"
          >
            {enviando ? "Reenviando…" : dueno.tipo === "invitacion" ? "Reenviar invitación" : "Reenviar confirmación"}
          </button>
        </>
      )}
      {resultado && (
        <p className={`mt-2 ${resultado.ok ? "text-success" : "text-danger"}`} role={resultado.ok ? "status" : "alert"}>
          {resultado.texto}
        </p>
      )}
    </div>
  );
}
