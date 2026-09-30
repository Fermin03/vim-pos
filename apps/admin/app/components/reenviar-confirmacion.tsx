"use client";
import { useState } from "react";
import { Captcha, SITE_KEY_TURNSTILE } from "./captcha";
import { ERRORES_REGISTRO, reenviarConfirmacion } from "../lib/registro";
import { mensajeError } from "../lib/errores";

/**
 * "Reenviar el correo de confirmación" (0142). Lo usan el final del registro y el inicio de sesión
 * cuando el correo aún no está confirmado. Lleva su propio captcha: la función lo exige también
 * para reenviar, porque si no, sería una forma gratis de mandar correos a cualquiera.
 *
 * La respuesta es la misma exista o no la cuenta (no se puede usar para averiguar quién está
 * registrado); por eso el texto dice "si hay una cuenta pendiente…".
 */
export function ReenviarConfirmacion({ email }: { email: string }) {
  const [captcha, setCaptcha] = useState("");
  const [reinicio, setReinicio] = useState(0);
  const [estado, setEstado] = useState<"listo" | "enviando" | "enviado">("listo");
  const [error, setError] = useState<string | null>(null);

  async function reenviar() {
    setError(null);
    if (SITE_KEY_TURNSTILE && !captcha) {
      setError("Estamos comprobando que no eres un robot. Intenta de nuevo en un segundo.");
      return;
    }
    setEstado("enviando");
    try {
      const r = await reenviarConfirmacion(email, captcha);
      if (!r.ok) {
        setError(ERRORES_REGISTRO[r.error ?? ""] ?? "No se pudo reenviar. Intenta de nuevo en un momento.");
        setEstado("listo");
      } else {
        setEstado("enviado");
      }
    } catch (e) {
      setError(mensajeError(e, "Sin conexión. Revisa tu internet e intenta de nuevo."));
      setEstado("listo");
    } finally {
      setReinicio((n) => n + 1);   // el token ya se usó
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <Captcha onToken={setCaptcha} reinicio={reinicio} />
      {estado === "enviado" ? (
        <p className="text-14 text-ink-2" role="status">
          Listo. Si hay una cuenta pendiente con <b className="text-ink">{email}</b>, te llega otro correo en unos minutos. Revisa
          también la carpeta de spam o promociones.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void reenviar()}
          disabled={estado === "enviando" || !email}
          className="self-start text-14 font-semibold text-ink underline underline-offset-2 disabled:opacity-50"
        >
          {estado === "enviando" ? "Reenviando…" : "Reenviar el correo de confirmación"}
        </button>
      )}
      {error && <p className="text-13 font-medium text-danger" role="alert">{error}</p>}
    </div>
  );
}
