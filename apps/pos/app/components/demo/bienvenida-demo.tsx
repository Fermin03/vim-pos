"use client";
import { useState } from "react";
import { Button } from "@vim/ui/styles";
import { iniciarDemo, LLAVE_GUIA } from "../../lib/demo";
import { BrandMark } from "../topbar-pos";

const WHATSAPP = "https://wa.me/525665083346";

/** Pantalla de entrada de la demo pública: reemplaza a «vincular dispositivo». */
export function BienvenidaDemo({ onListo }: { onListo: (conGuia: boolean) => void }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function entrar(conGuia: boolean) {
    if (cargando) return;
    setCargando(true);
    setError(null);
    try {
      await iniciarDemo();
      try {
        window.localStorage.setItem(LLAVE_GUIA, JSON.stringify({ activa: conGuia, indice: 0 }));
      } catch { /* sin almacenamiento la demo corre, solo que sin guía persistente */ }
      onListo(conGuia);
    } catch (e) {
      setError(e instanceof Error ? e.message : "DEMO_ERROR");
      setCargando(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-7 p-6">
      <header className="flex max-w-md flex-col items-center gap-2 text-center">
        <BrandMark size={44} />
        <h1 className="mt-1 font-display text-xl font-semibold tracking-tight">Cobra un turno en Crazy Burgers</h1>
        <p className="text-sm text-ink-3">
          Vas a operar un turno completo en Crazy Burgers, un negocio de ejemplo: abres caja, cobras y haces el corte. Son unos 10 minutos.
        </p>
      </header>
      <div className="flex w-full max-w-sm flex-col gap-3">
        <Button size="lg" disabled={cargando} onClick={() => entrar(true)}>Iniciar demo</Button>
        <Button size="lg" variant="ghost" disabled={cargando} onClick={() => entrar(false)}>Prefiero explorar solo</Button>
        {cargando && <p className="text-center text-sm font-medium text-ink-2" role="status">Preparando tu negocio de ejemplo…</p>}
        {error === "CUPO" && (
          <p className="text-center text-sm font-medium text-danger" role="alert">Ya abriste varias demos desde aquí. Intenta de nuevo en una hora.</p>
        )}
        {error && error !== "CUPO" && (
          <p className="text-center text-sm font-medium text-danger" role="alert">
            La demo no abrió esta vez. Intenta en unos minutos o{" "}
            <a href={WHATSAPP} className="underline" target="_blank" rel="noreferrer">escríbenos por WhatsApp.</a>
          </p>
        )}
      </div>
    </main>
  );
}
