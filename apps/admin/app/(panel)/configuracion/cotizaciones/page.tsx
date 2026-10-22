"use client";
import { useEffect, useState } from "react";
import { Cargando, Button } from "@vim/ui/styles";
import { PageHeader, PageBody } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { Interruptor } from "../../../components/interruptor";
import { input, label } from "../../../components/campos";
import { useRecargarModulos } from "../../../components/admin-shell";
import { guardarConfigCotizaciones, leerConfigCotizaciones, vigenciaValida, type ConfigCotizaciones } from "../../../lib/cotizaciones";
import { mensajeError } from "../../../lib/errores";

/** Las cotizaciones del negocio (0212): el interruptor y cuántos días vale una. Se lee de la base al entrar. */
export default function CotizacionesConfigPage() {
  const recargarModulos = useRecargarModulos();
  const [config, setConfig] = useState<ConfigCotizaciones | null>(null);
  const [dias, setDias] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leerConfigCotizaciones()
      .then((c) => { setConfig(c); setDias(String(c.vigenciaDias)); })
      .catch((e) => setError(mensajeError(e, "No se pudieron leer las cotizaciones")));
  }, []);

  async function cambiar(cambio: Partial<ConfigCotizaciones>) {
    if (!config) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarConfigCotizaciones(cambio);
      setConfig({ ...config, ...cambio });
      if (cambio.activo !== undefined) recargarModulos();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  const valido = vigenciaValida(dias);
  const sinCambio = config !== null && valido && Number(dias) === config.vigenciaDias;

  return (
    <>
      <PageHeader titulo="Cotizaciones" subtitulo="Presupuestos con folio y vigencia que el cliente puede convertir en venta."
        migas={[{ label: "Configuración" }, { label: "Cotizaciones" }]} />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {config === null ? (
          !error && <Cargando />
        ) : (
          <div className="flex flex-col gap-5">
            <Tarjeta titulo="Hacer cotizaciones">
              <Interruptor
                encendido={config.activo}
                onCambiar={(activo) => void cambiar({ activo })}
                ocupado={guardando}
                etiqueta={config.activo ? "Encendido" : "Apagado"}
                descripcion={config.activo
                  ? "En la caja aparece «Cotizar». Una cotización no es una venta: no descuenta existencias ni entra al corte."
                  : "La caja no ofrece cotizar. Las cotizaciones que ya existen se conservan."}
              />
            </Tarjeta>
            <Tarjeta titulo="Vigencia" descripcion="Cuántos días vale una cotización desde el día en que se hace.">
              <form className="flex max-w-[320px] items-end gap-3" onSubmit={(e) => { e.preventDefault(); if (valido) void cambiar({ vigenciaDias: Number(dias) }); }}>
                <div className="flex-1">
                  <label className={label} htmlFor="cot-dias">Vigencia: días</label>
                  <input id="cot-dias" className={input} inputMode="numeric" value={dias} onChange={(e) => setDias(e.target.value)} aria-invalid={!valido} />
                </div>
                <Button type="submit" disabled={guardando || !valido || sinCambio}>Guardar</Button>
              </form>
              {!valido && <p className="mt-2 text-13 text-danger">Escribe de 1 a 365 días.</p>}
            </Tarjeta>
          </div>
        )}
      </PageBody>
    </>
  );
}
