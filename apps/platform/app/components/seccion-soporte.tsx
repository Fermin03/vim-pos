"use client";
import { useCallback, useEffect, useState } from "react";
import { Aviso } from "@vim/ui/styles";
import { enlaceWhatsapp, normalizarWhatsapp, whatsappLegible, whatsappValido } from "@vim/db/soporte";
import { useSesion } from "../lib/sesion";
import { hace } from "../lib/tipos";
import { input, label } from "../lib/formato";
import { DialogoConfirmar } from "./dialogo-confirmar";
import type { Soporte } from "../lib/soporte";

type Form = { whatsapp: string; horario: string; correo: string };
const aForm = (d: Partial<Soporte> | null): Form => ({ whatsapp: d?.whatsapp ?? "", horario: d?.horario ?? "", correo: d?.correo ?? "" });

/**
 * Soporte de VIM (0142): el WhatsApp al que escriben TODOS los clientes desde el admin ("Ayuda por
 * WhatsApp") y desde la caja (menú y pantalla de bloqueo). A la caja le llega en el siguiente
 * latido (~10 min) y lo guarda, así que un número mal escrito deja a los clientes sin ayuda aun
 * sin internet: se confirma escribiendo TODOS, como los datos de pago.
 */
export function SeccionSoporte() {
  const { api } = useSesion();
  const [form, setForm] = useState<Form>(aForm(null));
  const [guardado, setGuardado] = useState<Form>(aForm(null));
  const [actualizado, setActualizado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api("/api/soporte");
      const d = (r.datos ?? null) as (Soporte & { updated_at?: string }) | null;
      setForm(aForm(d)); setGuardado(aForm(d)); setActualizado(d?.updated_at ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [api]);
  useEffect(() => { void cargar(); }, [cargar]);

  const numero = normalizarWhatsapp(form.whatsapp.trim());
  const numeroMal = !whatsappValido(numero);
  const sucio = (["whatsapp", "horario", "correo"] as const).some((c) => form[c].trim() !== guardado[c].trim());
  const prueba = numeroMal ? null : enlaceWhatsapp(numero, "Prueba del número de soporte de VIM POS.");

  async function guardar({ motivo }: { motivo: string }) {
    setOcupado(true);
    try {
      await api("/api/soporte", {
        method: "PUT",
        body: JSON.stringify({ whatsapp: form.whatsapp, horario: form.horario || null, correo: form.correo || null, motivo }),
      });
      setConfirmando(false);
      setListo(true);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  const cambiar = (c: keyof Form) => (e: React.ChangeEvent<HTMLInputElement>) => { setForm({ ...form, [c]: e.target.value }); setListo(false); };

  return (
    <section className="mt-10">
      <h2 className="mb-1 font-display text-18 font-semibold tracking-tight">Soporte</h2>
      <p className="mb-4 text-13 text-ink-3">
        El WhatsApp al que escriben los clientes con <b>Ayuda por WhatsApp</b>, en su panel y en la caja (también en la pantalla de
        bloqueo). La caja lo recibe en su siguiente latido y lo conserva sin internet.
      </p>

      {error && <Aviso tono="danger" role="alert" className="mb-4">{error}</Aviso>}
      {cargando && <p className="text-13 text-ink-3">Cargando…</p>}

      {!cargando && (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
          <div>
            <label className={label} htmlFor="sop-whatsapp">WhatsApp de soporte</label>
            <input id="sop-whatsapp" className={input} value={form.whatsapp} inputMode="tel" placeholder="525665083346"
              onChange={cambiar("whatsapp")} autoComplete="off" />
            {numeroMal ? (
              <p className="mt-1 text-12 font-semibold text-danger" role="alert">Con lada de país (52), de 10 a 15 dígitos. Es obligatorio.</p>
            ) : (
              <p className="mt-1 text-12 text-ink-3">
                Se verá como {whatsappLegible(numero)}.{" "}
                {prueba && <a className="font-semibold text-ink underline underline-offset-2" href={prueba} target="_blank" rel="noopener noreferrer">Probar el enlace</a>}
              </p>
            )}
          </div>
          <div>
            <label className={label} htmlFor="sop-horario">Horario de atención (opcional)</label>
            <input id="sop-horario" className={input} value={form.horario} maxLength={80} placeholder="9:00 a 18:00"
              onChange={cambiar("horario")} autoComplete="off" />
            <p className="mt-1 text-12 text-ink-3">Sale junto al botón: «Atendemos de {form.horario.trim() || "…"}».</p>
          </div>
          <div>
            <label className={label} htmlFor="sop-correo">Correo de soporte (opcional)</label>
            <input id="sop-correo" className={input} value={form.correo} inputMode="email" placeholder="soporte@…"
              onChange={cambiar("correo")} autoComplete="off" />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={!sucio || numeroMal || ocupado}
              className="btn h-10 rounded bg-ink px-4 text-13 font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              Guardar…
            </button>
            {listo && !sucio && <span className="text-13 font-semibold text-success" aria-live="polite">Guardado.</span>}
            {!listo && actualizado && <span className="text-12 text-ink-3">Última edición {hace(actualizado)}</span>}
          </div>
        </div>
      )}

      <DialogoConfirmar
        abierto={confirmando}
        onCerrar={() => setConfirmando(false)}
        titulo="Cambiar el WhatsApp de soporte"
        descripcion={<>Todos los clientes escribirán a este número desde su panel y desde la caja. Las cajas lo guardan: si está mal, se quedan sin ayuda aunque no tengan internet.</>}
        nombreEsperado="TODOS"
        faltaNombre="escribir TODOS"
        etiquetaBoton="Guardar soporte"
        ocupado={ocupado}
        onConfirmar={guardar}
      />
    </section>
  );
}
