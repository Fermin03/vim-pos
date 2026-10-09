"use client";
import { useRef } from "react";
import { QRCodeCanvas } from "qrcode.react";
import { Button, botonClases } from "@vim/ui/styles";
import { BotonCopiar } from "./boton-copiar";
import { Tarjeta } from "./tarjeta";
import { BASE_TIENDA, TIENDA_SIN_COMPLEMENTO } from "../lib/tienda-reglas";

/** Bloque 5: el enlace y el QR de la tienda. Solo existe con una dirección ya guardada. */
export function TiendaCompartir({ direccion, encendida, enPlan }: {
  direccion: string;
  encendida: boolean;
  /** false = el complemento venció: encenderla no está en manos del dueño. */
  enPlan: boolean;
}) {
  const lienzo = useRef<HTMLCanvasElement>(null);
  const enlace = `https://${BASE_TIENDA}/${direccion}`;

  function descargar() {
    if (!lienzo.current) return;
    const a = document.createElement("a");
    a.href = lienzo.current.toDataURL("image/png");
    a.download = `qr-${direccion}.png`;
    a.click();
  }

  return (
    <Tarjeta titulo="Compartir">
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 break-all text-14 font-medium text-ink">{enlace}</p>
        <BotonCopiar valor={enlace} etiqueta="el enlace de tu tienda" alto="h-11" />
      </div>
      {!encendida && (
        <p className="mt-2 text-13 text-ink-2">
          {enPlan ? "El enlace funciona cuando enciendas tu tienda." : TIENDA_SIN_COMPLEMENTO}
        </p>
      )}

      <div className="mt-5 flex flex-wrap items-end gap-4">
        {/* 512 px por dentro para que el PNG descargado sirva para imprimir; en pantalla, 192.
            El margen blanco es parte del código: sin él, impreso sobre un fondo de color no se lee. */}
        <QRCodeCanvas
          ref={lienzo}
          value={enlace}
          size={512}
          level="M"
          marginSize={4}
          role="img"
          aria-label="Código QR de tu tienda"
          style={{ width: 192, height: 192 }}
          className="flex-shrink-0 rounded border border-line"
        />
        <Button variant="ghost" onClick={descargar}>Descargar QR</Button>
        {/* Apagada, la dirección da 404: el enlace aparece cuando ya hay algo que ver. */}
        {encendida && (
          <a href={enlace} target="_blank" rel="noopener noreferrer" className={botonClases({ variant: "ghost" })}>Ver mi tienda</a>
        )}
      </div>
    </Tarjeta>
  );
}
