"use client";
import { label } from "./campos";
import { DIAS, copiarATodos, cruzaMedianoche, type Dia, type Horario } from "../lib/tienda-reglas";

/** Un día recién marcado como abierto empieza con este rango. */
const DE_INICIO: [string, string] = ["13:00", "22:00"];

// En celular el campo va a 16 px: con menos, iOS hace zoom al tocarlo.
const hora =
  "h-11 w-full rounded border border-line-strong px-3 text-16 tabular-nums outline-none focus:border-ink focus:shadow-[0_0_0_3px_rgba(22,22,26,.06)] disabled:opacity-50 sm:w-32 sm:text-sm";

/**
 * El horario de una semana: siete renglones, uno por día. Controlado y sin saber de sucursales.
 * Un día sin rango está cerrado. En celular las dos horas se apilan debajo del nombre del día.
 */
export function TiendaHorario({
  valor,
  onCambiar,
  deshabilitado = false,
  errores = {},
}: {
  valor: Horario;
  onCambiar: (h: Horario) => void;
  deshabilitado?: boolean;
  /** El error de cada día, junto a su renglón. */
  errores?: Partial<Record<Dia, string>>;
}) {
  const primerAbierto = DIAS.find(({ dia }) => valor[dia])?.dia;

  function abrir(dia: Dia, abre: boolean) {
    const h = { ...valor };
    if (abre) h[dia] = DE_INICIO;
    else delete h[dia];
    onCambiar(h);
  }

  return (
    <fieldset>
      <legend className={label}>Horario</legend>
      <ul className="divide-y divide-line">
        {DIAS.map(({ dia, nombre }) => {
          const rango = valor[dia];
          const error = errores[dia];
          return (
            <li key={dia} className="py-1.5">
              <div className="flex flex-col gap-x-4 gap-y-2 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex items-center justify-between gap-3 sm:w-44">
                  <span className="text-14 font-medium text-ink">{nombre}</span>
                  <label className="flex min-h-[44px] cursor-pointer items-center gap-2 text-14 text-ink-2">
                    <input
                      type="checkbox"
                      className="h-5 w-5 flex-shrink-0 accent-ink"
                      aria-label={`${nombre}: abre`}
                      checked={rango !== undefined}
                      disabled={deshabilitado}
                      onChange={(e) => abrir(dia, e.target.checked)}
                    />
                    Abre
                  </label>
                </div>

                {rango && (
                  <>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      <input
                        type="time"
                        className={hora}
                        aria-label={`${nombre}: apertura`}
                        aria-invalid={error ? true : undefined}
                        value={rango[0]}
                        disabled={deshabilitado}
                        onChange={(e) => onCambiar({ ...valor, [dia]: [e.target.value, rango[1]] })}
                      />
                      <span className="hidden text-13 text-ink-3 sm:inline" aria-hidden="true">a</span>
                      <input
                        type="time"
                        className={hora}
                        aria-label={`${nombre}: cierre`}
                        aria-invalid={error ? true : undefined}
                        value={rango[1]}
                        disabled={deshabilitado}
                        onChange={(e) => onCambiar({ ...valor, [dia]: [rango[0], e.target.value] })}
                      />
                    </div>
                    {cruzaMedianoche(rango) && <span className="text-12 text-ink-3">Cierra al día siguiente</span>}
                    {dia === primerAbierto && (
                      <button
                        type="button"
                        disabled={deshabilitado}
                        onClick={() => onCambiar(copiarATodos(valor, dia))}
                        className="h-11 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink active:scale-[.97] disabled:opacity-50 sm:ml-auto"
                      >
                        Copiar a todos los días
                      </button>
                    )}
                  </>
                )}
              </div>
              {error && <p role="alert" className="pb-1.5 pt-1 text-12 text-danger">{error}</p>}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
