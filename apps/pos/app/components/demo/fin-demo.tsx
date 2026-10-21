"use client";
import { useRef, useState, type FormEvent } from "react";
import { Button, botonClases } from "@vim/ui/styles";
import { LLAVE_GUIA } from "../../lib/demo";

const WHATSAPP = "https://wa.me/525665083346";
const PRECIOS = "https://vimpos.com.mx/precios";
/** URL COMPLETA de la función `solicitar-demo`. Sin ella el formulario no se muestra. */
const PROSPECTOS_URL = process.env.NEXT_PUBLIC_VIM_PROSPECTOS_URL;

const campo = "h-11 w-full rounded border border-line-strong px-3 text-sm outline-none focus:border-ink";

type Envio = "libre" | "enviando" | "ok" | "error";

/** Pantalla final de la guía (paso 17): WhatsApp, precios y un contacto opcional. */
export function FinDemo() {
  const abiertoEn = useRef(Date.now());
  const [envio, setEnvio] = useState<Envio>("libre");

  function seguirExplorando() {
    try {
      window.localStorage.setItem(LLAVE_GUIA, JSON.stringify({ activa: false, indice: 0 }));
    } catch { /* sin almacenamiento la guía vuelve a leerse como activa; no hay más que hacer */ }
  }

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!PROSPECTOS_URL || envio === "enviando") return;
    const f = new FormData(e.currentTarget);
    setEnvio("enviando");
    try {
      const res = await fetch(PROSPECTOS_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: f.get("nombre"),
          whatsapp: f.get("whatsapp"),
          negocio: f.get("negocio"),
          // El handler exige estos tres; la demo es de un mostrador.
          giro: "QUICK_SERVICE",
          cajas: 1,
          sucursales: 1,
          origen: "demo-autoguiada",
          sitio_web: "",
          abierto_en: abiertoEn.current,
        }),
      });
      setEnvio(res.ok ? "ok" : "error");
    } catch {
      setEnvio("error");
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-ink/55 p-4">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="fin-demo-titulo"
        className="flex w-full max-w-md flex-col gap-5 rounded-lg bg-surface p-6 shadow-xl"
      >
        <header className="flex flex-col gap-2">
          <h2 id="fin-demo-titulo" className="font-display text-xl font-semibold tracking-tight">
            Así de fácil es un turno con VIM POS
          </h2>
          <p className="text-14 leading-snug text-ink-2">
            Abriste caja, cobraste con pago dividido y cerraste el turno con su corte. ¿Platicamos cómo quedaría con tu menú?
          </p>
        </header>

        <div className="flex flex-col gap-3 sm:flex-row">
          <a href={WHATSAPP} target="_blank" rel="noreferrer" className={`${botonClases({ size: "lg" })} flex-1`}>
            Hablar con VIM por WhatsApp
          </a>
          <a href={PRECIOS} target="_blank" rel="noreferrer" className={`${botonClases({ variant: "ghost", size: "lg" })} flex-1`}>
            Ver precios
          </a>
        </div>

        {PROSPECTOS_URL && (
          <div className="flex flex-col gap-3 border-t border-line pt-4">
            {envio === "ok" ? (
              <p role="status" className="text-14 font-medium text-ink">Listo, te escribimos pronto por WhatsApp.</p>
            ) : (
              <form onSubmit={enviar} className="flex flex-col gap-3">
                <h3 className="font-display text-15 font-semibold">Déjanos tu WhatsApp y te escribimos</h3>
                <input className={campo} name="nombre" required minLength={2} maxLength={120} autoComplete="name" placeholder="Tu nombre" aria-label="Tu nombre" />
                <input className={campo} name="whatsapp" required type="tel" inputMode="tel" maxLength={40} autoComplete="tel" placeholder="Tu WhatsApp" aria-label="Tu WhatsApp" />
                <input className={campo} name="negocio" required minLength={2} maxLength={150} placeholder="Nombre de tu negocio" aria-label="Nombre de tu negocio" />
                {envio === "error" && (
                  <p role="alert" className="text-13 font-medium text-danger">
                    No se pudo enviar. Intenta otra vez o escríbenos directo por WhatsApp.
                  </p>
                )}
                <Button type="submit" variant="ghost" disabled={envio === "enviando"}>Enviar</Button>
              </form>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={seguirExplorando}
          className="self-center text-13 font-semibold text-ink-3 underline-offset-2 hover:text-ink hover:underline"
        >
          Seguir explorando
        </button>
      </section>
    </div>
  );
}
