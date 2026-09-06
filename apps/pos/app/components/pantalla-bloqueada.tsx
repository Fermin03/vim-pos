"use client";
import { useState } from "react";
import { LogoVim } from "@vim/ui/styles";
import { buscarActualizacion } from "../lib/actualizacion";
import type { MotivoBloqueo } from "../lib/directivas";

/** Soporte de VIM. Va aquí y no en un env: el cajero necesita verlo aunque no haya red. */
const TELEFONO_SOPORTE = "477 235 8901";

/**
 * Pantalla de bloqueo. Sin salida y antes del PIN: el cajero no puede cobrar.
 *
 * Lo que NO hace: detener la sincronización. Las ventas que ya están en esta computadora se
 * siguen subiendo, para que un cliente que se ponga al corriente no haya perdido nada. Y lo dice
 * en pantalla, porque la primera pregunta de un dueño bloqueado es "¿y mis ventas?".
 *
 * Dos motivos, dos salidas (ADR 0014, entrega 4). Por suscripción, la única salida es llamar a
 * VIM. Por versión, la salida está en esta misma pantalla: el botón instala la actualización.
 * Un bloqueo por versión SIN una forma de salir sería una trampa, porque a diferencia de la
 * suspensión esta la decide la caja y puede morder sin internet.
 */
export function PantallaBloqueada({
  mensaje,
  negocio,
  motivo = "suscripcion",
}: {
  mensaje: string;
  negocio?: string;
  motivo?: MotivoBloqueo;
}) {
  const porVersion = motivo === "version";
  const [estado, setEstado] = useState<"listo" | "buscando" | "error">("listo");
  const [detalle, setDetalle] = useState<string | null>(null);

  async function actualizar() {
    setEstado("buscando"); setDetalle(null);
    const r = await buscarActualizacion();
    if (r.estado === "error") {
      setEstado("error");
      setDetalle(r.error);
      return;
    }
    if (r.estado === "al-dia") {
      // Pasa cuando esta pantalla es de una segunda caja de la LAN, o cuando el instalador
      // todavía no se publicó donde la caja lo busca. Decirlo es mejor que dejar el botón
      // girando: el cajero necesita saber a quién llamar.
      setEstado("error");
      setDetalle("Esta computadora ya tiene la última versión que encuentra. Si es una segunda caja, actualiza primero la caja principal.");
      return;
    }
    setEstado("listo");
  }

  return (
    <main className="flex h-screen flex-col items-center justify-center gap-4 bg-sel px-8 text-center">
      <LogoVim className="h-12 w-12" />
      {negocio && <div className="font-display text-[15px] font-semibold text-ink-2">{negocio}</div>}
      <h1 className="font-display text-[26px] font-bold tracking-tight text-danger">
        {porVersion ? "Actualiza para seguir vendiendo" : "Esta caja no puede vender"}
      </h1>
      <p className="max-w-md text-[15px] leading-relaxed text-ink-2">{mensaje}</p>

      {porVersion && (
        <>
          <button
            onClick={actualizar}
            disabled={estado === "buscando"}
            className="btn mt-1 h-12 rounded bg-accent px-6 text-[15px] font-semibold text-white hover:bg-accent-hover disabled:opacity-60"
          >
            {estado === "buscando" ? "Buscando la actualización…" : "Instalar la actualización"}
          </button>
          {detalle && <p className="max-w-md text-[13px] text-danger">{detalle}</p>}
          <p className="max-w-md text-[12.5px] text-ink-3">
            VIM POS se cerrará para instalar y volverá a abrirse solo. No pierdes nada de lo que
            ya cobraste.
          </p>
        </>
      )}

      <div className="mt-2 rounded-lg border border-line-strong bg-surface px-5 py-3">
        <div className="text-[12px] font-bold uppercase tracking-wide text-ink-3">Llama a VIM</div>
        <div className="font-display text-[20px] font-bold tabular-nums">{TELEFONO_SOPORTE}</div>
      </div>
      <p className="max-w-md text-[12.5px] text-ink-3">
        Tus ventas anteriores están a salvo y se siguen respaldando en la nube.
      </p>
    </main>
  );
}
