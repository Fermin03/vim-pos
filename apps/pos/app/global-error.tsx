"use client";
import { useEffect } from "react";
import { reportarErrorSinEsperar } from "./lib/reportar-error";
// Último recurso: error en el layout raíz. Reemplaza todo el árbol, así que incluye <html><body>
// y usa estilos inline (no se garantiza el CSS global). Mantiene la marca y un botón de reintento.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = error.digest ? `ERR-${error.digest.slice(0, 8).toUpperCase()}` : null;
  // Este boundary reemplaza el árbol entero; si algo llega hasta aquí, la caja quedó inservible.
  // Es el error que más urge que VIM vea, así que se reporta antes de pintar nada.
  useEffect(() => {
    reportarErrorSinEsperar(error, { origen: "global-error", digest: error.digest ?? null });
  }, [error]);
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", background: "#FFFFFF", color: "#16161A" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
          {/* El isotipo va en línea y no como <LogoVim/>: esta pantalla es el último recurso cuando
              la app entera falló, así que no depende de ningún componente del paquete de UI. */}
          <svg viewBox="0 0 1080 1080" style={{ width: 36, height: 36, marginBottom: 20 }} role="img" aria-label="VIM POS">
            <polygon fill="#0078C9" points="0 0 0 908.18 180 1080 360 908.18 540 1080 720 908.18 900 1080 1080 908.18 1080 0 0 0" />
            <path fill="#FFFFFF" d="M595.3,712.37c-10.37,25.06-36.29,33.7-55.3,33.7s-45.79-8.64-56.16-33.7l-212.55-486.43c-4.32-9.5-6.05-18.14-6.05-26.78,0-34.56,32.83-57.02,64.8-57.02,21.6,0,42.34,10.37,51.84,34.56l158.11,388.8,157.25-388.8c9.5-24.19,30.24-34.56,51.84-34.56,31.97,0,65.66,23.33,65.66,57.89,0,7.78-1.73,16.42-6.05,25.92l-213.41,486.43Z" />
          </svg>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#ECECE9", lineHeight: 1 }}>500</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "8px 0 0" }}>Algo salió mal de nuestro lado</h1>
          <p style={{ fontSize: 15, color: "#76767E", maxWidth: 420, margin: "8px 0 0" }}>
            Tuvimos un problema técnico. Vuelve a intentarlo en un momento.
          </p>
          <button onClick={reset} style={{ marginTop: 24, background: "#0078C9", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Reintentar
          </button>
          {ref && <code style={{ marginTop: 24, fontSize: 13, color: "#8E8E94" }}>{ref}</code>}
        </div>
      </body>
    </html>
  );
}
