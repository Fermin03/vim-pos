"use client";
import { PageBody, PageHeader } from "./page-header";
import { PedirModulo } from "./pedir-modulo";
import { TIENDA_INCLUYE, TIENDA_INVITACION, mensajeQuieroTienda } from "../lib/tienda-plan";

/** Lo que ve en Tienda en línea un negocio que todavía no la tiene. */
export function TiendaSinContratar() {
  return (
    <>
      <PageHeader titulo="Tienda en línea" subtitulo="Recibe los pedidos de tus clientes en tu caja." />
      <PageBody>
        <PedirModulo
          titulo="Tu propia tienda en línea"
          texto="Tus clientes piden desde su teléfono, para recoger o a domicilio, y el pedido cae en tu caja. Sin comisión por pedido."
          incluye={TIENDA_INCLUYE}
          cierre={TIENDA_INVITACION.cierre}
          boton={TIENDA_INVITACION.boton}
          mensaje={mensajeQuieroTienda}
        />
      </PageBody>
    </>
  );
}
