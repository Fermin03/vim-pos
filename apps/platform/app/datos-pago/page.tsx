"use client";
import { useCallback, useEffect, useState } from "react";
import { Aviso } from "@vim/ui/styles";
import { clabeValida } from "@vim/db/cobro";
import { useSesion } from "../lib/sesion";
import { hace } from "../lib/tipos";
import { input, label } from "../lib/formato";
import { DialogoConfirmar } from "../components/dialogo-confirmar";
import { CAMPOS_DATOS_PAGO, type DatosPago } from "../lib/datos-pago";

type Form = Record<(typeof CAMPOS_DATOS_PAGO)[number], string>;
const VACIO: Form = { banco: "", titular: "", clabe: "", whatsapp: "", correo: "", instrucciones: "" };

const aForm = (d: Partial<DatosPago> | null): Form => ({
  banco: d?.banco ?? "", titular: d?.titular ?? "", clabe: d?.clabe ?? "",
  whatsapp: d?.whatsapp ?? "", correo: d?.correo ?? "", instrucciones: d?.instrucciones ?? "",
});

/**
 * Datos de pago (0141): a qué cuenta le transfiere el cliente y a quién le manda el comprobante.
 * Los ve cada dueño en "Plan y pagos". Guardar afecta a TODOS los clientes a la vez —una CLABE mal
 * escrita manda los pagos de todos a otra cuenta—, así que se confirma escribiendo TODOS, como un
 * aviso importante a todos (platform.md).
 */
export default function DatosPagoPage() {
  const { api } = useSesion();
  const [form, setForm] = useState<Form>(VACIO);
  const [guardado, setGuardado] = useState<Form>(VACIO);
  const [actualizado, setActualizado] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [listo, setListo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await api("/api/datos-pago");
      const d = (r.datos ?? null) as (DatosPago & { updated_at?: string }) | null;
      setForm(aForm(d)); setGuardado(aForm(d)); setActualizado(d?.updated_at ?? null);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setCargando(false);
    }
  }, [api]);
  useEffect(() => { void cargar(); }, [cargar]);

  const sucio = CAMPOS_DATOS_PAGO.some((c) => form[c].trim() !== guardado[c].trim());
  const clabe = form.clabe.replace(/[\s-]/g, "");
  const clabeMal = clabe !== "" && !clabeValida(clabe);

  async function guardar({ motivo }: { motivo: string }) {
    setOcupado(true);
    try {
      await api("/api/datos-pago", { method: "PUT", body: JSON.stringify({ ...form, motivo }) });
      setConfirmando(false);
      setListo(true);
      await cargar();
    } finally {
      setOcupado(false);
    }
  }

  const campo = (c: keyof Form, titulo: string, extra?: { ayuda?: string; placeholder?: string; inputMode?: "numeric" | "email" | "tel" }) => (
    <div>
      <label className={label} htmlFor={`dp-${c}`}>{titulo}</label>
      <input
        id={`dp-${c}`}
        className={input}
        value={form[c]}
        inputMode={extra?.inputMode}
        placeholder={extra?.placeholder}
        onChange={(e) => { setForm({ ...form, [c]: e.target.value }); setListo(false); }}
        autoComplete="off"
      />
      {extra?.ayuda && <p className="mt-1 text-12 text-ink-3">{extra.ayuda}</p>}
    </div>
  );

  return (
    <div className="max-w-[640px]">
      <h2 className="mb-1 font-display text-18 font-semibold tracking-tight">Datos de pago</h2>
      <p className="mb-4 text-13 text-ink-3">
        Lo que ve cada cliente en <b>Configuración → Plan y pagos</b> para pagar su mensualidad y mandar el comprobante. Si un campo
        queda vacío, al cliente no se le muestra.
      </p>

      {error && <Aviso tono="danger" role="alert" className="mb-4">{error}</Aviso>}
      {cargando && <p className="text-13 text-ink-3">Cargando…</p>}

      {!cargando && (
        <div className="flex flex-col gap-4 rounded-lg border border-line bg-surface p-5">
          {campo("banco", "Banco", { placeholder: "BBVA" })}
          {campo("titular", "Titular de la cuenta", { placeholder: "Como aparece en el estado de cuenta" })}
          <div>
            {campo("clabe", "CLABE", { inputMode: "numeric", ayuda: "18 dígitos. Se revisa el dígito de control antes de guardar." })}
            {clabeMal && <p className="mt-1 text-12 font-semibold text-danger" role="alert">Esta CLABE no es válida. Revísala contra el estado de cuenta.</p>}
          </div>
          {campo("whatsapp", "WhatsApp para comprobantes", { inputMode: "tel", placeholder: "524771234567", ayuda: "Con lada de país (52), solo dígitos. Al cliente le sale un botón con el mensaje ya escrito." })}
          {campo("correo", "Correo para comprobantes", { inputMode: "email", placeholder: "cobranza@…" })}
          <div>
            <label className={label} htmlFor="dp-instrucciones">Instrucciones (opcional)</label>
            <textarea
              id="dp-instrucciones"
              className={`${input} h-20 py-2`}
              value={form.instrucciones}
              maxLength={500}
              onChange={(e) => { setForm({ ...form, instrucciones: e.target.value }); setListo(false); }}
              placeholder="Pon el nombre de tu negocio en el concepto de la transferencia."
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setConfirmando(true)}
              disabled={!sucio || clabeMal || ocupado}
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
        titulo="Cambiar los datos de pago"
        descripcion={<>Todos los clientes verán estos datos desde ya para pagarle a VIM. Si la CLABE está mal, sus pagos se van a otra cuenta.</>}
        nombreEsperado="TODOS"
        etiquetaBoton="Guardar datos de pago"
        ocupado={ocupado}
        onConfirmar={guardar}
      />
    </div>
  );
}
