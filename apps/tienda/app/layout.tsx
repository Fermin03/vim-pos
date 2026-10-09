import type { Metadata, Viewport } from "next";
import "./globals.css";
import { BASE_PUBLICA } from "./lib/sitio";

// Cada negocio pone su propio título y descripción en su página; esto es lo que queda si no hay más.
export const metadata: Metadata = {
  metadataBase: new URL(BASE_PUBLICA),
  title: "Pedidos en línea · VIM POS",
  description: "Pide en línea para recoger o a domicilio.",
};

// `viewportFit: "cover"`: sin él, Safari de iOS da 0 en `env(safe-area-inset-*)`, y el pie de la hoja y
// la barra del pedido no sabrían cuánto subir sobre la franja de inicio. A cambio la página llega a
// las orillas con el teléfono acostado: `body` devuelve ese margen (globals.css).
// `interactiveWidget`: en Android el teclado encoge la página y lo pegado abajo queda encima de él.
// iOS lo ignora; ahí lo resuelve la hoja (components/hoja.tsx).
export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", interactiveWidget: "resizes-content" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700&family=Sora:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
