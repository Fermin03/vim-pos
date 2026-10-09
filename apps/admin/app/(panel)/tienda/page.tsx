"use client";
import { DialogoPeligro } from "@vim/ui/styles";
import { PageBody, PageHeader } from "../../components/page-header";
import { useAccesoTenant } from "../../components/admin-shell";
import { TiendaCompartir } from "../../components/tienda-compartir";
import { TiendaDatos } from "../../components/tienda-datos";
import { TiendaEstado } from "../../components/tienda-estado";
import { TiendaPedidos } from "../../components/tienda-pedidos";
import { TiendaSucursales } from "../../components/tienda-sucursales";
import { useTienda } from "./use-tienda";

/**
 * Tienda en línea: una sola página con el interruptor, los datos de la tienda, cómo entran los
 * pedidos, las sucursales con su horario y el enlace para compartir. El layout ya decidió que el negocio tiene el complemento.
 *
 * El estado vive en `use-tienda.ts`; los bloques solo pintan lo que reciben.
 */
export default function TiendaPage() {
  const t = useTienda();
  // Servicio suspendido: el panel queda en solo lectura (ADR 0014).
  const soloLectura = useAccesoTenant().nivel === "bloqueado";
  const escribiendo = t.ocupado !== null;
  // Tampoco se guarda nada mientras falte volver a leer después de un guardado.
  const ocupado = escribiendo || t.sinLeer;

  return (
    <>
      <PageHeader titulo="Tienda en línea" subtitulo="Recibe los pedidos de tus clientes en tu caja." />
      <PageBody>
        {t.falloLectura ? (
          <div className="max-w-[720px] rounded-lg border border-line bg-surface p-5" role="alert">
            <p className="text-sm font-medium text-danger">{t.falloLectura}</p>
            <p className="mt-1 text-13 text-ink-2">Tu tienda sigue como estaba. Revisa tu conexión y vuelve a intentar.</p>
            <button type="button" onClick={t.reintentar}
              className="mt-4 h-11 rounded border border-line-strong px-3 text-13 font-semibold text-ink-2 transition-colors hover:border-ink hover:text-ink active:scale-[.97] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
              Reintentar
            </button>
          </div>
        ) : t.leido === null ? (
          <p className="text-sm text-ink-3">Cargando…</p>
        ) : (
          <div className="flex flex-col gap-6">
            <TiendaEstado
              encendida={t.encendida}
              enPlan={t.leido.enPlan}
              revision={t.revision}
              ocupado={ocupado}
              soloLectura={soloLectura}
              mensaje={t.mensajeDe("estado")}
              onCambiar={t.cambiarEncendido}
            />
            <TiendaDatos
              valores={t.form}
              logoUrl={t.leido.config?.logoUrl ?? null}
              hayDireccion={t.leido.config !== null}
              logoOcupado={t.ocupado === "logo"}
              mensajeLogo={t.mensajeDe("logo")}
              guardando={t.ocupado === "datos"}
              ocupado={ocupado}
              soloLectura={soloLectura}
              mensaje={t.mensajeDe("datos")}
              onCambio={t.cambiar}
              onGuardar={t.guardarDatos}
              onSubirLogo={t.subirLogo}
              onQuitarLogo={t.quitarLogo}
            />
            <TiendaPedidos
              valores={t.form}
              hayDireccion={t.leido.config !== null}
              guardando={t.ocupado === "pedidos"}
              ocupado={ocupado}
              soloLectura={soloLectura}
              mensaje={t.mensajeDe("pedidos")}
              onCambio={t.cambiar}
              onGuardar={t.guardarPedidos}
            />

            <TiendaSucursales
              sucursales={t.leido.sucursales}
              guardando={t.sucursalGuardando}
              ocupado={ocupado}
              soloLectura={soloLectura}
              mensajeDe={t.mensajeDeSucursal}
              onGuardar={t.guardarSucursal}
            />

            {t.leido.config && <TiendaCompartir direccion={t.leido.config.direccion} encendida={t.encendida} enPlan={t.leido.enPlan} />}
          </div>
        )}
      </PageBody>

      {t.dialogo === "apagar" && (
        <DialogoPeligro
          titulo="¿Apagar tu tienda en línea?"
          consecuencia="Tus clientes dejarán de poder pedir. Los pedidos que ya entraron se atienden igual."
          error={t.errorDialogo}
          boton="Apagar"
          ocupado={escribiendo}
          textoOcupado="Apagando…"
          ancho="sm"
          onConfirmar={t.confirmarApagar}
          onCerrar={t.cerrarDialogo}
        />
      )}

      {t.dialogo === "direccion" && (
        <DialogoPeligro
          titulo="¿Cambiar la dirección de tu tienda?"
          consecuencia="Dejarán de funcionar los códigos QR que ya imprimiste y los enlaces de seguimiento de los pedidos en curso."
          error={t.errorDialogo}
          boton="Cambiar dirección"
          ocupado={escribiendo}
          textoOcupado="Cambiando…"
          ancho="sm"
          onConfirmar={t.confirmarDireccion}
          onCerrar={t.cerrarDialogo}
        />
      )}
    </>
  );
}
