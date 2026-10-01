"use client";
import { useEffect, useState } from "react";
import { Captcha, SITE_KEY_TURNSTILE } from "./captcha";
import { ERRORES_REGISTRO, reenviarConfirmacion } from "../lib/registro";
import { mensajeError } from "../lib/errores";

/** GoTrue no reenvía al mismo correo antes de ~60 s; la función aplica lo mismo a todos. */
const ESPERA_SEG = 60;

/**
 * "Reenviar el correo de confirmación" (0142). Lo usan el final del registro y el inicio de sesión
 * cuando el correo aún no está confirmado. Lleva su propio captcha (acción "reenvio"): si no, sería
 * una forma gratis de mandar correos a cualquiera.
 *
 * Tras cada envío el botón espera 60 s, con la cuenta a la vista. La respuesta es la misma exista o
 * no la cuenta; por eso el texto dice "si hay una cuenta pendiente…". Si la función dice que hay
 * que esperar, se dice eso y nunca "Listo". `esperaInicial`: segundos de espera al aparecer (justo
 * después del registro ya salió un correo).
 */
export function ReenviarConfirmacion({ email, esperaInicial = 0 }: { email: string; esperaInicial?: number }) {
  const [captcha, setCaptcha] = useState("");
  const [reinicio, setReinicio] = useState(0);
  const [enviando, setEnviando] = useState(false);
  const [enviado, setEnviado] = useState(false);
  const [espera, setEspera] = useState(esperaInicial);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (espera <= 0) return;
    const t = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [espera]);

  async function reenviar() {
    setError(null);
    if (SITE_KEY_TURNSTILE && !captcha) {
      setError("Estamos comprobando que no eres un robot. Intenta de nuevo en un segundo.");
      return;
    }
    setEnviando(true);
    try {
      const r = await reenviarConfirmacion(email, captcha);
      if (r.ok) {
        setEnviado(true);
        setEspera(ESPERA_SEG);
      } else if (r.error === "ESPERA_UN_MINUTO" || r.error === "DEMASIADOS_INTENTOS" || r.status === 429) {
        setEnviado(false);
        setError(ERRORES_REGISTRO.ESPERA_UN_MINUTO!);
        setEspera(ESPERA_SEG);
      } else {
        setError(ERRORES_REGISTRO[r.error ?? ""] ?? "No se pudo reenviar. Intenta de nuevo en un momento.");
      }
    } catch (e) {
      setError(mensajeError(e, "Sin conexión. Revisa tu internet e intenta de nuevo."));
    } finally {
      setEnviando(false);
      setReinicio((n) => n + 1);   // el token ya se usó
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Captcha onToken={setCaptcha} accion="reenvio" reinicio={reinicio} />
      {enviado && (
        <p className="text-14 text-ink-2" role="status">
          Listo. Si hay una cuenta pendiente con <b className="text-ink">{email}</b>, te llega otro correo en unos minutos. Revisa
          también la carpeta de spam o promociones.
        </p>
      )}
      <button
        type="button"
        onClick={() => void reenviar()}
        disabled={enviando || espera > 0 || !email}
        className="self-start text-14 font-semibold text-ink underline underline-offset-2 disabled:no-underline disabled:opacity-50"
      >
        {enviando ? "Reenviando…" : espera > 0 ? `Puedes pedir otro en ${espera} s` : enviado ? "Reenviar otra vez" : "Reenviar el correo de confirmación"}
      </button>
      {error && <p className="text-13 font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}
