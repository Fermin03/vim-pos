"use client";
import { TiendaCombos } from "../../../components/tienda-combos";
import { TiendaMenu } from "../../../components/tienda-menu";
import { TiendaMarco } from "../marco";

/** Pestaña Menú: qué se vende en la tienda de cada sucursal. */
export default function TiendaMenuPage() {
  return (
    <TiendaMarco>
      {({ t, soloLectura }) => t.leido && (
        <>
          <TiendaMenu sucursales={t.leido.sucursales} soloLectura={soloLectura} />
          {t.leido.enPlan && <TiendaCombos combos={t.leido.combosNoComprables} />}
        </>
      )}
    </TiendaMarco>
  );
}
