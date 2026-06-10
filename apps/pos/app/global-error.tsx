"use client";
// Último recurso: error en el layout raíz. Reemplaza todo el árbol, así que incluye <html><body>
// y usa estilos inline (no se garantiza el CSS global). Mantiene la marca y un botón de reintento.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const ref = error.digest ? `ERR-${error.digest.slice(0, 8).toUpperCase()}` : null;
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", background: "#FFFFFF", color: "#16161A" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: 24 }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "#16161A", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, fontSize: 18, marginBottom: 20 }}>V</div>
          <div style={{ fontSize: 72, fontWeight: 700, color: "#ECECE9", lineHeight: 1 }}>500</div>
          <h1 style={{ fontSize: 24, fontWeight: 600, margin: "8px 0 0" }}>Algo salió mal de nuestro lado</h1>
          <p style={{ fontSize: 15, color: "#76767E", maxWidth: 420, margin: "8px 0 0" }}>
            Tuvimos un problema técnico. Vuelve a intentarlo en un momento.
          </p>
          <button onClick={reset} style={{ marginTop: 24, background: "#E8502E", color: "#fff", border: "none", borderRadius: 10, padding: "11px 22px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Reintentar
          </button>
          {ref && <code style={{ marginTop: 24, fontSize: 13, color: "#8E8E94" }}>{ref}</code>}
        </div>
      </body>
    </html>
  );
}
