"use client";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "./page-header";
import { PedirModulo } from "./pedir-modulo";
import { leerOfertaTienda } from "../lib/tienda";
import { TIENDA_INCLUYE, invitacionTienda, type OfertaTienda } from "../lib/tienda-plan";

/** Lo que ve en Tienda en línea un negocio que todavía no la tiene. */
export function TiendaSinContratar() {
  // undefined = leyendo. No se pinta la tarjeta hasta saber qué decir: así nadie ve un cierre que
  // un instante después cambia por otro. null = no se pudo leer → el texto de siempre.
  const [oferta, setOferta] = useState<OfertaTienda | null | undefined>(undefined);
  useEffect(() => { leerOfertaTienda().then(setOferta); }, []);

  if (oferta === undefined) return <PageBody><p className="text-13 text-ink-3">Cargando…</p></PageBody>;
  const invitacion = invitacionTienda(oferta);
  return (
    <>
      <PageHeader titulo="Tienda en línea" subtitulo="Recibe los pedidos de tus clientes en tu caja." />
      <PageBody>
        <PedirModulo
          titulo="Tu propia tienda en línea"
          texto="Tus clientes piden desde su teléfono, para recoger o a domicilio, y el pedido cae en tu caja. Sin comisión por pedido."
          incluye={TIENDA_INCLUYE}
          cierre={invitacion.cierre}
          boton={invitacion.boton}
          mensaje={invitacion.mensaje}
        />
      </PageBody>
    </>
  );
}
