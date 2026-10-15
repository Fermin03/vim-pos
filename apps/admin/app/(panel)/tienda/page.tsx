"use client";
import { TiendaCompartir } from "../../components/tienda-compartir";
import { TiendaDatos } from "../../components/tienda-datos";
import { TiendaEstado } from "../../components/tienda-estado";
import { TiendaMarco } from "./marco";

/** Pestaña General: el interruptor, los datos de la tienda y el enlace para compartir. */
export default function TiendaPage() {
  return (
    <TiendaMarco>
      {({ t, ocupado, soloLectura }) => t.leido && (
        <>
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
          {t.leido.config && <TiendaCompartir direccion={t.leido.config.direccion} encendida={t.encendida} enPlan={t.leido.enPlan} />}
        </>
      )}
    </TiendaMarco>
  );
}
