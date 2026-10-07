"use client";
import { useEffect, useState } from "react";
import { Button, DialogoPeligro } from "@vim/ui/styles";
import type { Mecanica } from "@vim/db/lealtad";
import { PageBody, PageHeader } from "../../components/page-header";
import { LealtadPestanas } from "../../components/lealtad-pestanas";
import {
  FORM_PROGRAMA_INICIAL, activarModuloLealtad, ejemploPrograma, formDePrograma, guardarPrograma, leerLealtadEncendida, leerProgramaAdmin, mensajeLealtad,
  type FormPrograma,
} from "../../lib/lealtad";

const input =
  "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)]";
const label = "mb-1.5 block text-13 font-medium text-ink-2";
const ayuda = "mt-1 text-12 text-ink-3";

const MECANICAS: { codigo: Mecanica; titulo: string; detalle: string }[] = [
  { codigo: "PUNTOS_DINERO", titulo: "Puntos que valen dinero", detalle: "Gana un porcentaje de lo que consume. Cada punto vale $1 en su siguiente compra." },
  { codigo: "SELLOS", titulo: "Sellos por visita", detalle: "Un sello por visita. Al juntar los que tú digas, se lleva un premio." },
  { codigo: "PUNTOS_PREMIOS", titulo: "Puntos por premios", detalle: "Gana puntos según lo que consume y los cambia por los premios que definas." },
];

export default function ProgramaLealtadPage() {
  /** undefined = leyendo; false = todavía no hay programa guardado; true = ya existe. */
  const [existe, setExiste] = useState<boolean | undefined>(undefined);
  const [mecanicaGuardada, setMecanicaGuardada] = useState<Mecanica | null>(null);
  const [form, setForm] = useState<FormPrograma>(FORM_PROGRAMA_INICIAL);
  const [encendido, setEncendido] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  /** Cambiar de mecánica borraría el saldo de estos clientes: se pide confirmación. */
  const [reinicio, setReinicio] = useState<number | null>(null);
  const [apagando, setApagando] = useState(false);

  // El programa y el interruptor se leen de la base cada vez que se entra: el shell solo lee los
  // módulos una vez por sesión y el valor se desfasaría al volver de otra pestaña. El layout ya
  // garantiza que el negocio tiene el permiso, así que la bandera del dueño es el estado efectivo.
  useEffect(() => {
    let vivo = true;
    Promise.all([leerProgramaAdmin(), leerLealtadEncendida()])
      .then(([p, enc]) => {
        if (!vivo) return;
        setExiste(p !== null);
        setEncendido(enc);
        if (p) { setForm(formDePrograma(p)); setMecanicaGuardada(p.mecanica); }
      })
      .catch((e) => { if (vivo) { setExiste(false); setError(mensajeLealtad(e, "No se pudo leer el programa")); } });
    return () => { vivo = false; };
  }, []);

  const set = <K extends keyof FormPrograma>(k: K, v: FormPrograma[K]) => { setForm((f) => ({ ...f, [k]: v })); setError(null); setOk(null); };
  const ejemplo = ejemploPrograma(form);

  async function guardar(confirmarReinicio: boolean) {
    setGuardando(true);
    setError(null);
    setOk(null);
    try {
      const r = await guardarPrograma(form, confirmarReinicio);
      if (!r.ok) { setReinicio(r.clientesConSaldo); return; }
      setReinicio(null);
      setExiste(true);
      setMecanicaGuardada(form.mecanica);
      setOk(r.clientesReiniciados > 0 ? `Programa guardado. Se puso en cero el saldo de ${r.clientesReiniciados} cliente(s).` : "Programa guardado.");
    } catch (e) {
      // Con el diálogo abierto el error se muestra dentro de él; si no, arriba.
      if (!confirmarReinicio) setReinicio(null);
      setError(mensajeLealtad(e, "No se pudo guardar el programa"));
    } finally {
      setGuardando(false);
    }
  }

  async function cambiarEncendido(activo: boolean) {
    setCambiando(true);
    setError(null);
    setOk(null);
    try {
      await activarModuloLealtad(activo);
      setEncendido(activo);
      setApagando(false);
    } catch (e) {
      setError(mensajeLealtad(e, "No se pudo cambiar"));
      setApagando(false);
    } finally {
      setCambiando(false);
    }
  }

  return (
    <>
      <PageHeader titulo="Lealtad" subtitulo="Cómo ganan tus clientes y qué reciben por volver." />
      <PageBody>
        <LealtadPestanas />

        {error && reinicio === null && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {ok && <p className="mb-4 text-sm font-medium text-success" role="status">{ok}</p>}

        {existe === undefined ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : (
          <>
            {/* El interruptor vive aquí, no en Configuración: solo afecta a la lealtad. */}
            <div className="mb-6 flex max-w-[720px] flex-wrap items-start gap-3 rounded-lg border border-line bg-surface p-4">
              <button
                type="button" role="switch" aria-checked={encendido} aria-label="Programa de lealtad"
                disabled={cambiando || !existe}
                onClick={() => (encendido ? setApagando(true) : void cambiarEncendido(true))}
                className={`relative mt-0.5 h-6 w-11 flex-shrink-0 rounded-full transition-colors ${encendido ? "bg-accent" : "bg-line-strong"} disabled:opacity-50`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${encendido ? "left-[22px]" : "left-0.5"}`} />
              </button>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">Programa de lealtad {encendido ? "· Encendido" : "· Apagado"}</div>
                <p className="mt-0.5 text-13 text-ink-2">
                  {!existe
                    ? "Primero guarda tu programa aquí abajo. Después lo enciendes."
                    : encendido
                      ? "Tus clientes ganan y canjean en la caja. Para que cuente, la cuenta debe llevar un cliente asignado."
                      : "Mientras está apagado nadie gana ni canjea. Los saldos se conservan y nada vence."}
                </p>
              </div>
            </div>

            <section className="max-w-[720px] rounded-lg border border-line bg-surface p-5">
              <h2 className="mb-4 font-display text-16 font-semibold tracking-tight">Cómo ganan tus clientes</h2>

              <div role="radiogroup" aria-label="Forma de ganar" className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {MECANICAS.map((m) => {
                  const elegida = form.mecanica === m.codigo;
                  return (
                    <button
                      key={m.codigo} type="button" role="radio" aria-checked={elegida}
                      onClick={() => set("mecanica", m.codigo)}
                      className={[
                        "rounded border p-3 text-left transition active:scale-[.99]",
                        elegida ? "border-ink bg-sel" : "border-line-strong hover:border-ink",
                      ].join(" ")}
                    >
                      <span className="block text-14 font-semibold text-ink">{m.titulo}</span>
                      <span className="mt-1 block text-12 leading-snug text-ink-2">{m.detalle}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                {form.mecanica === "PUNTOS_DINERO" && (
                  <div>
                    <label className={label} htmlFor="lea-porcentaje">Porcentaje que regresa en puntos</label>
                    <input id="lea-porcentaje" className={input} inputMode="decimal" value={form.porcentaje}
                      onChange={(e) => set("porcentaje", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="5" />
                    <p className={ayuda}>De lo que el cliente paga por su consumo. Máximo 50.</p>
                  </div>
                )}
                {form.mecanica === "PUNTOS_PREMIOS" && (
                  <div>
                    <label className={label} htmlFor="lea-pesos">Pesos de compra por cada punto</label>
                    <input id="lea-pesos" className={input} inputMode="decimal" value={form.pesosPorPunto}
                      onChange={(e) => set("pesosPorPunto", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="10" />
                    <p className={ayuda}>Con 10, una compra de $200 da 20 puntos.</p>
                  </div>
                )}
                <div>
                  <label className={label} htmlFor="lea-minima">Compra mínima para ganar</label>
                  <input id="lea-minima" className={input} inputMode="decimal" value={form.compraMinima}
                    onChange={(e) => set("compraMinima", e.target.value.replace(/[^0-9.]/g, ""))} placeholder="0" />
                  <p className={ayuda}>En pesos. Con 0, toda compra gana.</p>
                </div>
                <div>
                  <label className={label} htmlFor="lea-vence">Vencen tras estos meses sin venir</label>
                  <input id="lea-vence" className={input} inputMode="numeric" value={form.vencimientoMeses}
                    onChange={(e) => set("vencimientoMeses", e.target.value.replace(/\D/g, ""))} placeholder="Sin vencimiento" />
                  <p className={ayuda}>Cada compra o canje reinicia la cuenta. Vacío: no vencen.</p>
                </div>
                <div>
                  <label className={label} htmlFor="lea-tope">Compras que suman por cliente al día</label>
                  <input id="lea-tope" className={input} inputMode="numeric" value={form.topeComprasDia}
                    onChange={(e) => set("topeComprasDia", e.target.value.replace(/\D/g, ""))} placeholder="3" />
                  <p className={ayuda}>Evita que una misma persona acumule de más en un día.</p>
                </div>
              </div>

              {/* El ejemplo usa la misma regla que la caja: lo que aquí se promete es lo que se da. */}
              <div className="mt-5 rounded border border-line bg-bg px-4 py-3" aria-live="polite">
                <div className="text-12 font-bold uppercase tracking-wide text-ink-3">Ejemplo</div>
                <p className="mt-1 text-14 text-ink">{ejemplo ?? "Completa los datos de arriba para ver un ejemplo."}</p>
                {form.mecanica !== "PUNTOS_DINERO" && (
                  <p className="mt-1 text-12 text-ink-3">Los premios se definen en la pestaña Premios.</p>
                )}
              </div>

              {existe && mecanicaGuardada && mecanicaGuardada !== form.mecanica && (
                <p className="mt-4 rounded border border-warning-line bg-warning-soft px-3 py-2 text-13 font-medium text-warning">
                  Vas a cambiar la forma de ganar. Los saldos que tus clientes ya tienen no se pueden convertir: quedarán en cero.
                </p>
              )}

              <div className="mt-5 flex items-center justify-end gap-2 border-t border-line pt-4">
                <Button onClick={() => void guardar(false)} disabled={guardando}>{guardando ? "Guardando…" : "Guardar programa"}</Button>
              </div>
            </section>

            <p className="mt-5 max-w-[720px] rounded-lg border border-line bg-surface px-4 py-3 text-13 leading-relaxed text-ink-2">
              Tus cajas necesitan la versión 0.5.0 o una posterior para mostrar la lealtad. Un cambio que hagas aquí llega a cada
              caja en cerca de un minuto. Canjear necesita internet; ganar puntos, no.
            </p>
          </>
        )}
      </PageBody>

      {reinicio !== null && (
        <DialogoPeligro
          titulo="¿Cambiar la forma de ganar?"
          consecuencia={
            <>
              <b className="text-ink">{reinicio} cliente(s)</b> tienen saldo con la forma actual. Al cambiar, su saldo queda en cero.
              No se puede deshacer.
            </>
          }
          error={error}
          boton="Cambiar y poner saldos en cero"
          ocupado={guardando}
          textoOcupado="Cambiando…"
          ancho="sm"
          onConfirmar={() => void guardar(true)}
          onCerrar={() => setReinicio(null)}
        />
      )}

      {apagando && (
        <DialogoPeligro
          titulo="¿Apagar el programa de lealtad?"
          consecuencia="Tus clientes dejan de ganar y de canjear en la caja. Sus saldos se conservan y nada vence mientras esté apagado; puedes volver a encenderlo cuando quieras."
          boton="Apagar"
          ocupado={cambiando}
          textoOcupado="Apagando…"
          ancho="sm"
          onConfirmar={() => void cambiarEncendido(false)}
          onCerrar={() => setApagando(false)}
        />
      )}
    </>
  );
}
