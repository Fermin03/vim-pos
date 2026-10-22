"use client";
import { Cargando } from "@vim/ui/styles";
import { useEffect, useState } from "react";
import { PageBody, PageHeader } from "./page-header";
import { PedirModulo } from "./pedir-modulo";
import { useModulos } from "./admin-shell";
import { leerOfertaTienda } from "../lib/tienda";
import { RESERVAS_INCLUYE, TIENDA_INCLUYE, invitacionTienda, seccionEnLinea, type OfertaTienda } from "../lib/tienda-plan";

/** Lo que ve en Tienda en línea (o En línea, con agenda) un negocio que todavía no tiene el complemento. */
export function TiendaSinContratar() {
  // undefined = leyendo. No se pinta la tarjeta hasta saber qué decir: así nadie ve un cierre que
  // un instante después cambia por otro. null = no se pudo leer → el texto de siempre.
  const seccion = seccionEnLinea(useModulos());
  const [oferta, setOferta] = useState<OfertaTienda | null | undefined>(undefined);
  useEffect(() => { leerOfertaTienda().then(setOferta); }, []);

  if (oferta === undefined) return <PageBody><Cargando /></PageBody>;
  const invitacion = invitacionTienda(oferta);
  return (
    <>
      <PageHeader titulo={seccion.titulo} subtitulo={seccion.subtitulo} />
      <PageBody>
        {/* Con agenda (belleza) el mismo complemento trae las reservas: se ofrece por ahí. TEXTOS PROVISIONALES (los revisa James). */}
        <PedirModulo
          titulo={seccion.agenda ? "Reservas en línea" : "Tu propia tienda en línea"}
          texto={seccion.agenda
            ? "Tus clientas apartan su cita desde su teléfono, a cualquier hora, y la cita cae en tu agenda. Sin comisión por reserva."
            : "Tus clientes piden desde su teléfono, para recoger o a domicilio, y el pedido cae en tu caja. Sin comisión por pedido."}
          incluye={seccion.agenda ? RESERVAS_INCLUYE : TIENDA_INCLUYE}
          cierre={invitacion.cierre}
          boton={invitacion.boton}
          mensaje={invitacion.mensaje}
        />
      </PageBody>
    </>
  );
}
