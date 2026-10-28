import type { Metadata, Viewport } from "next";
import "./globals.css";
import { RegistrarSw } from "./components/registrar-sw";
import { AjusteTableta } from "./components/ajuste-tableta";

export const metadata: Metadata = {
  title: "VIM POS",
  description: "Punto de venta",
  manifest: "/manifest.webmanifest",
  // iPad no usa el SVG del manifiesto al «Agregar a pantalla de inicio».
  icons: { apple: "/apple-touch-icon.png" },
};

// width=device-width SIN maximum-scale → zoom permitido (a11y, doc 16).
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800&family=Sora:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <RegistrarSw />
        <AjusteTableta />
        {children}
      </body>
    </html>
  );
}
