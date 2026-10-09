import type { Metadata, Viewport } from "next";
import "./globals.css";

// Cada negocio pone su propio título y descripción en su página; esto es lo que queda si no hay más.
export const metadata: Metadata = {
  title: "Pedidos en línea · VIM POS",
  description: "Pide en línea para recoger o a domicilio.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1 };

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
