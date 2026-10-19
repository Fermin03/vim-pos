"use client";
import { useEffect, useState } from "react";
import { Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { input, label } from "../../../components/campos";
import { guardarTolerancia, leerTolerancia, toleranciaValida } from "../../../lib/agenda";
import { mensajeError } from "../../../lib/errores";

/** La tolerancia de la agenda (0218): cuántos minutos se espera a un cliente antes de pintarlo «Pasó la tolerancia». */
export default function AgendaConfigPage() {
  const [actual, setActual] = useState<number | null>(null);
  const [minutos, setMinutos] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    leerTolerancia()
      .then((m) => { setActual(m); setMinutos(String(m)); })
      .catch((e) => setError(mensajeError(e, "No se pudo leer la agenda")));
  }, []);

  async function guardar() {
    setGuardando(true);
    setError(null);
    try {
      await guardarTolerancia(Number(minutos));
      setActual(Number(minutos));
      setOkMsg("Tolerancia guardada.");
      setTimeout(() => setOkMsg(null), 2500);
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  const valido = toleranciaValida(minutos);
  const sinCambio = valido && Number(minutos) === actual;

  return (
    <>
      <PageHeader titulo="Agenda" subtitulo="Cómo trata la recepción a los clientes que llegan tarde."
        migas={[{ label: "Configuración" }, { label: "Agenda" }]} />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {okMsg && <p className="mb-4 text-sm font-medium text-success">{okMsg}</p>}
        {actual === null ? (
          !error && <p className="text-sm text-ink-3">Cargando…</p>
        ) : (
          <Tarjeta titulo="Tolerancia" descripcion="Pasados estos minutos, la cita se ve como «Pasó la tolerancia». Marcar «No llegó» siempre lo decide la recepción.">
            <form className="flex max-w-[320px] items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valido) void guardar(); }}>
              <div className="flex-1">
                <label className={label} htmlFor="agenda-tolerancia">Tolerancia para llegar (minutos)</label>
                <input id="agenda-tolerancia" className={input} inputMode="numeric" value={minutos} onChange={(e) => setMinutos(e.target.value)} aria-invalid={!valido} />
              </div>
              <Button type="submit" disabled={guardando || !valido || sinCambio}>Guardar</Button>
            </form>
            {!valido && <p className="mt-2 text-13 text-danger">Escribe de 0 a 120 minutos.</p>}
          </Tarjeta>
        )}
      </PageBody>
    </>
  );
}
