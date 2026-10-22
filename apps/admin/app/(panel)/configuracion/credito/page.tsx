"use client";
import { Cargando } from "@vim/ui/styles";
import { useEffect, useState } from "react";
import { PageHeader, PageBody } from "../../../components/page-header";
import { Tarjeta } from "../../../components/tarjeta";
import { Interruptor } from "../../../components/interruptor";
import { Segmentos } from "../../../components/controles";
import { useRecargarModulos } from "../../../components/admin-shell";
import { guardarConfigCredito, leerConfigCredito, type AbonosAlCancelar, type ConfigCredito } from "../../../lib/credito";
import { mensajeError } from "../../../lib/errores";

/**
 * La venta a crédito del negocio (0208): el interruptor y qué pasa con lo abonado al cancelar.
 * Se lee de la base al entrar (los módulos del shell son de cuando se abrió el panel).
 */
export default function CreditoConfigPage() {
  const recargarModulos = useRecargarModulos();
  const [config, setConfig] = useState<ConfigCredito | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    leerConfigCredito().then(setConfig).catch((e) => setError(mensajeError(e, "No se pudo leer la venta a crédito")));
  }, []);

  async function cambiar(cambio: Partial<ConfigCredito>) {
    if (!config) return;
    setGuardando(true);
    setError(null);
    try {
      await guardarConfigCredito(cambio);
      setConfig({ ...config, ...cambio });
      if (cambio.activo !== undefined) recargarModulos();
    } catch (e) {
      setError(mensajeError(e, "No se pudo guardar"));
    } finally {
      setGuardando(false);
    }
  }

  return (
    <>
      <PageHeader titulo="Venta a crédito" subtitulo="Clientes de confianza que se llevan hoy y pagan después."
        migas={[{ label: "Configuración" }, { label: "Venta a crédito" }]} />
      <PageBody>
        {error && <p className="mb-4 text-sm font-medium text-danger" role="alert">{error}</p>}
        {config === null ? (
          !error && <Cargando />
        ) : (
          <div className="flex flex-col gap-5">
            <Tarjeta titulo="Vender a crédito">
              <Interruptor
                encendido={config.activo}
                onCambiar={(activo) => void cambiar({ activo })}
                ocupado={guardando}
                etiqueta={config.activo ? "Encendido" : "Apagado"}
                descripcion={config.activo
                  ? "En la caja aparece «A crédito» para los clientes a los que les diste crédito. Dáselo desde Clientes."
                  : "Nadie compra a crédito. Lo que ya se debe se sigue pudiendo abonar en la caja."}
              />
            </Tarjeta>
            <Tarjeta titulo="Al cancelar una venta a crédito con abonos"
              descripcion="Lo que se debía desaparece. Lo que el cliente ya había abonado:">
              <Segmentos<AbonosAlCancelar>
                etiqueta="Qué hacer con lo abonado"
                opciones={[
                  { v: "SALDO_FAVOR", l: "Dejar como saldo a favor" },
                  { v: "EFECTIVO", l: "Regresar en efectivo" },
                ]}
                valor={config.abonosAlCancelar}
                onCambiar={(abonosAlCancelar) => { if (!guardando && abonosAlCancelar !== config.abonosAlCancelar) void cambiar({ abonosAlCancelar }); }}
              />
              <p className="mt-2 text-13 text-ink-2">
                {config.abonosAlCancelar === "SALDO_FAVOR"
                  ? "El cliente lo usa en su siguiente compra como «Saldo a favor»."
                  : "La caja lo entrega y sale del corte del turno."}
              </p>
            </Tarjeta>
          </div>
        )}
      </PageBody>
    </>
  );
}
